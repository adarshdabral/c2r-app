import axios from "axios";
import { getToken } from "./auth";

/**
 * API base URL. On a device/emulator `localhost` refers to the device itself,
 * not your dev machine — set EXPO_PUBLIC_API_URL to the host's LAN IP (or
 * http://10.0.2.2:4000/api for the Android emulator). See VERIFY.md.
 */
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  // Without a timeout, an unreachable backend (e.g. a stale LAN IP in
  // EXPO_PUBLIC_API_URL) leaves requests pending forever and the UI spins
  // indefinitely. Fail fast so screens can surface a network error instead.
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach the bearer token from the in-memory auth cache (hydrated at boot).
// RN has no cookie jar, so the backend's httpOnly cookie transport is unused;
// the backend also accepts `Authorization: Bearer …`, so the contract holds.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On web the axios interceptor redirected via window.location. In RN we can't
// touch navigation from here, so the AuthContext registers a handler that
// clears the session and routes to /login when a live session 401s.
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;
export function registerUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      // Only bounce when a session actually existed (expired/invalid token).
      // Incidental 401s on public screens (e.g. probing /auth/profile) must not
      // hijack navigation to /login.
      const hadSession = getToken();
      if (hadSession && onUnauthorized) {
        onUnauthorized();
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Turn an axios/network error into a message safe to show the user.
 *
 * A wrong password comes back as an HTTP error *with* a body (`response.data.message`)
 * — surface that verbatim. But a timeout or an unreachable host (e.g. a stale
 * `EXPO_PUBLIC_API_URL` that no longer matches the dev machine's LAN IP) has **no
 * response**; without this, callers fall back to a generic "Login failed", which
 * makes a connectivity problem look like bad credentials. Report those honestly.
 */
export function getApiErrorMessage(err: any, fallback = "Something went wrong"): string {
  // Real API error (4xx/5xx with a JSON body) — trust the server's message.
  const serverMessage = err?.response?.data?.message;
  if (serverMessage) return serverMessage;

  // Request was made but no response arrived: timeout or network unreachable.
  if (err?.code === "ECONNABORTED") {
    return "The server took too long to respond. Check your connection and that the backend is running.";
  }
  if (err?.request && !err?.response) {
    return "Can't reach the server. Check your internet connection and that EXPO_PUBLIC_API_URL points at the backend.";
  }

  return fallback;
}

export type UserRole = "user" | "recycler" | "admin";
export type BookingStatus = "pending" | "accepted" | "completed";

export type { UserType } from "./userTypes";

export type AuthProfile = {
  name: string;
  email: string;
  role: UserRole;
  user_type: string | null;
};

export type LoginResponse = {
  token: string;
  role: UserRole;
  user_type: string | null;
  name: string;
};

/* ============================== E-WASTE TAXONOMY / IMAGES / CERTIFICATES ============================== */

export type EwasteItem = { id: number; name: string };
export type EwasteCategory = { id: number; name: string; code: string | null; items: EwasteItem[] };

// What the booking screens send: selected appliance ids per category.
export type RequestItemSelection = { categoryId: number; itemIds: number[] };
// What request detail/list responses return: appliances grouped by category.
export type RequestItemGroup = { categoryId: number; categoryName: string; items: EwasteItem[] };

export type RequestImage = { id: number; dataUrl: string; createdAt: string };
export type RequestImages = { user: RequestImage[]; recycler: RequestImage[] };

export type RequestKind = "pickup" | "dropoff";

export type Certificate = {
  id: number;
  requestType: RequestKind;
  requestId: number;
  certificateNo: string;
  verificationId: string;
  sanitizationMethod: string;
  sanitizedOn: string;
  authorisedPerson: string;
  designation: string | null;
  issuedAt: string;
};

export type CertificateForm = {
  sanitizationMethod: string;
  sanitizedOn: string; // YYYY-MM-DD
  authorisedPerson: string;
  designation?: string;
};

// ── typed clients for the new endpoints ──
export const getEwasteCategories = () =>
  api.get<{ categories: EwasteCategory[] }>("/ewaste/categories").then((r) => r.data.categories);

export const getRequestImages = (type: RequestKind, id: number) =>
  api.get<RequestImages>(`/images/${type}/${id}`).then((r) => r.data);

// `images` are data URLs (or raw base64).
export const uploadRequestImages = (type: RequestKind, id: number, images: string[]) =>
  api.post<RequestImages>(`/images/${type}/${id}`, { images }).then((r) => r.data);

export const deleteRequestImage = (type: RequestKind, id: number, imageId: number) =>
  api.delete<RequestImages>(`/images/${type}/${id}/${imageId}`).then((r) => r.data);

export const getCertificate = (type: RequestKind, id: number) =>
  api.get<{ certificate: Certificate | null }>(`/certificates/${type}/${id}`).then((r) => r.data.certificate);

export const generateCertificate = (type: RequestKind, id: number, form: CertificateForm) =>
  api.post<Certificate>(`/certificates/${type}/${id}`, form).then((r) => r.data);

// Absolute URL for the PDF (the caller adds the auth header / fetches it).
export const certificateDownloadPath = (type: RequestKind, id: number) =>
  `/certificates/${type}/${id}/download`;

/* ============================== COLLECTION DRIVES (events) ============================== */

export type DriveStatus = "UPCOMING" | "ONGOING" | "COMPLETED" | "CANCELLED";

export type CollectionDrive = {
  id: number;
  hostId: number;
  hostRole: "recycler" | "admin";
  hostName?: string;
  title: string;
  description: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  scheduledDate: string; // YYYY-MM-DD
  timeWindow: string | null;
  acceptedCategories: string[];
  capacity: number | null;
  status: DriveStatus;
  goingCount?: number;
  myRsvp?: "GOING" | "CANCELLED" | null;
  distanceKm?: number;
  createdAt: string;
};

export type DriveAttendee = {
  userId: number;
  name: string;
  email: string;
  rsvpAt: string;
  checkedIn?: boolean;
  checkedInAt?: string | null;
};

export type DriveAnalytics = {
  capacity: number | null;
  going: number;
  checkedIn: number;
  cancelled: number;
  attendanceRate: number;
  capacityUsedPct: number | null;
};

export type HostingAnalytics = {
  drives: number;
  upcoming: number;
  completed: number;
  totalGoing: number;
  totalCheckedIn: number;
  avgAttendanceRate: number;
};

export type DriveInput = {
  title: string;
  description?: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  scheduledDate: string;
  timeWindow?: string;
  acceptedCategories?: string[];
  capacity?: number | null;
};

export const getDrives = (params?: { status?: string; lat?: number; lng?: number }) =>
  api.get<{ drives: CollectionDrive[] }>("/collection-drives", { params }).then((r) => r.data.drives);

export const getDrive = (id: number) =>
  api.get<CollectionDrive>(`/collection-drives/${id}`).then((r) => r.data);

export const rsvpDrive = (id: number) =>
  api.post<CollectionDrive>(`/collection-drives/${id}/rsvp`).then((r) => r.data);

export const cancelDriveRsvp = (id: number) =>
  api.delete<CollectionDrive>(`/collection-drives/${id}/rsvp`).then((r) => r.data);

export const getMyDrives = () =>
  api.get<{ drives: CollectionDrive[] }>("/collection-drives/mine").then((r) => r.data.drives);

export const getHostingDrives = () =>
  api.get<{ drives: CollectionDrive[] }>("/collection-drives/hosting").then((r) => r.data.drives);

export const createDrive = (input: DriveInput) =>
  api.post<{ drive: CollectionDrive }>("/collection-drives", input).then((r) => r.data.drive);

export const setDriveStatus = (id: number, status: DriveStatus) =>
  api.patch<CollectionDrive>(`/collection-drives/${id}/status`, { status }).then((r) => r.data);

export const getDriveAttendees = (id: number) =>
  api.get<{ attendees: DriveAttendee[] }>(`/collection-drives/${id}/attendees`).then((r) => r.data.attendees);

export const regenerateDriveReport = (id: number) =>
  api.post(`/collection-drives/${id}/report`).then((r) => r.data);

// Path for the report file (host adds auth header / fetches it). format: pdf | xls
// Drive attendance / QR check-in.
export const getDriveMyQr = (id: number) =>
  api
    .get<{ token: string; qrDataUrl: string; checkedIn: boolean }>(`/collection-drives/${id}/my-qr`)
    .then((r) => r.data);

export const checkInDrive = (id: number, body: { token?: string; userId?: number }) =>
  api
    .post<{ checkedIn: boolean; alreadyCheckedIn: boolean }>(`/collection-drives/${id}/check-in`, body)
    .then((r) => r.data);

export const getDriveAnalytics = (id: number) =>
  api.get<{ analytics: DriveAnalytics }>(`/collection-drives/${id}/analytics`).then((r) => r.data.analytics);

export const getHostingAnalytics = () =>
  api.get<{ analytics: HostingAnalytics }>("/collection-drives/hosting/analytics").then((r) => r.data.analytics);

export const driveReportDownloadPath = (id: number, format: "pdf" | "xls") =>
  `/collection-drives/${id}/report/download?format=${format}`;

/* ============================== IMPACT REPORTS (bulk producer) ============================== */

export type ReportType = "transaction" | "monthly" | "quarterly" | "annual";

export type ReportMetrics = {
  quantityKg: number;
  co2AvoidedKg: number;
  treesEquivalent: number;
  energySavedKwh: number;
  waterSavedLiters: number;
  landfillDivertedKg: number;
};

export type ImpactReport = {
  id: number;
  userId: number;
  reportType: ReportType;
  reportNo: string;
  pickupId: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  title: string;
  totalQuantityKg: number;
  totalPickups: number;
  metrics: ReportMetrics | null;
  insights: string[];
  createdAt: string;
  userName?: string;
};

export const getReports = () =>
  api.get<{ reports: ImpactReport[] }>("/reports").then((r) => r.data.reports);

export const generateReportSummary = (type: "monthly" | "quarterly" | "annual") =>
  api.post<{ report: ImpactReport }>("/reports/summary", { type }).then((r) => r.data.report);

export const getReport = (id: number) =>
  api.get<{ report: ImpactReport }>(`/reports/${id}`).then((r) => r.data.report);

export const reportDownloadPath = (id: number) => `/reports/${id}/download`;

/* ============================== REWARDS (blockchain ledger) ============================== */

// Whether the admin-controlled rewards feature is live (GET /api/rewards/status).
// When false the app renders no rewards UI and performs no ledger operations.
export type RewardsStatus = { enabled: boolean };

// A badge the user can earn.
export type RewardBadge = {
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  tier: "bronze" | "silver" | "gold" | "platinum";
  earned?: boolean;
  awardedAt?: string | null;
};

// The current user's rewards profile (GET /api/rewards/me). `enabled:false` means
// the programme is off — treat as "no rewards". `points` is kept as a
// backward-compatible alias of `pointsBalance`.
export type RewardsSummary = {
  enabled: boolean;
  id?: string;
  owner: string | null;
  points: number;
  pointsBalance?: number;
  lifetimePoints?: number;
  level?: number;
  toNext?: number;
  progress?: number;
  nextThreshold?: number | null;
  streakCount?: number;
  badges?: RewardBadge[];
};

// One row of the local reward ledger (earn +delta / spend|expire -delta).
export type RewardHistoryEntry = {
  id: number;
  delta: number;
  balanceAfter: number;
  eventType: string;
  reason: string | null;
  createdAt: string;
};

export type RewardsHistory = { enabled: boolean; history: RewardHistoryEntry[] };

export type RewardCatalogItem = {
  code: string;
  name: string;
  description: string | null;
  pointsCost: number;
  stock: number | null;
};

export type RewardRedemption = {
  id: number;
  catalogCode: string;
  name: string;
  pointsSpent: number;
  status: "REQUESTED" | "FULFILLED" | "CANCELLED";
  voucherCode: string | null;
  createdAt?: string;
};

export type LeaderboardRow = {
  rank: number;
  userId: number;
  name: string;
  lifetimePoints: number;
  level: number;
};

export const getRewards = () => api.get<RewardsSummary>("/rewards/me").then((r) => r.data);

export const getRewardHistory = () =>
  api.get<RewardsHistory>("/rewards/me/history").then((r) => (Array.isArray(r.data.history) ? r.data.history : []));

export const getRewardBadges = () =>
  api.get<{ badges: RewardBadge[] }>("/rewards/me/badges").then((r) => r.data.badges);

export const getRewardCatalog = () =>
  api.get<{ catalog: RewardCatalogItem[]; balance: number }>("/rewards/catalog").then((r) => r.data);

export const redeemReward = (code: string) =>
  api.post<{ redemption: RewardRedemption }>("/rewards/redeem", { code }).then((r) => r.data.redemption);

export const getRewardLeaderboard = () =>
  api
    .get<{ leaderboard: LeaderboardRow[]; me: LeaderboardRow | null }>("/rewards/leaderboard")
    .then((r) => r.data);

export const getMyRedemptions = () =>
  api.get<{ redemptions: RewardRedemption[] }>("/rewards/me/redemptions").then((r) => r.data.redemptions);

// Admin feature flags (GET /api/admin/settings). `rewardsConfigured` is false
// when the backend has no ledger URL/key — the toggle can still be flipped but
// nothing will be awarded until it's configured.
export type AdminSettings = { rewardsEnabled: boolean; rewardsConfigured: boolean };

// A citizen's saved pickup location (GET/POST/PATCH/DELETE /api/addresses).
export type SavedAddress = {
  id: number;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  isDefault: boolean;
  createdAt: string;
};

// Shape returned by GET /api/stores/nearest. `name` is an alias of storeName so
// the map/list UI can stay generic. Used by the map + nearest-store list.
export type Station = {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distance: number;
  recyclerId?: number;
  storeName?: string;
  remainingCapacityKg?: number;
  hasCapacity?: boolean;
};

export type WasteType =
  | "Waste Batteries"
  | "PCB Scrap"
  | "Mobile Phone Scrap"
  | "Laptop Scrap"
  | "Computer Scrap"
  | "Hard Drive Scrap"
  | "IT Equipment Scrap"
  | "Telecom Equipment Scrap"
  | "Display Panel Scrap";

export type StoreStatus = "Active" | "Inactive";
export type VerificationStatus = "Pending" | "Verified" | "Rejected";

// Full store record (GET /api/stores/:id, GET /api/stores/mine).
export type Store = {
  id: number;
  recyclerId: number;
  storeName: string;
  description: string | null;
  contactNumber: string | null;
  email: string | null;
  address: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
  latitude: number;
  longitude: number;
  operatingHours: string | null;
  pickupAvailability: boolean;
  acceptedWasteTypes: WasteType[];
  dailyCapacityKg: number;
  currentCapacityKg: number;
  status: StoreStatus;
  verificationStatus: VerificationStatus;
  rating: number;
  totalReviews: number;
  distance?: number;
  createdAt: string;
  updatedAt: string;
};

// Returned by GET /api/stores/:id — the full store plus computed capacity and an
// optional distanceKm (present only when lat/lng were sent).
export type StoreDetails = Store & {
  distanceKm: number | null;
  remainingCapacityKg: number;
  hasCapacity: boolean;
};

// A single store review (GET /api/stores/:id/reviews -> reviews[], and
// GET /api/stores/:id/reviews/mine -> review). userName is present on the
// public list; it is omitted from the "mine" lookup.
export type Review = {
  id: number;
  storeId: number;
  userId: number;
  rating: number;
  comment: string | null;
  userName?: string;
  createdAt: string;
  updatedAt: string;
};

// Body of GET /api/stores/:id/reviews — the store aggregates kept in sync with
// the stores row, plus a page of recent reviews (pagination meta in X-* headers).
export type StoreReviewsResponse = {
  averageRating: number;
  totalReviews: number;
  reviews: Review[];
};

/* ============================== PICKUP REQUESTS (Phase 3) ============================== */

export type PickupStatus =
  | "REQUESTED"
  | "BROADCASTED"
  | "ACCEPTED"
  | "EN_ROUTE"
  | "ARRIVED"
  | "OTP_PENDING"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED";

// One store the request was offered to (the broadcast fan-out), per round.
export type PickupCandidate = {
  id: number;
  storeId: number;
  recyclerId: number;
  storeName: string;
  round: number;
  distanceKm: number | null;
  status: "NOTIFIED" | "ACCEPTED" | "REJECTED" | "MISSED";
  notifiedAt: string;
  respondedAt: string | null;
};

// A pickup request. OTPs are never serialised to clients. `candidateStatus` /
// `distanceKm` are present on the recycler inbox (this recycler's relation to
// the request); `candidates` is present on the detail endpoint.
export type PickupRequest = {
  id: number;
  userId: number;
  assignedRecyclerId: number | null;
  assignedStoreId: number | null;
  // Comma-joined list of categories (for display); `wasteCategories` is the array.
  wasteCategory: string;
  wasteCategories?: WasteType[];
  // Multi-category CPCB selection (category → appliances) + certificate request.
  items?: RequestItemGroup[];
  sanitizationRequested?: boolean;
  wasteQuantity: number;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  preferredTimeSlot: string | null;
  status: PickupStatus;
  acceptanceDeadline: string | null;
  // Two-sided OTP progress (Phase 5): userOtpVerified = the recycler has entered
  // the customer's code; recyclerOtpVerified = the customer has entered the
  // recycler's code. Completion requires both.
  userOtpVerified?: boolean;
  recyclerOtpVerified?: boolean;
  // The user's own OTP — present only on the owner's `/mine` view, shown on
  // their dashboard once the recycler accepts (status OTP_PENDING).
  otp?: string | null;
  // Actual quantity the recycler logged at collection (may differ from declared).
  actualQuantityKg?: number | null;
  completionTimestamp: string | null;
  broadcastRound: number;
  userName?: string;
  userEmail?: string;
  recyclerName?: string;
  storeName?: string;
  storeAddress?: string | null;
  storeContact?: string | null;
  candidateStatus?: PickupCandidate["status"];
  distanceKm?: number;
  candidates?: PickupCandidate[];
  createdAt: string;
  updatedAt: string;
};

/* ============================== DROP-OFF REQUESTS (Phase 4) ============================== */

export type DropOffStatus =
  | "REQUESTED"
  | "APPROVED"
  | "CHECKED_IN"
  | "OTP_PENDING"
  | "COMPLETED"
  | "CANCELLED";

// A drop-off request. The user selects a store + time slot; the store's recycler
// approves it. OTPs are never serialised to clients.
export type DropOffRequest = {
  id: number;
  userId: number;
  storeId: number;
  recyclerId: number;
  // Comma-joined list of categories (for display); `wasteCategories` is the array.
  wasteCategory: string;
  wasteCategories?: WasteType[];
  // Multi-category CPCB selection (category → appliances) + certificate request.
  items?: RequestItemGroup[];
  sanitizationRequested?: boolean;
  wasteQuantity: number;
  scheduledDate: string;
  timeSlot: string;
  status: DropOffStatus;
  // Two-sided OTP progress (Phase 5) — see PickupRequest above.
  userOtpVerified?: boolean;
  recyclerOtpVerified?: boolean;
  otp?: string | null;
  actualQuantityKg?: number | null;
  completionTimestamp: string | null;
  userName?: string;
  userEmail?: string;
  recyclerName?: string;
  recyclerEmail?: string;
  storeName?: string;
  createdAt: string;
  updatedAt: string;
};

// One row of the OTP verification audit trail (GET /:id/otp-history).
export type OtpHistoryEntry = {
  id: number;
  requestType: "pickup" | "dropoff";
  requestId: number;
  actor: "user" | "recycler";
  actorUserId: number | null;
  target: "user_otp" | "recycler_otp";
  result: "SUCCESS" | "FAIL" | "EXPIRED" | "LOCKED";
  attemptNo: number;
  createdAt: string;
};

/* ============================== ADMIN (Phase 8) ============================== */

export type AdminStats = {
  totalUsers: number;
  totalRecyclers: number;
  totalBookings: number;
  pending: number;
  completed: number;
  totalStores: number;
  storesPending: number;
  storesVerified: number;
  storesSuspended: number;
  pickupsTotal: number;
  pickupsCompleted: number;
  dropoffsTotal: number;
  dropoffsCompleted: number;
  totalRequests: number;
  totalCompleted: number;
  completionRate: number;
  openDisputes: number;
  storesNearThreshold: number;
};

export type AdminStore = Store & {
  recyclerName?: string;
  recyclerEmail?: string;
  // Daily threshold + today's load (Waste Collection Service Flow).
  dailyThresholdKg?: number | null;
  todayLoadKg?: number;
  thresholdUsagePct?: number | null;
  eligible?: boolean;
};

// A store at/above 80% of its daily threshold today (admin alert feed).
export type ThresholdAlert = {
  storeId: number;
  storeName: string;
  thresholdKg: number;
  todayLoadKg: number;
  usagePct: number;
  breached: boolean;
};

export type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  user_type: string | null;
  is_verified?: boolean | number;
  is_suspended?: boolean | number;
  created_at?: string;
};

export type DisputeStatus = "OPEN" | "RESOLVED" | "REJECTED";

export type Dispute = {
  id: number;
  requestType: "pickup" | "dropoff";
  requestId: number;
  raisedBy: number;
  raisedByRole: "user" | "recycler";
  reason: string;
  status: DisputeStatus;
  resolutionNote: string | null;
  resolvedBy: number | null;
  resolvedAt: string | null;
  raiserName?: string;
  resolverName?: string;
  createdAt: string;
  updatedAt: string;
};

export type Booking = {
  id: number;
  store_id: number | null;
  store_name: string | null;
  recycler_name: string | null;
  user_name?: string | null;
  status: BookingStatus;
  pickup_date: string;
  created_at?: string;
  address: string;
  latitude: number;
  longitude: number;
};

/* ============================== WEBSITE CONTENT CMS ============================== */

// The backend returns media as `/api/...` paths; resolve them against the API
// origin so <Image>/<Video> can load them directly (public, no auth needed).
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");
export const absoluteMediaUrl = (path?: string | null) =>
  path ? `${API_ORIGIN}${path}` : null;

export type SiteCollection = "carousel" | "faq_gallery";
export type SiteSettingKey =
  | "hero_video"
  | "impact_image"
  | "hero_heading"
  | "hero_subheading";

export type SiteSetting = {
  text: string | null;
  hasMedia: boolean;
  mediaType: string | null;
  mediaUrl: string | null;
  updatedAt: string;
};

export type SiteMediaItem = {
  id: number;
  collection: SiteCollection;
  title: string | null;
  body: string | null;
  hasMedia: boolean;
  mediaType: string | null;
  mediaUrl?: string | null;
  linkUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
};

export type SiteContent = {
  settings: Partial<Record<SiteSettingKey, SiteSetting>>;
  carousel: SiteMediaItem[];
  faqGallery: SiteMediaItem[];
};

// Public read — the whole published surface in one call.
export const getSiteContent = () =>
  api.get<SiteContent>("/site-content").then((r) => r.data);

// Admin: upsert a singleton (hero heading/subheading, impact image, hero video).
// `media` is a data URL (base64) or { data, mimeType }.
export const putSiteSetting = (
  key: SiteSettingKey,
  payload: { text?: string; media?: string }
) =>
  api
    .put<{ setting: { key: string } & SiteSetting }>(`/site-content/settings/${key}`, payload)
    .then((r) => r.data.setting);

// Admin: full list of a collection (includes inactive items).
export const getSiteItemsAdmin = (collection: SiteCollection) =>
  api
    .get<{ items: SiteMediaItem[] }>(`/site-content/admin/items/${collection}`)
    .then((r) => r.data.items);

export const createSiteItem = (
  collection: SiteCollection,
  payload: { title?: string; body?: string; media?: string; linkUrl?: string; sortOrder?: number; isActive?: boolean }
) =>
  api
    .post<{ item: SiteMediaItem }>(`/site-content/admin/items/${collection}`, payload)
    .then((r) => r.data.item);

export const updateSiteItem = (
  id: number,
  payload: Partial<{ title: string; body: string; media: string; linkUrl: string; sortOrder: number; isActive: boolean }>
) =>
  api
    .patch<{ item: SiteMediaItem }>(`/site-content/admin/items/${id}`, payload)
    .then((r) => r.data.item);

export const deleteSiteItem = (id: number) =>
  api.delete(`/site-content/admin/items/${id}`).then((r) => r.data);

// Admin item media is served on a stable path; append a cache-buster after edits.
export const siteItemMediaUrl = (id: number, v?: number | string) =>
  absoluteMediaUrl(`/api/site-content/items/${id}/media${v !== undefined ? `?v=${v}` : ""}`);

/* ============================== ASSISTANT (rule/intent engine) ============================== */

export type AssistantAction = { label: string; href: string } | null;

export type AssistantReply = {
  intent: string;
  reply: string;
  suggestions: string[];
  action: AssistantAction;
};

export type AssistantIntro = { greeting: string; suggestions: string[] };

// Starter greeting + role-aware suggested prompts.
export const getAssistantIntro = () =>
  api.get<AssistantIntro>("/assistant/suggestions").then((r) => r.data);

// Ask the assistant a question. Returns a canned/templated reply + follow-ups.
export const assistantQuery = (message: string) =>
  api.post<AssistantReply>("/assistant/query", { message }).then((r) => r.data);

/* ============================== PLATFORM FEATURE FLAGS (admin) ============================== */

// A DB-backed platform feature flag (source of truth). Managed only by admins.
export type AdminFeatureFlag = {
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  updatedBy: number | null;
  updatedByName: string | null;
  updatedAt: string;
};

export const getAdminFeatures = () =>
  api.get<{ features: AdminFeatureFlag[] }>("/admin/features").then((r) => r.data.features);

export const setAdminFeature = (key: string, enabled: boolean) =>
  api
    .patch<{ feature: AdminFeatureFlag; features: AdminFeatureFlag[] }>(`/admin/features/${key}`, { enabled })
    .then((r) => r.data);

/* ============================== PERSONALIZATION ============================== */

export type PersonalizedAction = { label: string; href: string; icon?: string };
export type SuggestedAction = { key: string; label: string; hint: string; href: string };
export type RecommendedRecycler = {
  id: number;
  storeName: string;
  city: string | null;
  rating: number | null;
  distanceKm: number | null;
  acceptedWasteTypes: string[];
};
export type FrequentWasteType = { category: string; count: number };
export type FavoriteRecycler = {
  storeId: number;
  storeName: string;
  rating: number | null;
  city: string | null;
  completedCount: number;
} | null;

export type RecyclingInsights = {
  quantityKg: number;
  co2AvoidedKg: number;
  treesEquivalent: number;
  energySavedKwh: number;
  waterSavedLiters: number;
  landfillDivertedKg: number;
};

export type RecyclerBusinessStats = {
  completed: number;
  totalKg: number;
  stores: number;
  verified: number;
  avgRating: number;
  reviews: number;
  insights: RecyclingInsights;
};

export type RouteStop = {
  id: number;
  address: string;
  wasteCategory: string;
  status: string;
  distanceKm: number | null;
};

// One role-aware bundle. Consumer fields are always present for role='user';
// recycler-only fields appear for role='recycler'.
export type PersonalizationHome = {
  role: UserRole;
  userType: string | null;
  greeting: string | null;
  quickActions: PersonalizedAction[];
  // Consumer
  suggestedActions?: SuggestedAction[];
  recommendedRecyclers?: RecommendedRecycler[];
  nearbyDrives?: CollectionDrive[];
  driveReminders?: CollectionDrive[];
  frequentWasteTypes?: FrequentWasteType[];
  preferredTimeSlots?: { slot: string; count: number }[];
  favoriteRecycler?: FavoriteRecycler;
  recentActivity?: { type: RequestKind; id: number; category: string; status: string; createdAt: string }[];
  preferredAddress?: { id: number; label: string | null; address: string } | null;
  savedLocationCount?: number;
  stats?: { completed: number; totalKg: number } | null;
  recyclingInsights?: RecyclingInsights | null;
  bulkSuggestion?: { label: string; hint: string; href: string } | null;
  moduleNotes?: { products?: string } | null;
  rewardTip?: { balance: number; message: string; href: string } | null;
  // Recycler
  businessStats?: RecyclerBusinessStats;
  pickupDemand?: number;
  nearbyRequests?: { id: number; address: string; wasteCategory: string; distanceKm: number | null }[];
  routeSuggestions?: RouteStop[];
  driveInsights?: { hosted: number; upcoming: number; totalGoing: number };
  generatedAt: string;
};

// The personalized home bundle. Only called when the personalization flag is on.
export const getPersonalizationHome = () =>
  api.get<PersonalizationHome>("/personalization/home").then((r) => r.data);

/* ============================== NOTIFICATIONS ============================== */

export type ServerNotification = {
  id: number;
  category: string;
  type: string;
  title: string;
  body: string | null;
  data: { href?: string; refType?: string; refId?: number } | null;
  read: boolean;
  createdAt: string;
};

export const getServerNotifications = () =>
  api.get<{ notifications: ServerNotification[]; unread: number }>("/notifications").then((r) => r.data);

export const markNotificationRead = (id: number) =>
  api.patch<{ unread: number }>(`/notifications/${id}/read`).then((r) => r.data);

export const markAllNotificationsRead = () =>
  api.post<{ updated: number; unread: number }>("/notifications/read-all").then((r) => r.data);

// Admin broadcast to all users (or one role).
export const broadcastNotification = (payload: { title: string; body?: string; role?: string }) =>
  api.post<{ delivered: number }>("/notifications/admin/broadcast", payload).then((r) => r.data);
