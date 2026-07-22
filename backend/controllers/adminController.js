const db = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const {
  listUsers,
  findUserById,
  updateUserRole,
  deleteUserById,
  setUserSuspended,
  USER_ROLES
} = require("../models/userModel");
const {
  listAllStores,
  setStoreVerification,
  setStoreStatus,
  findStoreById,
  getStoreDailyLoads,
  setDailyThresholdForAll,
  setDailyThreshold,
  getThresholdAlerts
} = require("../models/storeModel");
const { listAllForAdmin: listAllPickups, PICKUP_STATUSES } = require("../models/pickupRequestModel");
const { listAllForAdmin: listAllDropoffs, DROPOFF_STATUSES } = require("../models/dropOffRequestModel");
const {
  listForAdmin: listDisputes,
  resolveDispute,
  DISPUTE_STATUSES
} = require("../models/disputeModel");
const { isRewardsEnabled, setRewardsEnabled } = require("../models/settingsModel");
const rewardsLedger = require("../services/rewardsLedger");
const {
  parsePagination,
  parseSort,
  parseSearch,
  buildMeta,
  setPaginationHeaders
} = require("../utils/query");

const USER_SORT_KEYS = { id: "id", name: "name", email: "email", created_at: "created_at" };

const parseId = (raw, label = "id") => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest(`Valid ${label} is required`);
  return id;
};

// Parses an optional ?status= against a known enum (case-insensitive).
const parseEnumFilter = (value, allowed, label) => {
  if (value === undefined || value === "") return undefined;
  const v = String(value).toUpperCase();
  if (!allowed.includes(v)) throw ApiError.badRequest(`${label} must be one of: ${allowed.join(", ")}`);
  return v;
};

// Dashboard aggregation. Documented MVC exception: this query talks to `db`
// directly because it is a cross-table read-only rollup, not domain CRUD.
const getAdminOverview = asyncHandler(async (req, res) => {
  const [[{ totalUsers }]] = await db.query("SELECT COUNT(*) AS totalUsers FROM users");
  const [[{ totalRecyclers }]] = await db.query(
    "SELECT COUNT(*) AS totalRecyclers FROM users WHERE role = 'recycler'"
  );
  const [[{ totalBookings }]] = await db.query("SELECT COUNT(*) AS totalBookings FROM bookings");
  const [[{ pending }]] = await db.query(
    "SELECT COUNT(*) AS pending FROM bookings WHERE status = 'pending'"
  );
  const [[{ completed }]] = await db.query(
    "SELECT COUNT(*) AS completed FROM bookings WHERE status = 'completed'"
  );

  // Store moderation metrics.
  const [[{ totalStores }]] = await db.query("SELECT COUNT(*) AS totalStores FROM stores");
  const [[{ storesPending }]] = await db.query(
    "SELECT COUNT(*) AS storesPending FROM stores WHERE verification_status = 'Pending'"
  );
  const [[{ storesVerified }]] = await db.query(
    "SELECT COUNT(*) AS storesVerified FROM stores WHERE verification_status = 'Verified'"
  );
  const [[{ storesSuspended }]] = await db.query(
    "SELECT COUNT(*) AS storesSuspended FROM stores WHERE status = 'Inactive'"
  );

  // Completion metrics across both request pipelines.
  const [[{ pickupsTotal }]] = await db.query("SELECT COUNT(*) AS pickupsTotal FROM pickup_requests");
  const [[{ pickupsCompleted }]] = await db.query(
    "SELECT COUNT(*) AS pickupsCompleted FROM pickup_requests WHERE status = 'COMPLETED'"
  );
  const [[{ dropoffsTotal }]] = await db.query("SELECT COUNT(*) AS dropoffsTotal FROM dropoff_requests");
  const [[{ dropoffsCompleted }]] = await db.query(
    "SELECT COUNT(*) AS dropoffsCompleted FROM dropoff_requests WHERE status = 'COMPLETED'"
  );
  const [[{ openDisputes }]] = await db.query(
    "SELECT COUNT(*) AS openDisputes FROM disputes WHERE status = 'OPEN'"
  );

  // Stores at/above 80% of today's threshold (proactive capacity alerts).
  const storesNearThreshold = (await getThresholdAlerts(0.8)).length;

  const totalRequests = pickupsTotal + dropoffsTotal;
  const totalCompleted = pickupsCompleted + dropoffsCompleted;
  const completionRate = totalRequests ? Math.round((totalCompleted / totalRequests) * 100) : 0;

  const [users] = await db.query("SELECT id, name, email, role FROM users ORDER BY id DESC");
  const [bookings] = await db.query(`
    SELECT b.id, u.name AS user_name, r.name AS recycler_name,
           b.status, b.address
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    LEFT JOIN users r ON b.recycler_id = r.id
    ORDER BY b.id DESC
  `);

  res.json({
    stats: {
      totalUsers,
      totalRecyclers,
      totalBookings,
      pending,
      completed,
      // stores
      totalStores,
      storesPending,
      storesVerified,
      storesSuspended,
      // requests + completion metrics
      pickupsTotal,
      pickupsCompleted,
      dropoffsTotal,
      dropoffsCompleted,
      totalRequests,
      totalCompleted,
      completionRate,
      openDisputes,
      storesNearThreshold
    },
    users,
    bookings
  });
});

