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

const TONE: Record<NotificationTone, { icon: LucideIcon; color: string; ring: string }> = {
  success: { icon: CheckCircle2, color: "#1f6b38", ring: "bg-primary/[0.12]" },
  action: { icon: KeyRound, color: "#9a5b00", ring: "bg-chart-3/15" },
  info: { icon: Truck, color: "#2563eb", ring: "bg-accent" },
  muted: { icon: Clock, color: "#6c7278", ring: "bg-muted" },
};

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
                <Icon size={18} color={t.color} />
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
