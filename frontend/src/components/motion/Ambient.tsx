import { useEffect, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/**
 * Ambient (continuous, looping) motion helpers — the "alive" layer. All run on
 * the UI thread via transforms/opacity only, so they're 60fps and Expo Go safe.
 */

/** Slowly drifts its children up/down (and optionally sideways) forever. */
export function Floaty({
  children,
  amplitude = 10,
  drift = 0,
  duration = 3200,
  delay = 0,
  style,
  pointerEvents,
}: {
  children?: ReactNode;
  amplitude?: number;
  drift?: number;
  duration?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: "none" | "auto" | "box-none" | "box-only";
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }), -1, true)
    );
  }, [delay, duration, t]);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -t.value * amplitude }, { translateX: t.value * drift }],
  }));

  return (
    <Animated.View pointerEvents={pointerEvents} style={[aStyle, style]}>
      {children}
    </Animated.View>
  );
}

/** Breathing scale + optional opacity pulse — for glows and living accents. */
export function Pulse({
  children,
  from = 1,
  to = 1.06,
  minOpacity,
  duration = 2200,
  delay = 0,
  style,
  pointerEvents,
}: {
  children?: ReactNode;
  from?: number;
  to?: number;
  minOpacity?: number;
  duration?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: "none" | "auto" | "box-none" | "box-only";
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }), -1, true)
    );
  }, [delay, duration, t]);

  const aStyle = useAnimatedStyle(() => {
    const scale = from + (to - from) * t.value;
    const opacity = minOpacity != null ? minOpacity + (1 - minOpacity) * t.value : 1;
    return { transform: [{ scale }], opacity };
  });

  return (
    <Animated.View pointerEvents={pointerEvents} style={[aStyle, style]}>
      {children}
    </Animated.View>
  );
}
