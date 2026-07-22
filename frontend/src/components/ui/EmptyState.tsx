import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";
import { Inbox } from "lucide-react-native";
import { Text } from "./Text";
import { Button } from "./Button";
import { Floaty } from "@/components/motion/Ambient";

/**
 * Editorial empty state — a gently floating gradient medallion, a serif title in
 * the app's display voice, and (optionally) one clear next action. An empty
 * screen is an invitation to act, so lead with what the person can do.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="items-center justify-center px-8 py-14">
      <Floaty amplitude={6} duration={3400}>
        <View className="h-20 w-20 items-center justify-center overflow-hidden rounded-[26px] shadow-clay-sm">
          <LinearGradient
            colors={["#0f9e6a", "#12b39a"] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1, width: "100%", alignItems: "center", justifyContent: "center" }}
          >
            <Icon size={30} color="#fff" strokeWidth={2} />
          </LinearGradient>
        </View>
      </Floaty>
      <Text className="mt-5 text-center font-display text-[19px] tracking-tight">
        {title}
      </Text>
      {description ? (
        <Text className="mt-1.5 max-w-[280px] text-center text-[13px] leading-5 text-muted-foreground">
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button onPress={onAction} className="mt-5">
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}
