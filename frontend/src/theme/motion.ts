import { Easing } from "react-native-reanimated";

/**
 * Shared motion language. Springs and curves tuned for a premium, physical feel
 * (Apple/Stripe-grade): quick, slightly damped, never bouncy-cartoonish.
 */
export const SPRING = {
  // Default UI motion — settles fast, no overshoot wobble.
  gentle: { damping: 20, stiffness: 190, mass: 1 },
  // Button / tile press — snappy and tactile.
  press: { damping: 16, stiffness: 420, mass: 0.7 },
  // Playful accents (badges, celebration).
  bouncy: { damping: 12, stiffness: 220, mass: 0.9 },
} as const;

export const TIMING = { fast: 180, base: 340, slow: 620 } as const;

// easeOutExpo-like — decisive arrivals.
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
