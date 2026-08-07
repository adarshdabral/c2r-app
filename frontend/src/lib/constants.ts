import type { WasteType, PickupStatus } from "@/lib/api";
import type { SelectOption } from "@/components/ui";

/**
 * Shared domain constants — the single source of truth for lists and label maps
 * that were previously copy-pasted across screens (waste types in 3 files, time
 * slots in 2, pickup labels + verification maps in 2 each).
 */

// The 9 e-waste categories that drive store matching. Keep in sync with the
// backend `waste_category` enum.
export const WASTE_TYPES: WasteType[] = [
  "Waste Batteries",
  "PCB Scrap",
  "Mobile Phone Scrap",
  "Laptop Scrap",
  "Computer Scrap",
  "Hard Drive Scrap",
  "IT Equipment Scrap",
  "Telecom Equipment Scrap",
  "Display Panel Scrap",
];

// "All waste types" filter option + one per category (used by store search).
export const WASTE_FILTER_OPTIONS: SelectOption[] = [
  { value: "", label: "All waste types" },
  ...WASTE_TYPES.map((w) => ({ value: w, label: w })),
];

// Two-hour drop-off / pickup windows.
export const TIME_SLOTS = [
  "09:00 - 11:00",
  "11:00 - 13:00",
  "13:00 - 15:00",
  "15:00 - 17:00",
  "17:00 - 19:00",
];

// Slot <Select> options. Drop-off requires a slot; pickup allows "no preference".
export const SLOT_OPTIONS: SelectOption[] = TIME_SLOTS.map((s) => ({ value: s, label: s }));
export const SLOT_OPTIONS_OPTIONAL: SelectOption[] = [
  { value: "", label: "No preference" },
  ...SLOT_OPTIONS,
];

// Human-readable pickup-request statuses (recycler-facing).
export const PICKUP_LABELS: Record<PickupStatus, string> = {
  REQUESTED: "Requested",
  BROADCASTED: "New offer",
  ACCEPTED: "Accepted",
  EN_ROUTE: "En route",
  ARRIVED: "Arrived",
  OTP_PENDING: "Awaiting OTP",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

// Store verification-status → token classes (text + chip background).
export const VERIF_TEXT: Record<string, string> = {
  Verified: "text-primary",
  Pending: "text-chart-3",
  Rejected: "text-destructive",
};
export const VERIF_BG: Record<string, string> = {
  Verified: "bg-primary/[0.12]",
  Pending: "bg-chart-3/15",
  Rejected: "bg-destructive/10",
};
