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

/* ============================== REWARDS (blockchain ledger) ============================== */

// Whether the admin-controlled rewards feature is live (GET /api/rewards/status).
// When false the app renders no rewards UI and performs no ledger operations.
export type RewardsStatus = { enabled: boolean };

// The current user's points balance (GET /api/rewards/me). `enabled:false` means
// the feature is off — treat as "no rewards".
export type RewardsSummary = {
  enabled: boolean;
  id?: string;
  owner: string | null;
  points: number;
};

// One entry of the tamper-evident on-chain audit trail.
export type RewardHistoryEntry = {
  txId: string;
  timestamp: string | null;
  points: number;
  owner: string | null;
};

export type RewardsHistory = { enabled: boolean; history: RewardHistoryEntry[] };

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
