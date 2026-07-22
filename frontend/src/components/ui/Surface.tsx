import { View, type ViewProps } from "react-native";
import { cn } from "@/lib/utils";

type Variant = "clay" | "inset" | "pill";

const base: Record<Variant, string> = {
  // Elevated white surface (cards, panels, tiles).
  clay: "rounded-2xl border border-border bg-card shadow-clay",
  // Recessed/pressed surface (active nav, segmented controls).
  inset: "rounded-xl border border-border bg-muted",
  // Fully rounded elevated surface (chips, FABs).
  pill: "rounded-full bg-card shadow-clay-sm",
};

/**
 * The clay surface system ported from the web `.clay` / `.clay-inset` /
 * `.clay-pill` utilities.
 */
export function Surface({
  variant = "clay",
  className,
  ...props
}: ViewProps & { variant?: Variant; className?: string }) {
  return <View className={cn(base[variant], className)} {...props} />;
}
