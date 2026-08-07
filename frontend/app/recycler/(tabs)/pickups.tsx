import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  CheckCircle,
  Clock,
  Inbox,
  MapPin,
  Package,
  RefreshCw,
  Truck,
  XCircle,
} from "lucide-react-native";
import {
  api,
  type PickupRequest,
  type PickupStatus,
} from "@/lib/api";
import {
  Screen,
  Text,
  Button,
  Surface,
  Dialog,
  EmptyState,
  LoadingState,
} from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { BookingDetails } from "@/components/booking/BookingDetails";
import { GradientHeader } from "@/components/GradientHeader";
import { CollectPanel } from "@/components/recycler/CollectPanel";
import { useColors } from "@/lib/theme";
import { DOMAIN } from "@/lib/domains";
import { PICKUP_LABELS } from "@/lib/constants";

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

// The active-assignment statuses (this recycler owns the job).
const ACTIVE_STATUSES: PickupStatus[] = [
  "ACCEPTED",
  "EN_ROUTE",
  "ARRIVED",
  "OTP_PENDING",
];

export default function RecyclerPickupsScreen() {
  const c = useColors();
  const [requests, setRequests] = useState<PickupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  // Collection inputs, keyed by request id: the customer's OTP + actual quantity.
  const [otpInput, setOtpInput] = useState<Record<number, string>>({});
  const [qtyInput, setQtyInput] = useState<Record<number, string>>({});

  // details modal
  const [detail, setDetail] = useState<PickupRequest | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<PickupRequest[]>(
        "/pickup-requests/recycler/inbox"
      );
      setRequests(data);
    } catch {
      setError("Could not load pickup requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000); // keep the inbox fresh (broadcasts/expiry)
    return () => clearInterval(t);
  }, [load]);

  // Runs an action, surfaces errors, then refreshes the inbox.
  const run = async (id: number, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setError("");
    try {
      await fn();
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Action failed. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const accept = (id: number) =>
    run(id, () => api.post(`/pickup-requests/${id}/accept`));
  const reject = (id: number) =>
    run(id, () => api.post(`/pickup-requests/${id}/reject`));

  // Recycler enters the customer's OTP + the actual collected quantity to
  // complete the pickup (Waste Collection Service Flow).
  const collect = (id: number) =>
    run(id, () =>
      api.post(`/pickup-requests/${id}/collect`, {
        otp: (otpInput[id] || "").trim(),
        actualQuantityKg: Number(qtyInput[id]),
      })
    );

  const openOffers = requests.filter(
    (r) => r.status === "BROADCASTED" && r.candidateStatus === "NOTIFIED"
  );
  const activeJobs = requests.filter((r) => ACTIVE_STATUSES.includes(r.status));

  return (
    <Screen contentClassName="gap-6 py-6">
      {/* Header */}
      <GradientHeader
        eyebrow="PICKUPS"
        title="Pickup Requests"
        subtitle="Review broadcast offers and manage pickups you've accepted."
        colors={DOMAIN.pickups}
        icon={Truck}
        right={
          <Pressable
            onPress={load}
            accessibilityRole="button"
            accessibilityLabel="Refresh pickup requests"
            className="flex-row items-center gap-1.5 rounded-full bg-white/20 px-3 py-2"
          >
            <RefreshCw size={14} color="#fff" />
            <Text className="text-[12.5px] font-semibold text-white">
              Refresh
            </Text>
          </Pressable>
        }
      />

      {error ? (
        <View className="rounded-xl border-l-4 border-l-destructive bg-destructive/10 px-4 py-2.5">
          <Text className="text-[13px] font-medium text-destructive">
            {error}
          </Text>
        </View>
      ) : null}

      {loading ? (
        <LoadingState label="Loading pickup requests…" />
      ) : (
        <>
          {/* OPEN OFFERS */}
          <View className="gap-3">
            <View className="flex-row items-center gap-2">
              <Inbox size={16} color="#ff9f0a" />
              <Text className="text-[16px] font-bold tracking-tight">
                New offers
              </Text>
              <View className="rounded-full bg-chart-3/15 px-2.5 py-0.5">
                <Text className="text-[12px] font-semibold text-chart-3">
                  {openOffers.length}
                </Text>
              </View>
            </View>
            {openOffers.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No new pickup offers"
                description="New broadcasts appear here."
              />
            ) : (
              openOffers.map((r, i) => (
                <Animated.View
                  key={r.id}
                  entering={FadeInDown.duration(400).delay(Math.min(i, 6) * 70)}
                >
                <Surface className="gap-3 p-5">
                  <RequestSummary r={r} onDetails={() => setDetail(r)} />
                  <View className="flex-row gap-2">
                    <Button
                      size="sm"
                      onPress={() => accept(r.id)}
                      loading={busyId === r.id}
                      disabled={busyId === r.id}
                      className="flex-1 flex-row gap-1.5"
                    >
                      <CheckCircle size={14} color="#fff" />
                      <Text className="text-[13px] font-semibold text-primary-foreground">
                        Accept
                      </Text>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onPress={() => reject(r.id)}
                      disabled={busyId === r.id}
                      className="flex-1 flex-row gap-1.5"
                    >
                      <XCircle size={14} color={c.destructive} />
                      <Text className="text-[13px] font-semibold text-destructive">
                        Reject
                      </Text>
                    </Button>
                  </View>
                </Surface>
                </Animated.View>
              ))
            )}
          </View>

          {/* ACTIVE JOBS */}
          <View className="gap-3">
            <View className="flex-row items-center gap-2">
              <Truck size={16} color={c.primary} />
              <Text className="text-[16px] font-bold tracking-tight">
                Active pickups
              </Text>
              <View className="rounded-full bg-muted px-2.5 py-0.5">
                <Text className="text-[12px] font-semibold text-muted-foreground">
                  {activeJobs.length}
                </Text>
              </View>
            </View>
            {activeJobs.length === 0 ? (
              <EmptyState
                icon={Truck}
                title="No pickups in progress"
                description="Accept an offer to get started."
              />
            ) : (
              activeJobs.map((r, i) => (
                <Animated.View
                  key={r.id}
                  entering={FadeInDown.duration(400).delay(Math.min(i, 6) * 70)}
                >
                <Surface className="gap-4 p-5">
                  <RequestSummary r={r} onDetails={() => setDetail(r)} />
                  {r.status === "OTP_PENDING" ? (
                    <CollectPanel
                      declaredQty={r.wasteQuantity}
                      otp={otpInput[r.id] || ""}
                      qty={qtyInput[r.id] ?? String(r.wasteQuantity)}
                      busy={busyId === r.id}
                      onOtp={(v) =>
                        setOtpInput((p) => ({ ...p, [r.id]: v }))
                      }
                      onQty={(v) =>
                        setQtyInput((p) => ({ ...p, [r.id]: v }))
                      }
                      onSubmit={() => collect(r.id)}
                    />
                  ) : (
                    <Text className="text-[12px] text-muted-foreground">
                      Accepted — awaiting collection.
                    </Text>
                  )}
                  <BookingDetails
                    type="pickup"
                    id={r.id}
                    role="recycler"
                    declaredQty={r.wasteQuantity}
                    verifiedQty={r.actualQuantityKg}
                    items={r.items}
                    sanitizationRequested={r.sanitizationRequested}
                    onChange={load}
                  />
                </Surface>
                </Animated.View>
              ))
            )}
          </View>
        </>
      )}

      {/* DETAILS MODAL */}
      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Pickup details"
      >
        {detail ? <DetailBody r={detail} /> : null}
      </Dialog>
    </Screen>
  );
}