/* ================= STORE MANAGEMENT ================= */
// View all stores (status / verification / search filters + pagination). Each
// store is enriched with today's assigned load and threshold usage so the admin
// can see who is near their daily limit.
const getStores = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const search = parseSearch(req.query);
  const status = req.query.status || undefined; // 'Active' | 'Inactive'
  const verificationStatus = req.query.verificationStatus || undefined; // 'Pending' | 'Verified' | 'Rejected'

  const { rows, total } = await listAllStores({
    status,
    verificationStatus,
    search,
    limit,
    offset
  });

  const loads = await getStoreDailyLoads(rows.map((s) => s.id));
  const enriched = rows.map((s) => {
    const todayLoadKg = loads[s.id] || 0;
    const threshold = s.dailyThresholdKg;
    return {
      ...s,
      todayLoadKg,
      thresholdUsagePct: threshold ? Math.round((todayLoadKg / threshold) * 100) : null,
      eligible: threshold === null || threshold === undefined || todayLoadKg < threshold
    };
  });

  setPaginationHeaders(res, buildMeta(total, page, limit));
  return res.status(200).json(enriched);
});

/* ================= DAILY THRESHOLD CONTROLS ================= */
// Bulk action: apply one threshold to every store. Body: { thresholdKg } (null = no limit).
const setThresholdForAll = asyncHandler(async (req, res) => {
  const { thresholdKg } = req.body;
  const affected = await setDailyThresholdForAll(thresholdKg ?? null);
  return res.status(200).json({ message: `Daily threshold applied to ${affected} store(s)`, thresholdKg: thresholdKg ?? null });
});

// Manual override: set one store's threshold. Body: { thresholdKg } (null = no limit).
const setStoreThreshold = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, "store id");
  const store = await findStoreById(id);
  if (!store) throw ApiError.notFound("Store not found");
  const { thresholdKg } = req.body;
  await setDailyThreshold(id, thresholdKg ?? null);
  return res.status(200).json({ message: "Store threshold updated", id, thresholdKg: thresholdKg ?? null });
});

// Stores at/above 80% of their daily threshold today (proactive alert feed).
const thresholdAlerts = asyncHandler(async (req, res) => {
  const alerts = await getThresholdAlerts(0.8);
  return res.status(200).json(alerts);
});

// Verify / reject / reset a store's verification status.
const verifyStore = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, "store id");
  const { verificationStatus } = req.body;
  const store = await findStoreById(id);
  if (!store) throw ApiError.notFound("Store not found");
  await setStoreVerification(id, verificationStatus); // validates the enum
  return res.status(200).json({ message: `Store verification set to ${verificationStatus}` });
});

// Suspend (Inactive) / reinstate (Active) a store.
const setStoreStatusHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, "store id");
  const { status } = req.body;
  const store = await findStoreById(id);
  if (!store) throw ApiError.notFound("Store not found");
  await setStoreStatus(id, status); // validates the enum
  return res.status(200).json({ message: `Store status set to ${status}` });
});

/* ================= ACCOUNT SUSPENSION ================= */
// Suspend / reinstate any account (used for recyclers). A suspended user cannot
// log in. Admins cannot suspend themselves.
const suspendUser = asyncHandler(async (req, res) => {
  const userId = parseId(req.params.id, "user id");
  const { suspended } = req.body;
  if (typeof suspended !== "boolean") {
    throw ApiError.badRequest("suspended (boolean) is required");
  }
  if (userId === req.user.id) {
    throw ApiError.badRequest("You cannot suspend your own account");
  }
  const target = await findUserById(userId);
  if (!target) throw ApiError.notFound("User not found");

  await setUserSuspended(userId, suspended);
  return res.status(200).json({
    id: userId,
    suspended,
    message: suspended ? "Account suspended" : "Account reinstated"
  });
});

