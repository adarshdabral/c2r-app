import { Pressable, View } from "react-native";
import { Star } from "lucide-react-native";

const GOLD = "#ffb800";
const EMPTY = "#c7ccc7";

/** Read-only row of 5 stars filled to `value`. */
export function StarRow({ value, size = 16 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <View className="flex-row gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          color={i < rounded ? GOLD : EMPTY}
          fill={i < rounded ? GOLD : "transparent"}
        />
      ))}
    </View>
  );
}

/** Interactive 1–5 star picker. */
export function StarPicker({
  value,
  onChange,
  size = 28,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: number;
}) {
  return (
    <View className="flex-row gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const v = i + 1;
        return (
          <Pressable key={v} onPress={() => onChange(v)} hitSlop={4} className="p-0.5">
            <Star
              size={size}
              color={v <= value ? GOLD : EMPTY}
              fill={v <= value ? GOLD : "transparent"}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
