import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { cn } from "@/lib/utils";

/**
 * Status pill covering every request status across the platform (bookings,
 * pickups, drop-offs, disputes). Colors mirror the web status semantics:
 * amber = in-progress/pending, blue = active/accepted, green = completed,
 * red = cancelled/expired/rejected.
 */
type Tone = "amber" | "blue" | "green" | "red" | "gray";

const toneClass: Record<Tone, { bg: string; text: string }> = {
  amber: { bg: "bg-chart-3/15", text: "text-chart-3" },
  blue: { bg: "bg-chart-2/15", text: "text-chart-2" },
  green: { bg: "bg-primary/15", text: "text-primary" },
  red: { bg: "bg-destructive/15", text: "text-destructive" },
  gray: { bg: "bg-muted", text: "text-muted-foreground" },
};

const STATUS_TONE: Record<string, Tone> = {
  // Bookings
  pending: "amber",
  accepted: "blue",
  // Pickups
  REQUESTED: "amber",
  BROADCASTED: "amber",
  ACCEPTED: "blue",
  EN_ROUTE: "blue",
  ARRIVED: "blue",
  OTP_PENDING: "amber",
  // Drop-offs
  APPROVED: "blue",
  CHECKED_IN: "blue",
  // Terminal
  COMPLETED: "green",
  completed: "green",
  RESOLVED: "green",
  CANCELLED: "red",
  EXPIRED: "red",
  REJECTED: "red",
  OPEN: "amber",
};

const prettify = (status: string) =>
  status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone = STATUS_TONE[status] ?? "gray";
  const { bg, text } = toneClass[tone];
  return (
    <View className={cn("self-start rounded-full px-2.5 py-1", bg, className)}>
      <Text className={cn("text-[11px] font-semibold", text)}>
        {prettify(status)}
      </Text>
    </View>
  );
}
