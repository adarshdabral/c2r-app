import { api } from "./api";

/**
 * Client mirror of the backend feature flags (config/features.js). Fetched once
 * at boot from the public GET /api/features so the UI can hide surfaces, skip
 * nav entries, and avoid calling disabled endpoints. Keys must match the
 * backend FEATURE_KEYS exactly.
 */
export type FeatureKey = "personalization" | "rewards" | "chatbot";

export type FeatureFlags = Record<FeatureKey, boolean>;

// Optimistic default — everything on until the server responds, so a slow flag
// fetch never flashes features off for users who have them.
export const DEFAULT_FLAGS: FeatureFlags = {
  personalization: true,
  rewards: true,
  chatbot: true,
};

export async function fetchFeatureFlags(): Promise<FeatureFlags> {
  const { data } = await api.get<{ features: Partial<FeatureFlags> }>("/features");
  return { ...DEFAULT_FLAGS, ...(data?.features ?? {}) };
}
