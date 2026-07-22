import { View } from "react-native";
import { cn } from "@/lib/utils";

/** Determinate progress bar. `value` is 0–100. */
export function Progress({
  value,
  className,
  barClassName,
}: {
  value: number;
  className?: string;
  barClassName?: string;
}) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <View className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <View
        className={cn("h-full rounded-full bg-primary", barClassName)}
        style={{ width: `${pct}%` }}
      />
    </View>
  );
}
