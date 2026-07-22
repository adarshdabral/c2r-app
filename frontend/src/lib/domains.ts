/**
 * Per-flow accent colors — the app's "coded color" system. Each recycling flow
 * owns a hue so color carries meaning (recognition + continuity): the gradient a
 * user taps on Home is the gradient that greets them on the destination screen.
 * Kept as readonly tuples so they drop straight into expo-linear-gradient.
 */
export const DOMAIN = {
  impact: ["#0b6b3f", "#12b39a"], // emerald → teal (home hero)
  pickups: ["#16a34a", "#0e9f6e"], // emerald — doorstep collection
  dropoffs: ["#0ea5b7", "#22b8cf"], // teal — take it to a store
  stores: ["#4f46e5", "#6366f1"], // indigo — discovery / map
  rewards: ["#f59e0b", "#fb923c"], // amber — points
} as const;

export type DomainKey = keyof typeof DOMAIN;
