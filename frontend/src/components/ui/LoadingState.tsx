import { View } from "react-native";
import { Text } from "./Text";
import { Surface } from "./Surface";
import { Shimmer } from "@/components/motion/Shimmer";

/**
 * Content-shaped loading placeholder — a small stack of shimmering rows instead
 * of a spinner, so the wait reads as "content arriving" rather than "stuck".
 */
export function LoadingState({ label }: { label?: string }) {
  return (
    <View className="gap-2.5 py-6">
      {[0, 1, 2].map((k) => (
        <Surface key={k} variant="inset" className="flex-row items-center gap-3 p-4">
          <Shimmer style={{ height: 40, width: 40 }} radius={20} />
          <View className="flex-1 gap-2">
            <Shimmer style={{ height: 12, width: "52%" }} radius={6} />
            <Shimmer style={{ height: 10, width: "80%" }} radius={6} />
          </View>
        </Surface>
      ))}
      {label ? (
        <Text className="mt-1 text-center text-[12.5px] text-muted-foreground">{label}</Text>
      ) : null}
    </View>
  );
}