/* ----------------------------- sub-components ----------------------------- */

function RequestSummary({
  r,
  onDetails,
}: {
  r: PickupRequest;
  onDetails: () => void;
}) {
  const c = useColors();
  return (
    <View className="flex-row items-start justify-between gap-3">
      <View className="min-w-0 flex-1 gap-1.5">
        <View className="flex-row items-center gap-2">
          <StatusBadge status={r.status} />
          {r.distanceKm != null ? (
            <Text className="text-[12px] text-muted-foreground">
              {r.distanceKm} km away
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center gap-1.5">
          <Package size={14} color={c.mutedForeground} />
          <Text className="text-[14px] font-medium">
            {r.wasteCategory} · {r.wasteQuantity} kg
          </Text>
        </View>
        <View className="flex-row items-start gap-1.5">
          <MapPin size={14} color={c.mutedForeground} style={{ marginTop: 2 }} />
          <Text
            className="flex-1 text-[13px] text-muted-foreground"
            numberOfLines={2}
          >
            {r.pickupAddress}
          </Text>
        </View>
        {r.preferredTimeSlot ? (
          <View className="flex-row items-center gap-1.5">
            <Clock size={14} color={c.mutedForeground} />
            <Text className="text-[12px] text-muted-foreground">
              {r.preferredTimeSlot}
            </Text>
          </View>
        ) : null}
      </View>
      <Button size="sm" variant="ghost" onPress={onDetails} className="shrink-0">
        <Text className="text-[12px] font-semibold">Details</Text>
      </Button>
    </View>
  );
}

function DetailBody({ r }: { r: PickupRequest }) {
  const rows: [string, string][] = [
    ["Status", PICKUP_LABELS[r.status]],
    ["Customer", r.userName ?? `#${r.userId}`],
    ["Waste", `${r.wasteCategory} · ${r.wasteQuantity} kg`],
    ["Address", r.pickupAddress],
    ["Preferred time", r.preferredTimeSlot || "Any"],
    ["Coordinates", `${r.pickupLatitude}, ${r.pickupLongitude}`],
    ["Created", fmt(r.createdAt)],
    ["Acceptance deadline", fmt(r.acceptanceDeadline)],
    ...(r.assignedStoreId
      ? ([["Assigned store", r.storeName ?? `#${r.assignedStoreId}`]] as [
          string,
          string,
        ][])
      : []),
    ...(r.completionTimestamp
      ? ([["Completed", fmt(r.completionTimestamp)]] as [string, string][])
      : []),
  ];

  return (
    <View className="gap-3">
      <View className="gap-2">
        {rows.map(([k, v]) => (
          <View key={k} className="flex-row justify-between gap-4">
            <Text className="text-[13px] text-muted-foreground">{k}</Text>
            <Text className="flex-1 text-right text-[13px] font-medium">
              {v}
            </Text>
          </View>
        ))}
      </View>

      {r.candidates && r.candidates.length > 0 ? (
        <View className="border-t border-border pt-3">
          <Text className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Broadcast history
          </Text>
          <View className="gap-1">
            {r.candidates.map((c) => (
              <View key={c.id} className="flex-row justify-between gap-2">
                <Text className="flex-1 text-[12px] text-muted-foreground">
                  R{c.round} · {c.storeName}
                  {c.distanceKm != null ? ` · ${c.distanceKm} km` : ""}
                </Text>
                <Text className="text-[12px] font-medium">{c.status}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
