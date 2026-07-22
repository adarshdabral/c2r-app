import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar, Clock, KeyRound, PackageCheck } from "lucide-react-native";
import { api, type DropOffRequest, type DropOffStatus } from "@/lib/api";
import {
  Text,
  Button,
  Surface,
  LoadingState,
  EmptyState,
} from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";

// A drop-off can be cancelled by the user until it completes.
const CANCELLABLE: DropOffStatus[] = [
  "REQUESTED",
  "APPROVED",
  "CHECKED_IN",
  "OTP_PENDING",
];

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

// The user's collection OTP — shown once at handover (OTP_PENDING).
function OtpDisplay({ otp }: { otp: string }) {
  return (
    <Surface
      variant="inset"
      className="mt-1 items-center gap-1.5 border-chart-3/30 bg-chart-3/10 p-4"
    >
      <View className="flex-row items-center gap-1.5">
        <KeyRound size={14} color="#9a5b00" />
        <Text className="text-[12px] font-medium text-chart-3">
          Share this code with the recycler to complete collection
        </Text>
      </View>
      <Text className="text-[30px] font-bold tracking-[10px] text-chart-3">
        {otp}
      </Text>
      <Text className="text-[11px] text-chart-3">
        Only share it once the recycler is collecting your waste.
      </Text>
    </Surface>
  );
}

export default function MyDropoffsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<DropOffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<DropOffRequest[]>(
        "/dropoff-requests/mine"
      );
      setItems(data);
      setError("");
    } catch {
      setError("Could not load your drop-offs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000); // reflect recycler-side OTP progress
    return () => clearInterval(t);
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const cancel = async (id: number) => {
    setBusyId(id);
    setError("");
    try {
      await api.post(`/dropoff-requests/${id}/cancel`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Could not cancel.");
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = ({ item: r }: { item: DropOffRequest }) => (
    <Surface className="mb-4 gap-3.5 p-5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-2">
          <StatusBadge status={r.status} />
          <Text className="text-[15px] font-semibold">{r.storeName}</Text>
          <Text className="text-[13px] text-muted-foreground">
            {r.wasteCategory} · {r.wasteQuantity} kg
          </Text>
          <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
            <View className="flex-row items-center gap-1.5">
              <Calendar size={14} color="#6c7278" />
              <Text className="text-[12.5px] text-muted-foreground">
                {fmtDate(r.scheduledDate)}
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <Clock size={14} color="#6c7278" />
              <Text className="text-[12.5px] text-muted-foreground">
                {r.timeSlot}
              </Text>
            </View>
          </View>
        </View>
        {CANCELLABLE.includes(r.status) ? (
          <Button
            size="sm"
            variant="outline"
            loading={busyId === r.id}
            onPress={() => cancel(r.id)}
          >
            <Text className="text-[13px] font-semibold text-destructive">
              Cancel
            </Text>
          </Button>
        ) : null}
      </View>

      {r.status === "OTP_PENDING" && r.otp ? <OtpDisplay otp={r.otp} /> : null}
    </Surface>
  );

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <View className="flex-1 px-5 pt-4">
        <View className="mb-3 flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-[24px] font-extrabold tracking-tight">
              My drop-offs
            </Text>
            <Text className="text-[13px] text-muted-foreground">
              Track every request scheduled at a recycling store.
            </Text>
          </View>
          <Button size="sm" onPress={() => router.push("/stores" as any)}>
            Find a store
          </Button>
        </View>

        {error ? (
          <View className="mb-3 rounded-xl bg-destructive/10 px-4 py-3">
            <Text className="text-[13px] font-medium text-destructive">
              {error}
            </Text>
          </View>
        ) : null}

        {loading ? (
          <LoadingState label="Loading your drop-offs…" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={PackageCheck}
            title="No drop-offs yet"
            description="Find a store and schedule your first drop-off."
            actionLabel="Find a store"
            onAction={() => router.push("/stores" as any)}
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(r) => String(r.id)}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}
