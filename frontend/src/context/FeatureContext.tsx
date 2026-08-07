import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  DEFAULT_FLAGS,
  fetchFeatureFlags,
  type FeatureFlags,
  type FeatureKey,
} from "@/lib/features";

type FeatureContextValue = {
  flags: FeatureFlags;
  ready: boolean;
  /** True when the named feature is live. */
  isEnabled: (key: FeatureKey) => boolean;
  /** Re-fetch flags (e.g. after an admin toggles one). */
  refresh: () => Promise<void>;
};

const FeatureContext = createContext<FeatureContextValue>({
  flags: DEFAULT_FLAGS,
  ready: false,
  isEnabled: () => true,
  refresh: async () => {},
});

/**
 * Loads the platform feature flags once at boot and exposes them app-wide.
 * Optimistically defaults everything on, then reconciles with the server — so a
 * disabled feature hides as soon as the flags arrive, and the app is fully
 * usable while they load.
 */
export function FeatureProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);
  const [ready, setReady] = useState(false);

  const refresh = async () => {
    try {
      setFlags(await fetchFeatureFlags());
    } catch {
      // Unreachable server → keep the optimistic defaults; the app still works.
      setFlags(DEFAULT_FLAGS);
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <FeatureContext.Provider
      value={{ flags, ready, isEnabled: (key) => flags[key], refresh }}
    >
      {children}
    </FeatureContext.Provider>
  );
}

export function useFeatures() {
  return useContext(FeatureContext);
}

/** Convenience hook: `const chatbot = useFeature("chatbot")`. */
export function useFeature(key: FeatureKey): boolean {
  return useContext(FeatureContext).flags[key];
}
