import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  Bell,
  CalendarHeart,
  CheckCircle,
  ChevronRight,
  Clock,
  Inbox,
  MapPin,
  Package,
  Plus,
  Star,
  Store as StoreIcon,
  Truck,
  X,
} from "lucide-react-native";
import {
  api,
  type AuthProfile,
  type DropOffRequest,
  type PickupRequest,
  type PickupStatus,
  type Store,
} from "@/lib/api";
import {
  Screen,
  Text,
  Button,
  Surface,
  EmptyState,
} from "@/components/ui";
import { TutorialLauncher } from "@/components/TutorialLauncher";
import { GradientHeader } from "@/components/GradientHeader";
import { RecyclerInsights } from "@/components/personalization/RecyclerInsights";
import { useFeature } from "@/context/FeatureContext";
import { PressableScale } from "@/components/motion/PressableScale";
import { useColors } from "@/lib/theme";
import { PICKUP_LABELS, VERIF_TEXT, VERIF_BG } from "@/lib/constants";

// Statuses where this recycler owns an in-flight job.
const ACTIVE_STATUSES: PickupStatus[] = [
  "ACCEPTED",
  "EN_ROUTE",
  "ARRIVED",
  "OTP_PENDING",
];

type Notification = {
  key: string;
  kind: "Pickup" | "Drop-off";
  title: string;
  subtitle: string;
  at?: string;
};

