import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Award,
  Bell,
  Boxes,
  Building2,
  CalendarClock,
  Inbox,
  KeyRound,
  LayoutDashboard,
  MapPin,
  PackageCheck,
  Recycle,
  ShieldCheck,
  Store as StoreIcon,
  Truck,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

/**
 * Role/user-type onboarding tours shown from the home screen. Each tour is a
 * short sequence of slides explaining that role's interface. Content is tailored
 * per user_type (individual / small_business / bulk_producer) and for recyclers.
 */

export type TutorialKey =
  | "individual"
  | "small_business"
  | "bulk_producer"
  | "recycler";

export type TutorialStep = {
  icon: LucideIcon;
  title: string;
  body: string;
};

export type Tutorial = {
  key: TutorialKey;
  /** Copy for the launcher banner on the home screen. */
  banner: { title: string; subtitle: string };
  steps: TutorialStep[];
};

const INDIVIDUAL: Tutorial = {
  key: "individual",
  banner: {
    title: "New here? Take a quick tour",
    subtitle: "See how to recycle your e-waste in a few taps",
  },
  steps: [
    { icon: Recycle, title: "Welcome to Connect2Recycle", body: "Recycle your electronic waste responsibly — book a doorstep pickup or drop it at a verified store near you. Here's how it works." },
    { icon: Truck, title: "Schedule a pickup", body: "Tap 'Schedule Pickup', choose your e-waste types and quantity, and set your address. We automatically match you with the nearest verified recycler — no need to pick a store." },
    { icon: MapPin, title: "Or drop it off", body: "Prefer to drop off? Use 'Find Stores' or the Drop-off tab to pick a nearby store and a time slot that suits you." },
    { icon: KeyRound, title: "Complete with a code", body: "At handover, your dashboard shows a one-time code. Read it to the recycler to confirm the collection — that's your proof the e-waste changed hands." },
    { icon: Bell, title: "Track everything", body: "The bell shows status updates and your handover codes. If rewards are on, you'll earn points for every completed recycle." },
  ],
};

const SMALL_BUSINESS: Tutorial = {
  key: "small_business",
  banner: {
    title: "Get started for your business",
    subtitle: "A quick tour of recycling your business e-waste",
  },
  steps: [
    { icon: Building2, title: "Recycle your business e-waste", body: "Keep your office and IT e-waste out of landfills, the compliant way. This tour shows how to raise and track requests." },
    { icon: Truck, title: "Book pickups", body: "Tap 'Schedule Pickup', select the categories (laptops, IT equipment, batteries…) and quantity, and we route it to the best-matched verified recycler automatically." },
    { icon: MapPin, title: "Drop-offs when it's easier", body: "For smaller loads, use the Drop-off tab to choose a store and a slot instead of a pickup." },
    { icon: KeyRound, title: "Verified handover", body: "Each collection completes with a one-time code you share at handover — an auditable record of responsible disposal." },
    { icon: Bell, title: "Stay on top of it", body: "Track every request from the Pickups and Drop-offs tabs, and watch the bell for status changes and handover codes." },
  ],
};

const BULK_PRODUCER: Tutorial = {
  key: "bulk_producer",
  banner: {
    title: "Set up bulk disposal",
    subtitle: "A quick tour for high-volume e-waste",
  },
  steps: [
    { icon: Boxes, title: "Bulk e-waste, handled", body: "Dispose of large volumes of electronic waste and route it to recyclers with the capacity to take it. Here's the flow." },
    { icon: Truck, title: "Raise a bulk pickup", body: "In 'Schedule Pickup', enter your categories and total quantity. We match against stores that accept all your categories and have the daily capacity to handle the load." },
    { icon: CalendarClock, title: "Plan drop-offs", body: "For scheduled loads, use Drop-off to book a store and a time slot in advance." },
    { icon: ShieldCheck, title: "Compliant handover", body: "Every collection is confirmed with a one-time code at handover, giving you a verifiable, tamper-evident trail for compliance." },
    { icon: Bell, title: "Track & get rewarded", body: "Monitor all requests from the tabs and the bell. If rewards are enabled, larger recycled quantities earn more points." },
  ],
};

const RECYCLER: Tutorial = {
  key: "recycler",
  banner: {
    title: "Tour the recycler console",
    subtitle: "See how to run your stores and jobs",
  },
  steps: [
    { icon: LayoutDashboard, title: "Your recycler console", body: "This is where you claim pickups, approve drop-offs, and manage your stores. Here's a quick walkthrough." },
    { icon: StoreIcon, title: "Manage your stores", body: "In the Stores tab, set each store's accepted e-waste types, capacity, and operating hours. Stores must be Active and Verified to receive requests." },
    { icon: Inbox, title: "Pickup requests inbox", body: "Nearby pickups are broadcast to your stores. Review the offer and accept — the first recycler to accept wins the job. Then mark en route and arrived." },
    { icon: PackageCheck, title: "Approve drop-offs", body: "Customers book drop-offs at a specific store. Approve the request and check the customer in when they arrive." },
    { icon: KeyRound, title: "Complete with OTP", body: "To finish a job, enter the customer's one-time code and log the actual collected quantity. That closes the loop and updates capacity." },
  ],
};

export const TUTORIALS: Record<TutorialKey, Tutorial> = {
  individual: INDIVIDUAL,
  small_business: SMALL_BUSINESS,
  bulk_producer: BULK_PRODUCER,
  recycler: RECYCLER,
};

/** Resolve which tour to show from the session's role + user_type. */
export function resolveTutorialKey(
  role: string | null,
  userType: string | null
): TutorialKey {
  if (role === "recycler") return "recycler";
  if (userType === "small_business") return "small_business";
  if (userType === "bulk_producer") return "bulk_producer";
  return "individual";
}

const seenKey = (key: TutorialKey) => `tutorial:seen:${key}`;

export async function hasSeenTutorial(key: TutorialKey): Promise<boolean> {
  return (await AsyncStorage.getItem(seenKey(key))) === "1";
}

export async function markTutorialSeen(key: TutorialKey): Promise<void> {
  await AsyncStorage.setItem(seenKey(key), "1");
}
