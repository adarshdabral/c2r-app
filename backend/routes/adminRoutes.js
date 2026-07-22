const express = require("express");
const {
  getAdminOverview,
  getUsers,
  updateUserRole,
  deleteUser,
  suspendUser,
  getStores,
  verifyStore,
  setStoreStatus,
  setThresholdForAll,
  setStoreThreshold,
  thresholdAlerts,
  getPickupRequests,
  getDropoffRequests,
  getDisputes,
  resolveDispute,
  getSettings,
  updateRewardsSetting
} = require("../controllers/adminController");
const { protect, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect, requireRole("admin"));

router.get("/overview", getAdminOverview);

// App settings / feature flags
router.get("/settings", getSettings);
router.patch("/settings/rewards", updateRewardsSetting);

// Account management
router.get("/users", getUsers);
router.patch("/users/:id/role", updateUserRole);
router.patch("/users/:id/suspend", suspendUser);
router.delete("/users/:id", deleteUser);

// Store management
router.get("/stores", getStores);
router.get("/stores/threshold-alerts", thresholdAlerts);
router.patch("/stores/threshold", setThresholdForAll); // bulk — literal before :id
router.patch("/stores/:id/verification", verifyStore);
router.patch("/stores/:id/status", setStoreStatus);
router.patch("/stores/:id/threshold", setStoreThreshold);

// Request monitoring
router.get("/pickup-requests", getPickupRequests);
router.get("/dropoff-requests", getDropoffRequests);

// Disputes
router.get("/disputes", getDisputes);
router.patch("/disputes/:id/resolve", resolveDispute);

module.exports = router;
