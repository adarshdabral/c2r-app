import { View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { Text } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Presentational helpers for the admin dashboard. Logic-free — the screen
 * (`app/(admin)/index.tsx`) owns all data fetching and admin actions. Charts
 * from the web page (recharts donut / bar / completion ring) are replaced here
 * with stat cards and proportional bar rows built from plain Views.
 */

// Palette mirroring the web admin chart accents.
export const ADMIN_COLORS = {
  green: "#34c759",
  amber: "#ff9f0a",
  red: "#ff3b30",
  blue: "#0a84ff",
  muted: "#6c7278",
};

/** Big headline KPI tile with an optional proportion bar (replaces web <Kpi>). */
export function Kpi({
  icon: Icon,
  label,
  value,
  caption,
  ratio,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  caption?: string;
  ratio?: number;
}) {
  const pct = ratio != null ? Math.max(0, Math.min(1, ratio)) * 100 : null;
  return (
    <View className="flex-1 rounded-2xl border border-border bg-card p-4 shadow-clay">
      <View className="flex-row items-start justify-between">
        <Text className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </Text>
        <View className="h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
          <Icon size={16} color={ADMIN_COLORS.green} />
        </View>
      </View>
      <Text className="mt-2 text-[28px] font-extrabold leading-none text-foreground">
        {value}
      </Text>
      {caption ? (
        <Text className="mt-1.5 text-[12px] text-muted-foreground">{caption}</Text>
      ) : null}
      {pct != null ? (
        <View className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${pct}%` }}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * A labeled proportional bar row (replaces recharts donut/bar segments). Renders
 * the metric name, its value, and a bar whose width is proportional to `pct`.
 */
export function StatBar({
  label,
  value,
  suffix,
  pct,
  color,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  pct: number;
  color: string;
}) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <Text className="text-[13px] text-foreground">{label}</Text>
        </View>
        <Text className="text-[13px] font-semibold text-foreground">
          {value}
          {suffix ? (
            <Text className="text-[12px] font-normal text-muted-foreground">
              {suffix}
            </Text>
          ) : null}
        </Text>
      </View>
      <View className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <View
          className="h-full rounded-full"
          style={{ width: `${width}%`, backgroundColor: color }}
        />
      </View>
    </View>
  );
}

/** Verification status pill (Verified / Pending / Rejected). */
export function VerifBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    Verified: { bg: "bg-primary/15", text: "text-primary" },
    Pending: { bg: "bg-chart-3/15", text: "text-chart-3" },
    Rejected: { bg: "bg-destructive/15", text: "text-destructive" },
  };
  const cls = map[status] ?? { bg: "bg-muted", text: "text-muted-foreground" };
  return (
    <View className={cn("self-start rounded-full px-2.5 py-1", cls.bg)}>
      <Text className={cn("text-[11px] font-semibold", cls.text)}>{status}</Text>
    </View>
  );
}

/** Small red "Suspended" chip for inactive stores / suspended users. */
export function SuspendedPill({ label = "Suspended" }: { label?: string }) {
  return (
    <View className="self-start rounded-full bg-destructive/15 px-2.5 py-1">
      <Text className="text-[11px] font-semibold text-destructive">{label}</Text>
    </View>
  );
}
