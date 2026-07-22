import { useEffect, useState } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/**
 * Shimmering skeleton placeholder — a light band sweeps across a muted block
 * while data loads (never a spinner). Sizes via `style` (width/height) or the
 * `className` on the wrapper.
 */
export function Shimmer({
  radius = 12,
  style,
  className,
}: {
  radius?: number;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  const [w, setW] = useState(0);
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, [x]);

  const band = useAnimatedStyle(() => ({
    transform: [{ translateX: -w + x.value * (2 * w) }],
  }));

  return (
    <View
      className={className}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[
        { borderRadius: radius, overflow: "hidden", backgroundColor: "rgba(20,24,26,0.06)" },
        style,
      ]}
    >
      {w > 0 ? (
        <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, width: "55%" }, band]}>
          <LinearGradient
            colors={["transparent", "rgba(255,255,255,0.6)", "transparent"] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