export default function RecyclerDashboardScreen() {
  const router = useRouter();
  const c = useColors();
  const personalization = useFeature("personalization");
  const [requests, setRequests] = useState<PickupRequest[]>([]);
  const [incomingDropoffs, setIncomingDropoffs] = useState<DropOffRequest[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadData = useCallback(() => {
    api
      .get<PickupRequest[]>("/pickup-requests/recycler/inbox")
      .then((res) => setRequests(res.data))
      .catch(() => {});
    api
      .get<DropOffRequest[]>("/dropoff-requests/store/incoming")
      .then((res) => setIncomingDropoffs(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api
      .get<AuthProfile>("/auth/profile")
      .then(({ data }) => setProfile(data))
      .catch(() => {});
    loadData();
    api
      .get<Store[]>("/stores/mine")
      .then((res) => setStores(res.data))
      .catch(() => {});

    const t = setInterval(loadData, 15000);
    return () => clearInterval(t);
  }, [loadData]);

  const openOffers = useMemo(
    () =>
      requests.filter(
        (r) => r.status === "BROADCASTED" && r.candidateStatus === "NOTIFIED"
      ),
    [requests]
  );
  const activeJobs = useMemo(
    () => requests.filter((r) => ACTIVE_STATUSES.includes(r.status)),
    [requests]
  );

  const notifications = useMemo<Notification[]>(() => {
    const list: Notification[] = [];
    for (const r of openOffers) {
      list.push({
        key: `pickup:${r.id}`,
        kind: "Pickup",
        title: `${r.wasteCategory} · ${r.wasteQuantity} kg`,
        subtitle: `${r.distanceKm != null ? r.distanceKm + " km · " : ""}${r.pickupAddress}`,
        at: r.createdAt,
      });
    }
    for (const dr of incomingDropoffs) {
      if (dr.status !== "REQUESTED") continue;
      list.push({
        key: `dropoff:${dr.id}`,
        kind: "Drop-off",
        title: dr.storeName ?? "Drop-off request",
        subtitle: `${dr.userName ? dr.userName + " · " : ""}${dr.wasteCategory} ${dr.wasteQuantity}kg · ${dr.timeSlot}`,
        at: dr.createdAt,
      });
    }
    return list.sort((a, b) => (a.at && b.at ? (a.at < b.at ? 1 : -1) : 0));
  }, [openOffers, incomingDropoffs]);

  const unseen = useMemo(
    () => notifications.filter((n) => !seen.has(n.key)),
    [notifications, seen]
  );

  const markAllRead = () => {
    const next = new Set(seen);
    notifications.forEach((n) => next.add(n.key));
    setSeen(next);
  };

  const accept = async (id: number) => {
    setBusyId(id);
    try {
      await api.post(`/pickup-requests/${id}/accept`);
      loadData();
    } catch {
      // surfaced in full detail on the Pickup Requests tab
    } finally {
      setBusyId(null);
    }
  };

  const completedCount = requests.filter((r) => r.status === "COMPLETED").length;

  const goStores = () => router.push("/recycler/stores" as any);
  const goPickups = () => router.push("/recycler/pickups" as any);

  return (
    <Screen contentClassName="py-6">
      {/* Header */}
      <GradientHeader
        eyebrow="RECYCLER"
        title="Recycler dashboard"
        subtitle="Claim pickups, approve drop-offs, and keep your stores running."
        colors={["#0f766e", "#0d9488"]}
        icon={Truck}
        right={
          <Pressable
            onPress={markAllRead}
            accessibilityRole="button"
            accessibilityLabel={
              unseen.length > 0
                ? `${unseen.length} new notifications, mark all read`
                : "Notifications"
            }
            className="relative h-10 w-10 items-center justify-center rounded-full bg-white/20"
          >
            <Bell size={20} color="#fff" />
            {unseen.length > 0 ? (
              <View className="absolute -right-0.5 -top-0.5 h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1">
                <Text className="text-[10px] font-bold text-white">
                  {unseen.length > 9 ? "9+" : unseen.length}
                </Text>
              </View>
            ) : null}
          </Pressable>
        }
      />

      {/* Guided tour of the recycler console (auto-shows once on first login). */}
      <TutorialLauncher tutorialKey="recycler" className="mt-5" />

      {/* Personalized recycler insights (only when the feature is enabled). */}
      {personalization ? <RecyclerInsights /> : null}

      {/* Host collection drives */}
      <Animated.View entering={FadeInDown.duration(420).delay(60)}>
        <PressableScale
          onPress={() => router.push("/recycler/drives" as any)}
          accessibilityLabel="Collection drives"
          className="mt-4"
        >
          <Surface className="flex-row items-center gap-3 p-4">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-[#7c3aed]/[0.12]">
              <CalendarHeart size={22} color="#7c3aed" />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[14px] font-bold">Collection drives</Text>
              <Text className="mt-0.5 text-[12px] text-muted-foreground">Host public e-waste events and manage RSVPs.</Text>
            </View>
            <ChevronRight size={20} color={c.mutedForeground} />
          </Surface>
        </PressableScale>
      </Animated.View>

      {/* New-request highlight */}
      {unseen.length > 0 ? (
        <Animated.View entering={FadeInDown.duration(420).delay(120)}>
          <Surface className="mt-5 border-l-4 border-l-chart-3 p-4">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 flex-row items-start gap-3">
                <View className="h-9 w-9 items-center justify-center rounded-xl bg-chart-3/15">
                  <Bell size={18} color="#ff9f0a" />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[14px] font-bold">
                    {unseen.length} new{" "}
                    {unseen.length === 1 ? "request" : "requests"} for your store
                    {unseen.length === 1 ? "" : "s"}
                  </Text>
                  <View className="mt-1 gap-0.5">
                    {unseen.slice(0, 4).map((n) => (
                      <Text
                        key={n.key}
                        className="text-[12px] text-muted-foreground"
                        numberOfLines={1}
                      >
                        <Text className="text-[10px] font-semibold uppercase text-muted-foreground">
                          {n.kind}
                        </Text>{" "}
                        <Text className="font-semibold">{n.title}</Text> ·{" "}
                        {n.subtitle}
                      </Text>
                    ))}
                    {unseen.length > 4 ? (
                      <Text className="text-[12px] text-muted-foreground">
                        and {unseen.length - 4} more…
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
              <Pressable
                onPress={markAllRead}
                accessibilityRole="button"
                accessibilityLabel="Mark all read"
                className="flex-row items-center gap-1 rounded-full px-2.5 py-1"
              >
                <X size={14} color={c.mutedForeground} />
                <Text className="text-[12px] font-semibold text-muted-foreground">
                  Mark read
                </Text>
              </Pressable>
            </View>
          </Surface>
        </Animated.View>
      ) : null}

      {/* Stats */}
      <Animated.View
        entering={FadeInDown.duration(420).delay(180)}
        className="mt-5 flex-row gap-3"
      >
        <StatTile label="New offers" value={openOffers.length} tint="text-chart-3" />
        <StatTile label="Active" value={activeJobs.length} tint="text-chart-2" />
        <StatTile label="Completed" value={completedCount} tint="text-primary" />
      </Animated.View>

      {/* My Stores */}
      <Animated.View entering={FadeInDown.duration(420).delay(240)}>
        <Surface className="mt-5 gap-3 p-5">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <StoreIcon size={16} color={c.primary} />
              <Text className="text-[15px] font-bold">My Stores</Text>
              <Text className="text-[12px] text-muted-foreground">
                ({stores.length})
              </Text>
            </View>
            <Button
              size="sm"
              variant="ghost"
              onPress={goStores}
              className="flex-row gap-1"
            >
              <Text className="text-[12px] font-semibold">Manage</Text>
              <ChevronRight size={14} color={c.foreground} />
            </Button>
          </View>
          {stores.length === 0 ? (
            <View className="items-center py-6">
              <StoreIcon size={28} color={c.mutedForeground} />
              <Text className="mb-3 mt-2 text-center text-[13px] text-muted-foreground">
                You have no stores yet. Add one so customers can find you.
              </Text>
              <Button size="sm" onPress={goStores} className="flex-row gap-1.5">
                <Plus size={16} color="#fff" />
                <Text className="text-[13px] font-semibold text-primary-foreground">
                  Add a store
                </Text>
              </Button>
            </View>
          ) : (
            <View className="gap-2">
              {stores.slice(0, 4).map((s) => {
                const remaining = Math.max(
                  0,
                  (s.dailyCapacityKg || 0) - (s.currentCapacityKg || 0)
                );
                return (
                  <PressableScale
                    key={s.id}
                    onPress={goStores}
                    accessibilityLabel={`Store ${s.storeName}`}
                  >
                    <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-border p-3">
                      <View className="min-w-0 flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text
                            className="text-[14px] font-semibold"
                            numberOfLines={1}
                          >
                            {s.storeName}
                          </Text>
                          <View
                            className={
                              "rounded-full px-2 py-0.5 " +
                              (VERIF_BG[s.verificationStatus] || "bg-muted")
                            }
                          >
                            <Text
                              className={
                                "text-[11px] font-semibold " +
                                (VERIF_TEXT[s.verificationStatus] ||
                                  "text-muted-foreground")
                              }
                            >
                              {s.verificationStatus}
                            </Text>
                          </View>
                          {s.status === "Inactive" ? (
                            <View className="rounded-full bg-destructive/10 px-2 py-0.5">
                              <Text className="text-[11px] font-semibold text-destructive">
                                Inactive
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text
                          className="mt-0.5 text-[12px] text-muted-foreground"
                          numberOfLines={1}
                        >
                          {s.address}
                        </Text>
                      </View>
                      <View className="flex-row shrink-0 items-center gap-3">
                        <View className="flex-row items-center gap-1">
                          <Star size={14} color="#ffb800" fill="#ffb800" />
                          <Text className="text-[12px] text-muted-foreground">
                            {s.rating?.toFixed(1) ?? "0.0"}
                          </Text>
                        </View>
                        <Text className="text-[12px] text-muted-foreground">
                          {remaining} kg free
                        </Text>
                      </View>
                    </View>
                  </PressableScale>
                );
              })}
              {stores.length > 4 ? (
                <Pressable
                  onPress={goStores}
                  accessibilityRole="button"
                  accessibilityLabel={`View all ${stores.length} stores`}
                  className="py-1"
                >
                  <Text className="text-center text-[12px] font-semibold text-primary">
                    View all {stores.length} stores
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </Surface>
      </Animated.View>

      {/* New offers */}
      <Animated.View entering={FadeInDown.duration(420).delay(300)}>
        <Surface className="mt-5 gap-3 p-5">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Inbox size={16} color="#ff9f0a" />
              <Text className="text-[15px] font-bold">New offers</Text>
              <View className="rounded-full bg-chart-3/15 px-2 py-0.5">
                <Text className="text-[12px] font-semibold text-chart-3">
                  {openOffers.length}
                </Text>
              </View>
            </View>
            <Button
              size="sm"
              variant="ghost"
              onPress={goPickups}
              className="flex-row gap-1"
            >
              <Text className="text-[12px] font-semibold">Open inbox</Text>
              <ChevronRight size={14} color={c.foreground} />
            </Button>
          </View>
          {openOffers.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No new pickup offers"
              description="New broadcasts appear here."
            />
          ) : (
            <View className="gap-3">
              {openOffers.slice(0, 4).map((r) => (
                <View key={r.id} className="rounded-2xl border border-border p-4">
                  <View className="flex-row items-center gap-2">
                    <View className="rounded-full bg-chart-3/15 px-2 py-0.5">
                      <Text className="text-[11px] font-semibold text-chart-3">
                        {PICKUP_LABELS[r.status]}
                      </Text>
                    </View>
                    {r.distanceKm != null ? (
                      <Text className="text-[12px] text-muted-foreground">
                        {r.distanceKm} km away
                      </Text>
                    ) : null}
                  </View>
                  <View className="mt-2 flex-row items-center gap-1.5">
                    <Package size={14} color={c.mutedForeground} />
                    <Text className="text-[14px] font-semibold">
                      {r.wasteCategory} · {r.wasteQuantity} kg
                    </Text>
                  </View>
                  <View className="mt-1 flex-row items-start gap-1.5">
                    <MapPin size={14} color={c.mutedForeground} style={{ marginTop: 2 }} />
                    <Text
                      className="flex-1 text-[12px] text-muted-foreground"
                      numberOfLines={1}
                    >
                      {r.pickupAddress}
                    </Text>
                  </View>
                  {r.preferredTimeSlot ? (
                    <View className="mt-1 flex-row items-center gap-1.5">
                      <Clock size={14} color={c.mutedForeground} />
                      <Text className="text-[12px] text-muted-foreground">
                        {r.preferredTimeSlot}
                      </Text>
                    </View>
                  ) : null}
                  <Button
                    size="sm"
                    onPress={() => accept(r.id)}
                    loading={busyId === r.id}
                    disabled={busyId === r.id}
                    className="mt-3 flex-row gap-1.5"
                  >
                    <CheckCircle size={14} color="#fff" />
                    <Text className="text-[13px] font-semibold text-primary-foreground">
                      Accept
                    </Text>
                  </Button>
                </View>
              ))}
            </View>
          )}
        </Surface>
      </Animated.View>

      {/* Active pickups */}
      <Animated.View entering={FadeInDown.duration(420).delay(360)}>
        <Surface className="mt-5 gap-3 p-5">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Truck size={16} color={c.primary} />
              <Text className="text-[15px] font-bold">Active pickups</Text>
              <View className="rounded-full bg-muted px-2 py-0.5">
                <Text className="text-[12px] font-semibold text-muted-foreground">
                  {activeJobs.length}
                </Text>
              </View>
            </View>
            <Button
              size="sm"
              variant="ghost"
              onPress={goPickups}
              className="flex-row gap-1"
            >
              <Text className="text-[12px] font-semibold">Manage</Text>
              <ChevronRight size={14} color={c.foreground} />
            </Button>
          </View>
          {activeJobs.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No pickups in progress"
              description="Accept an offer to get started."
            />
          ) : (
            <View className="gap-3">
              {activeJobs.map((r) => (
                <PressableScale
                  key={r.id}
                  onPress={goPickups}
                  accessibilityLabel={`Active pickup at ${r.pickupAddress}`}
                >
                  <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-border p-4">
                    <View className="min-w-0 flex-1 flex-row items-start gap-3">
                      <View className="h-9 w-9 items-center justify-center rounded-xl bg-muted">
                        <MapPin size={16} color={c.mutedForeground} />
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text
                          className="text-[14px] font-semibold"
                          numberOfLines={1}
                        >
                          {r.pickupAddress}
                        </Text>
                        <View className="mt-1 flex-row items-center gap-1">
                          <Package size={12} color={c.mutedForeground} />
                          <Text className="text-[12px] text-muted-foreground">
                            {r.wasteCategory} · {r.wasteQuantity} kg
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View className="shrink-0 rounded-full bg-chart-2/15 px-2.5 py-0.5">
                      <Text className="text-[11px] font-semibold text-chart-2">
                        {PICKUP_LABELS[r.status]}
                      </Text>
                    </View>
                  </View>
                </PressableScale>
              ))}
            </View>
          )}
        </Surface>
      </Animated.View>
    </Screen>
  );
}

function StatTile({
  label,
  value,
  tint,
}: {
  label: string;
  value: number;
  tint: string;
}) {
  return (
    <Surface className="flex-1 items-center p-4">
      <Text className={"text-[30px] font-extrabold leading-none " + tint}>
        {value}
      </Text>
      <Text className="mt-1.5 text-[12px] font-medium text-muted-foreground">
        {label}
      </Text>
    </Surface>
  );
}
