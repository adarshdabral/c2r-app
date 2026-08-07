import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  CheckCircle2,
  Clock,
  KeyRound,
  Truck,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import {
  fetchNotifications,
  markAllSeen,
  type AppNotification,
  type NotificationTone,
} from "@/lib/notifications";
import { Text, Surface, LoadingState, EmptyState } from "@/components/ui";
import { useColors, type ThemeColors } from "@/lib/theme";

const TONE: Record<NotificationTone, { icon: LucideIcon; ring: string }> = {
  success: { icon: CheckCircle2, ring: "bg-primary/[0.12]" },
  action: { icon: KeyRound, ring: "bg-chart-3/15" },
  info: { icon: Truck, ring: "bg-accent" },
  muted: { icon: Clock, ring: "bg-muted" },
};

// Icon tint per tone — resolved at render so it flips with light/dark. Amber
// (action) and blue (info) are deliberate semantic hues kept across themes.
const toneColor = (tone: NotificationTone, c: ThemeColors): string =>
  tone === "success"
    ? c.accentForeground
    : tone === "muted"
      ? c.mutedForeground
      : tone === "action"
        ? "#9a5b00"
        : "#2563eb";

const relative = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : formatDistanceToNow(d, { addSuffix: true });
};

function OtpBadge({ otp }: { otp: string }) {
  return (
    <Surface
      variant="inset"
      className="mt-2 items-center gap-1 border-chart-3/30 bg-chart-3/10 p-3"
    >
      <Text className="text-[11px] font-medium text-chart-3">
        Share this code to complete the handover
      </Text>
      <Text className="text-[26px] font-bold tracking-[8px] text-chart-3">
        {otp}
      </Text>
    </Surface>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const c = useColors();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await fetchNotifications();
    setItems(data);
    setLoading(false);
    // Opening the screen clears the dashboard's unread badge.
    markAllSeen();
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000); // reflect recycler-side status / OTP progress
    return () => clearInterval(t);
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) return <LoadingState label="Loading notifications…" />;

  return (
    <FlatList
      data={items}
      keyExtractor={(n) => n.id}
      contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      ListEmptyComponent={
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="Updates about your pickups and drop-offs — including codes to share at handover — will appear here."
        />
      }
      renderItem={({ item }) => {
        const t = TONE[item.tone];
        const Icon = t.icon;
        return (
          <Pressable
            className="mb-3 active:opacity-80"
            onPress={() => router.push(item.href as any)}
          >
            <Surface className="flex-row items-start gap-3 p-4">
              <View className={`h-10 w-10 items-center justify-center rounded-full ${t.ring}`}>
                <Icon size={18} color={toneColor(item.tone, c)} />
              </View>
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="flex-1 text-[14px] font-bold">{item.title}</Text>
                  <Text className="text-[11px] text-muted-foreground">
                    {relative(item.timestamp)}
                  </Text>
                </View>
                <Text className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground">
                  {item.body}
                </Text>
                {item.otp ? <OtpBadge otp={item.otp} /> : null}
              </View>
            </Surface>
          </Pressable>
        );
      }}
    />
  );
}
