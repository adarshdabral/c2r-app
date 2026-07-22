import { api, type PickupRequest, type DropOffRequest } from "@/lib/api";

/**
 * The user's real environmental impact, derived from their own completed
 * pickups + drop-offs (no fabricated numbers). `kg` is the actual collected
 * weight where the recycler logged it, falling back to the declared quantity.
 */
export type Impact = { kg: number; completed: number };

export async function fetchImpact(): Promise<Impact> {
  const [pickups, dropoffs] = await Promise.all([
    api.get<PickupRequest[]>("/pickup-requests/mine").then((r) => r.data).catch(() => []),
    api.get<DropOffRequest[]>("/dropoff-requests/mine").then((r) => r.data).catch(() => []),
  ]);
  const all = [
    ...(Array.isArray(pickups) ? pickups : []),
    ...(Array.isArray(dropoffs) ? dropoffs : []),
  ];

  let kg = 0;
  let completed = 0;
  for (const r of all) {
    if (r.status === "COMPLETED") {
      completed += 1;
      const q = (r as any).actualQuantityKg ?? r.wasteQuantity ?? 0;
      kg += Number(q) || 0;
    }
  }
  return { kg: Math.round(kg * 10) / 10, completed };
}

// Gamified "Eco level" derived from reward points (falls back to kg×10 when
// rewards are off so the ring is never empty for an active recycler).
const POINTS_PER_LEVEL = 500;

export function ecoLevel(points: number): {
  level: number;
  progress: number;
  into: number;
  toNext: number;
} {
  const p = Math.max(0, Math.floor(points || 0));
  const level = Math.floor(p / POINTS_PER_LEVEL) + 1;
  const into = p % POINTS_PER_LEVEL;
  return { level, progress: into / POINTS_PER_LEVEL, into, toNext: POINTS_PER_LEVEL - into };
}
