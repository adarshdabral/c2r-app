import { useColorScheme } from "react-native";

/**
 * Runtime color tokens — the JS mirror of the CSS variables in `global.css`.
 *
 * NativeWind resolves the CSS variables for *className* colors automatically,
 * but imperative props (lucide `color=`, `placeholderTextColor`, `StatusBar`,
 * native tab-bar/StatusBar styles, SVG strokes) take literal strings and can't
 * read a CSS variable. `useColors()` returns the right palette for the active
 * device scheme so those props flip with light/dark like everything else.
 *
 * Keep these values in sync with `global.css`.
 */
export type ThemeColors = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  clayInsetBg: string;
  /** Neutral scrim used for skeletons/overlays (theme-aware). */
  scrim: string;
};

export const LIGHT: ThemeColors = {
  background: "#eef1ee",
  foreground: "#14181a",
  card: "#ffffff",
  cardForeground: "#14181a",
  popover: "#ffffff",
  primary: "#34c759",
  primaryForeground: "#ffffff",
  secondary: "#eef1ee",
  secondaryForeground: "#3a4046",
  muted: "#f1f4f1",
  mutedForeground: "#6c7278",
  accent: "#e8efe9",
  accentForeground: "#1f6b38",
  destructive: "#ff3b30",
  destructiveForeground: "#ffffff",
  border: "#e4e8e4",
  input: "#e4e8e4",
  ring: "#34c759",
  chart1: "#34c759",
  chart2: "#30b0c7",
  chart3: "#ff9f0a",
  chart4: "#5e5ce6",
  chart5: "#ff375f",
  clayInsetBg: "#f4f6f4",
  scrim: "rgba(20,24,26,0.06)",
};

export const DARK: ThemeColors = {
  background: "#0a0c0a",
  foreground: "#f3f5f3",
  card: "#16191a",
  cardForeground: "#f3f5f3",
  popover: "#16191a",
  primary: "#30d158",
  primaryForeground: "#06210f",
  secondary: "#1d211e",
  secondaryForeground: "#e6e9e6",
  muted: "#1d211e",
  mutedForeground: "#9aa39c",
  accent: "#1f2a22",
  accentForeground: "#4fd96f",
  destructive: "#ff453a",
  destructiveForeground: "#ffffff",
  border: "#262b27",
  input: "#262b27",
  ring: "#30d158",
  chart1: "#30d158",
  chart2: "#40c8e0",
  chart3: "#ff9f0a",
  chart4: "#7d7aff",
  chart5: "#ff6482",
  clayInsetBg: "#101312",
  scrim: "rgba(255,255,255,0.07)",
};

/** The active palette for the device color scheme (light/dark, live). */
export function useColors(): ThemeColors {
  return useColorScheme() === "dark" ? DARK : LIGHT;
}

/** True when the device is in dark mode. */
export function useIsDark(): boolean {
  return useColorScheme() === "dark";
}
