import type { ReactNode } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { SPRING } from "@/theme/motion";

/**
 * A press target that springs its content down on touch and back on release —
 * the tactile "magnetic press" used across the app. `className` styles the
 * touch target (layout: width/margins); the inner Animated.View carries the
 * scale so any fully-styled child (a Surface, gradient card, …) compresses as a
 * whole.
 */
export function PressableScale({
  children,
  onPress,
  className,
  style,
  scaleTo = 0.965,
  hitSlop,
  accessibilityLabel,
  disabled,
}: {
  children: ReactNode;
  onPress?: () => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  hitSlop?: number;
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      className={className}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(scaleTo, SPRING.press);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING.press);
      }}
      hitSlop={hitSlop}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[aStyle, style]}>{children}</Animated.View>
    </Pressable>
  );
}
