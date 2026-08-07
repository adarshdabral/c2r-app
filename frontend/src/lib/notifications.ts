import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  api,
  getServerNotifications,
  type PickupRequest,
  type PickupStatus,
  type DropOffRequest,
  type DropOffStatus,
  type ServerNotification,
} from "@/lib/api";

/**
 * Client-side notification feed for the user. There is no server notification
 * store — instead we synthesize notifications from the user's own pickup and
 * drop-off requests (their `/mine` endpoints), which already carry the status
 * and, at handover time, the user's OWN OTP (`otp`). No new OTP is exposed:
 * the handover code is the one the user reads to the recycler, already shown on
 * the pickups / drop-offs screens.
 *
 * Unread state is a single "last seen" timestamp in AsyncStorage; anything with
 * a newer `updatedAt` counts as unread.
 */

export type NotificationTone = "info" | "success" | "action" | "muted";

export type AppNotification = {
  id: string; // stable per (source,requestId,status) so a status change reads as new
  source: string;
  requestId: number;
  title: string;
  body: string;
  otp?: string | null; // the user's handover code, when the request awaits OTP
  tone: NotificationTone;
  timestamp: string; // ISO (request.updatedAt)
  href: string; // where tapping the notification navigates
};

const LAST_SEEN_KEY = "notifications:lastSeenAt";

const PICKUP_COPY: Record<PickupStatus, { title: string; body: string; tone: NotificationTone }> = {
  REQUESTED: { title: "Finding a recycler", body: "We're matching your pickup with nearby stores.", tone: "muted" },
  BROADCASTED: { title: "Finding a recycler", body: "Your pickup was sent to nearby stores — awaiting a recycler.", tone: "muted" },
  ACCEPTED: { title: "Pickup accepted", body: "A recycler accepted your pickup request.", tone: "success" },
  EN_ROUTE: { title: "Recycler on the way", body: "Your recycler is en route to collect your e-waste.", tone: "info" },
  ARRIVED: { title: "Recycler has arrived", body: "Your recycler is at the pickup location.", tone: "info" },
  OTP_PENDING: { title: "Share your pickup code", body: "Give this code to the recycler to complete the collection.", tone: "action" },
  COMPLETED: { title: "Pickup completed", body: "Your e-waste was collected. Thanks for recycling!", tone: "success" },
  CANCELLED: { title: "Pickup cancelled", body: "This pickup request was cancelled.", tone: "muted" },
  EXPIRED: { title: "Pickup expired", body: "No recycler accepted in time. You can request again.", tone: "muted" },
};

const DROPOFF_COPY: Record<DropOffStatus, { title: string; body: string; tone: NotificationTone }> = {
  REQUESTED: { title: "Drop-off requested", body: "Awaiting the store's approval of your slot.", tone: "muted" },
  APPROVED: { title: "Drop-off approved", body: "Your slot is confirmed — head to the store at your chosen time.", tone: "success" },
  CHECKED_IN: { title: "Checked in", body: "You're checked in at the store.", tone: "info" },
  OTP_PENDING: { title: "Share your drop-off code", body: "Give this code to the store to complete the drop-off.", tone: "action" },
  COMPLETED: { title: "Drop-off completed", body: "Your e-waste was handed over. Thanks for recycling!", tone: "success" },
  CANCELLED: { title: "Drop-off cancelled", body: "This drop-off request was cancelled.", tone: "muted" },
};

const pickupToNotification = (r: PickupRequest): AppNotification => {
  const copy = PICKUP_COPY[r.status] ?? PICKUP_COPY.REQUESTED;
  return {
    id: `pickup-${r.id}-${r.status}`,
    source: "pickup",
    requestId: r.id,
    title: copy.title,
    body: `${copy.body} (${r.wasteCategory} · ${r.wasteQuantity} kg)`,
    otp: r.status === "OTP_PENDING" ? r.otp ?? null : null,
    tone: copy.tone,
    timestamp: r.updatedAt || r.createdAt,
    href: "/pickups",
  };
};

const dropoffToNotification = (r: DropOffRequest): AppNotification => {
  const copy = DROPOFF_COPY[r.status] ?? DROPOFF_COPY.REQUESTED;
  return {
    id: `dropoff-${r.id}-${r.status}`,
    source: "dropoff",
    requestId: r.id,
    title: copy.title,
    body: `${copy.body} (${r.wasteCategory} · ${r.wasteQuantity} kg)`,
    otp: r.status === "OTP_PENDING" ? r.otp ?? null : null,
    tone: copy.tone,
    timestamp: r.updatedAt || r.createdAt,
    href: "/dropoff/mine",
  };
};

const TONE_BY_CATEGORY: Record<string, NotificationTone> = {
  reward: "success",
  drive: "info",
  admin: "info",
  chatbot: "muted",
  feature: "info",
  system: "muted",
};

// Map a server notification to the shared feed shape. Pickup/drop-off categories
// are excluded (they're already synthesized locally with the handover OTP).
const serverToNotification = (n: ServerNotification): AppNotification => ({
  id: `srv-${n.id}`,
  source: n.category,
  requestId: n.data?.refId ?? 0,
  title: n.title,
  body: n.body || "",
  tone: TONE_BY_CATEGORY[n.category] || "info",
  timestamp: n.createdAt,
  href: n.data?.href || "/notifications",
});

/** Fetch + synthesize the user's notifications, newest first. Never throws. */
export async function fetchNotifications(): Promise<AppNotification[]> {
  const [pickups, dropoffs, server] = await Promise.all([
    api.get<PickupRequest[]>("/pickup-requests/mine").then((r) => r.data).catch(() => []),
    api.get<DropOffRequest[]>("/dropoff-requests/mine").then((r) => r.data).catch(() => []),
    // Server-stored notifications (rewards, drives, admin broadcasts, chatbot).
    // Best-effort: 403 when the notifications feature is off → empty.
    getServerNotifications()
      .then((r) => r.notifications)
      .catch(() => [] as ServerNotification[]),
  ]);
  const items = [
    ...(Array.isArray(pickups) ? pickups : []).map(pickupToNotification),
    ...(Array.isArray(dropoffs) ? dropoffs : []).map(dropoffToNotification),
    ...(Array.isArray(server) ? server : [])
      .filter((n) => !["pickup", "dropoff"].includes(n.category))
      .map(serverToNotification),
  ];
  return items.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export async function getLastSeen(): Promise<number> {
  const v = await AsyncStorage.getItem(LAST_SEEN_KEY);
  const n = v ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function markAllSeen(): Promise<void> {
  await AsyncStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
  // Also clear server-side unread (best-effort; no-op if the feature is off).
  const { markAllNotificationsRead } = await import("@/lib/api");
  markAllNotificationsRead().catch(() => {});
}

export function countUnread(items: AppNotification[], lastSeen: number): number {
  return items.reduce(
    (n, i) => n + (new Date(i.timestamp).getTime() > lastSeen ? 1 : 0),
    0
  );
}
