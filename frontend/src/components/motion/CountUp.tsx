import { useEffect } from "react";
import { TextInput, type TextStyle, type StyleProp } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

Animated.addWhitelistedNativeProps({ text: true });
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

// Worklet-safe thousands grouping (Number.toLocaleString isn't available on the
// UI thread).
function groupThousands(n: number): string {
  "worklet";
  const rounded = Math.round(n);
  const neg = rounded < 0;
  const s = String(Math.abs(rounded));
  let out = "";
  let c = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    out = s[i] + out;
    if (++c % 3 === 0 && i > 0) out = "," + out;
  }
  return (neg ? "-" : "") + out;
}

/**
 * A number that counts up to `value` on mount and whenever it changes — driven
 * on the UI thread (60fps) via an animated, non-editable TextInput. Renders like
 * a Text: pass fontSize/weight/color through `style`.
 */
export function CountUp({
  value,
  duration = 900,
  decimals = 0,
  suffix = "",
  style,
}: {
  value: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  style?: StyleProp<TextStyle>;
}) {
  const v = useSharedValue(0);

  useEffect(() => {
    v.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, duration, v]);

  const animatedProps = useAnimatedProps(() => {
    let body: string;
    if (decimals > 0) {
      const factor = Math.pow(10, decimals);
      const rounded = Math.round(v.value * factor) / factor;
      const whole = Math.trunc(rounded);
      const frac = Math.abs(rounded - whole)
        .toFixed(decimals)
        .slice(2);
      body = `${groupThousands(whole)}.${frac}`;
    } else {
      body = groupThousands(v.value);
    }
    const text = body + suffix;
    return { text, defaultValue: text } as any;
  });

  return (
    <AnimatedTextInput
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      // Fraunces numerals are the identity signature; callers can override
      // fontFamily via `style`.
      style={[{ padding: 0, fontFamily: "Fraunces_700Bold" }, style]}
      animatedProps={animatedProps}
    />
  );
}
