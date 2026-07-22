import type { ReactNode } from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";
import { Text } from "@/components/ui";
import { Floaty } from "@/components/motion/Ambient";

/**
 * A colored screen header — the anchor that gives each flow its identity hue and
 * breaks the sea-of-white. Serif title on a domain gradient, a drifting orb for
 * life, an optional eyebrow + right-hand slot (a stat or an action).
 */
export function GradientHeader({
  eyebrow,
  title,
  subtitle,
  colors,
  icon: Icon,
  right,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  colors: readonly [string, string, ...string[]];
  icon?: LucideIcon;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <View className={"overflow-hidden rounded-[26px] shadow-clay " + (className ?? "")}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 20 }}>
        <Floaty
          pointerEvents="none"
          amplitude={10}
          drift={5}
          duration={5200}
          style={{ position: "absolute", right: -24, top: -30 }}
        >
          <View className="h-32 w-32 rounded-full bg-white/10" />
        </Floaty>

        <View className="flex-row items-end justify-between gap-3">
          <View className="min-w-0 flex-1">
            {eyebrow ? (
              <View className="mb-2 flex-row items-center gap-1.5">
                {Icon ? <Icon size={13} color="rgba(255,255,255,0.9)" /> : null}
                <Text className="text-[11px] font-bold tracking-[2px] text-white/80">{eyebrow}</Text>
              </View>
            ) : null}
            <Text className="font-display text-[26px] leading-[30px] tracking-tight text-white">
              {title}
            </Text>
            {subtitle ? (
              <Text className="mt-1.5 text-[13px] leading-5 text-white/85">{subtitle}</Text>
            ) : null}
          </View>
          {right ? <View className="shrink-0">{right}</View> : null}
        </View>
      </LinearGradient>
    </View>
  );
}
