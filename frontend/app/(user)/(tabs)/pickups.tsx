import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Clock,
  KeyRound,
  MapPin,
  Package,
  Phone,
  RotateCcw,
  Store as StoreIcon,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { api, type PickupRequest, type PickupStatus } from "@/lib/api";
import { GradientHeader } from "@/components/GradientHeader";
import { DOMAIN } from "@/lib/domains";
import {
  Text,
  Button,
  Surface,
  LoadingState,
  EmptyState,
} from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";

// A pickup can be cancelled by the user until it is being handed over / completed.
const CANCELLABLE: PickupStatus[] = [
  "REQUESTED",
  "BROADCASTED",
  "ACCEPTED",
  "EN_ROUTE",
  "ARRIVED",
];

// Once done/cancelled/expired, the user can re-book the same job in one tap.
const REBOOKABLE: PickupStatus[] = ["COMPLETED", "CANCELLED", "EXPIRED"];

// The user's collection OTP — shown once the recycler accepts (OTP_PENDING).
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

export default function UserPickupsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<PickupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<PickupRequest[]>("/pickup-requests/mine");
      setItems(data);
      setError("");
    } catch {
      setError("Could not load your pickups.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000); // reflect recycler-side status/OTP progress
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
      await api.post(`/pickup-requests/${id}/cancel`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Could not cancel.");
    } finally {
      setBusyId(null);
    }
  };

  // Re-create a finished/cancelled pickup with the same details — one tap.
  const rebook = async (r: PickupRequest) => {
    setBusyId(r.id);
    setError("");
    try {
      await api.post("/pickup-requests", {
        // Re-book with the same categories (array preferred; string is also accepted).
        wasteCategories: r.wasteCategories ?? r.wasteCategory,
        wasteQuantity: r.wasteQuantity,
        pickupAddress: r.pickupAddress,
        pickupLatitude: r.pickupLatitude,
        pickupLongitude: r.pickupLongitude,
        preferredTimeSlot: r.preferredTimeSlot,
      });
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Could not re-book.");
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = ({ item: r }: { item: PickupRequest }) => (
    <Surface className="mb-4 gap-3.5 p-5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-2">
          <StatusBadge status={r.status} />
          <View className="flex-row items-center gap-2">
            <View className="h-8 w-8 overflow-hidden rounded-xl">
              <LinearGradient
                colors={DOMAIN.pickups}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
              >
                <Package size={16} color="#fff" strokeWidth={2.2} />
              </LinearGradient>
            </View>
            <Text className="flex-1 text-[14px] font-semibold" numberOfLines={1}>
              {r.wasteCategory}
            </Text>
            <Text className="font-display text-[16px] text-[#0e9f6e]">
              {r.wasteQuantity} kg
            </Text>
          </View>
          <View className="flex-row items-start gap-1.5">
            <MapPin size={14} color="#6c7278" className="mt-0.5" />
            <Text
              className="flex-1 text-[13px] text-muted-foreground"
              numberOfLines={1}
            >
              {r.pickupAddress}
            </Text>
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
        ) : REBOOKABLE.includes(r.status) ? (
          <Button
            size="sm"
            variant="outline"
            loading={busyId === r.id}
            onPress={() => rebook(r)}
            className="flex-row gap-1.5"
          >
            <RotateCcw size={14} color="#14181a" />
            <Text className="text-[13px] font-semibold">Book again</Text>
          </Button>
        ) : null}
      </View>

      {/* Assigned store (auto-assigned by the backend) */}
      {r.storeName ? (
        <Surface variant="inset" className="p-4">
          <View className="flex-row items-center gap-1.5">
            <StoreIcon size={14} color="#6c7278" />
            <Text className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Assigned store
            </Text>
          </View>
          <Text className="mt-1.5 text-[14px] font-semibold">{r.storeName}</Text>
          {r.storeAddress ? (
            <View className="mt-1 flex-row items-start gap-1.5">
              <MapPin size={14} color="#6c7278" className="mt-0.5" />
              <Text className="flex-1 text-[12.5px] text-muted-foreground">
                {r.storeAddress}
              </Text>
            </View>
          ) : null}
          {r.storeContact ? (
            <View className="mt-1 flex-row items-center gap-1.5">
              <Phone size={14} color="#6c7278" />
              <Text className="text-[12.5px] text-muted-foreground">
                {r.storeContact}
              </Text>
            </View>
          ) : null}
          {r.recyclerName ? (
            <Text className="mt-1 text-[12.5px] text-muted-foreground">
              Recycler: {r.recyclerName}
            </Text>
          ) : null}
        </Surface>
      ) : r.status !== "COMPLETED" &&
        r.status !== "CANCELLED" &&
        r.status !== "EXPIRED" ? (
        <View className="flex-row items-center gap-1.5 rounded-xl bg-chart-3/10 px-3.5 py-2.5">
          <Clock size={14} color="#9a5b00" />
          <Text className="text-[12.5px] font-semibold text-chart-3">
            Pending assignment — matching you with a store…
          </Text>
        </View>
      ) : null}

      {r.status === "OTP_PENDING" && r.otp ? <OtpDisplay otp={r.otp} /> : null}
    </Surface>
  );

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <View className="flex-1 px-5 pt-4">
        <GradientHeader
          eyebrow="MY PICKUPS"
          title="Your collections"
          subtitle="Every request, from doorstep to done."
          colors={DOMAIN.pickups}
          icon={Package}
          className="mb-3"
          right={
            <Pressable onPress={() => router.push("/pickup/new" as any)} className="active:opacity-80">
              <View className="flex-row items-center gap-1.5 rounded-full bg-white/20 px-3 py-2">
                <Text className="text-[12.5px] font-semibold text-white">+ New</Text>
              </View>
            </Pressable>
          }
        />

        {error ? (
          <View className="mb-3 rounded-xl bg-destructive/10 px-4 py-3">
            <Text className="text-[13px] font-medium text-destructive">
              {error}
            </Text>
          </View>
        ) : null}

        {loading ? (
          <LoadingState label="Loading your pickups…" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No pickup requests yet"
            description="Schedule your first pickup to get started."
            actionLabel="Schedule pickup"
            onAction={() => router.push("/pickup/new" as any)}
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