/* ================= REQUEST MONITORING ================= */
const getPickupRequests = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const status = parseEnumFilter(req.query.status, PICKUP_STATUSES, "status");
  const { rows, total } = await listAllPickups({ status, limit, offset });
  setPaginationHeaders(res, buildMeta(total, page, limit));
  return res.status(200).json(rows);
});

const getDropoffRequests = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const status = parseEnumFilter(req.query.status, DROPOFF_STATUSES, "status");
  const { rows, total } = await listAllDropoffs({ status, limit, offset });
  setPaginationHeaders(res, buildMeta(total, page, limit));
  return res.status(200).json(rows);
});

/* ================= DISPUTES ================= */
const getDisputes = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const status = parseEnumFilter(req.query.status, DISPUTE_STATUSES, "status");
  const { rows, total } = await listDisputes({ status, limit, offset });
  setPaginationHeaders(res, buildMeta(total, page, limit));
  return res.status(200).json(rows);
});

const resolveDisputeHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, "dispute id");
  const { status, resolutionNote } = req.body;
  const dispute = await resolveDispute(id, req.user.id, { status, resolutionNote });
  return res.status(200).json({ message: `Dispute ${status.toLowerCase()}`, dispute });
});

/* ================= LIST USERS (filter/search/sort/paginate) ================= */
const getUsers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { column, order } = parseSort(req.query, USER_SORT_KEYS, "id");
  const search = parseSearch(req.query);

  let role = req.query.role;
  if (role !== undefined && role !== "" && !USER_ROLES.includes(role)) {
    throw ApiError.badRequest(`role must be one of: ${USER_ROLES.join(", ")}`);
  }
  if (role === "") role = undefined;

  const { rows, total } = await listUsers({
    role,
    search,
    sortColumn: column,
    sortOrder: order,
    limit,
    offset
  });

  setPaginationHeaders(res, buildMeta(total, page, limit));
  return res.status(200).json(rows);
});

/* ================= UPDATE USER ROLE ================= */
const updateUserRoleHandler = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw ApiError.badRequest("Valid user id is required");
  }

  const { role } = req.body;
  if (!USER_ROLES.includes(role)) {
    throw ApiError.badRequest(`role must be one of: ${USER_ROLES.join(", ")}`);
  }

  const target = await findUserById(userId);
  if (!target) throw ApiError.notFound("User not found");

  const affected = await updateUserRole(userId, role);
  if (!affected) throw ApiError.notFound("User not found");

  return res.status(200).json({ id: userId, role, message: "User role updated successfully" });
});

/* ================= DELETE USER ================= */
const deleteUserHandler = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw ApiError.badRequest("Valid user id is required");
  }
  if (userId === req.user.id) {
    throw ApiError.badRequest("You cannot delete your own account");
  }

  const affected = await deleteUserById(userId);
  if (!affected) throw ApiError.notFound("User not found");

  return res.status(200).json({ message: "User deleted successfully" });
});

/* ============================== APP SETTINGS ============================== */
// Admin-controlled feature flags. Currently just the rewards toggle.

const getSettings = asyncHandler(async (req, res) => {
  res.json({
    rewardsEnabled: await isRewardsEnabled(),
    rewardsConfigured: rewardsLedger.isConfigured(),
  });
});

const updateRewardsSetting = asyncHandler(async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    throw ApiError.badRequest('enabled (boolean) is required');
  }
  await setRewardsEnabled(enabled);
  res.json({ rewardsEnabled: enabled });
});

module.exports = {
  getAdminOverview,
  getSettings,
  updateRewardsSetting,
  getUsers,
  updateUserRole: updateUserRoleHandler,
  deleteUser: deleteUserHandler,
  suspendUser,
  // stores
  getStores,
  verifyStore,
  setStoreStatus: setStoreStatusHandler,
  setThresholdForAll,
  setStoreThreshold,
  thresholdAlerts,
  // request monitoring
  getPickupRequests,
  getDropoffRequests,
  // disputes
  getDisputes,
  resolveDispute: resolveDisputeHandler
};
