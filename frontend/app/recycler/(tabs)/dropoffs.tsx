import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  Calendar,
  CheckCircle,
  Clock,
  Inbox,
  Package,
  RefreshCw,
  XCircle,
} from "lucide-react-native";
import {
  api,
  type DropOffRequest,
  type DropOffStatus,
} from "@/lib/api";
import {
  Screen,
  Text,
  Button,
  Surface,
  EmptyState,
  LoadingState,
} from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { BookingDetails } from "@/components/booking/BookingDetails";
import { GradientHeader } from "@/components/GradientHeader";
import { CollectPanel } from "@/components/recycler/CollectPanel";
import { useColors } from "@/lib/theme";
import { DOMAIN } from "@/lib/domains";

// Statuses still needing recycler action (drive the "active" grouping).
const ACTIVE_STATUSES: DropOffStatus[] = [
  "REQUESTED",
  "APPROVED",
  "CHECKED_IN",
  "OTP_PENDING",
];

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function RecyclerDropoffsScreen() {
  const c = useColors();
  const [items, setItems] = useState<DropOffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [otpInput, setOtpInput] = useState<Record<number, string>>({});
  const [qtyInput, setQtyInput] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<DropOffRequest[]>(
        "/dropoff-requests/store/incoming"
      );
      setItems(data);
    } catch {
      setError("Could not load drop-off requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

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

  const approve = (id: number) =>
    run(id, () => api.post(`/dropoff-requests/${id}/approve`));
  const reject = (id: number) =>
    run(id, () => api.post(`/dropoff-requests/${id}/reject`));
  // Recycler enters the customer's OTP + actual collected quantity to complete.
  const collect = (id: number) =>
    run(id, () =>
      api.post(`/dropoff-requests/${id}/collect`, {
        otp: (otpInput[id] || "").trim(),
        actualQuantityKg: Number(qtyInput[id]),
      })
    );

  const active = items.filter((r) => ACTIVE_STATUSES.includes(r.status));
  const history = items.filter((r) => !ACTIVE_STATUSES.includes(r.status));

  return (
    <Screen contentClassName="gap-6 py-6">
      {/* Header */}
      <GradientHeader
        eyebrow="DROP-OFFS"
        title="Drop-off Requests"
        subtitle="Approve incoming drop-offs and verify collections at your stores."
        colors={DOMAIN.dropoffs}
        icon={Calendar}
        right={
          <Pressable
            onPress={load}
            accessibilityRole="button"
            accessibilityLabel="Refresh drop-off requests"
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
        <LoadingState label="Loading drop-off requests…" />
      ) : (
        <>
          {/* ACTIVE */}
          <View className="gap-3">
            <View className="flex-row items-center gap-2">
              <Inbox size={16} color="#ff9f0a" />
              <Text className="text-[16px] font-bold tracking-tight">Active</Text>
              <View className="rounded-full bg-muted px-2.5 py-0.5">
                <Text className="text-[12px] font-semibold text-muted-foreground">
                  {active.length}
                </Text>
              </View>
            </View>
            {active.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Nothing needs your attention"
                description="No drop-offs need your attention right now."
              />
            ) : (
              active.map((r, i) => (
                <Animated.View
                  key={r.id}
                  entering={FadeInDown.duration(400).delay(Math.min(i, 6) * 70)}
                >
                <Surface className="gap-4 p-5">
                  <Summary r={r} />

                  <View className="flex-row flex-wrap items-center gap-2">
                    {r.status === "REQUESTED" ? (
                      <>
                        <Button
                          size="sm"
                          onPress={() => approve(r.id)}
                          loading={busyId === r.id}
                          disabled={busyId === r.id}
                          className="flex-row gap-1.5"
                        >
                          <CheckCircle size={14} color="#fff" />
                          <Text className="text-[13px] font-semibold text-primary-foreground">
                            Approve
                          </Text>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onPress={() => reject(r.id)}
                          disabled={busyId === r.id}
                          className="flex-row gap-1.5"
                        >
                          <XCircle size={14} color={c.destructive} />
                          <Text className="text-[13px] font-semibold text-destructive">
                            Reject
                          </Text>
                        </Button>
                      </>
                    ) : null}
                    {r.status === "APPROVED" || r.status === "CHECKED_IN" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onPress={() => reject(r.id)}
                        disabled={busyId === r.id}
                        className="flex-row gap-1.5"
                      >
                        <XCircle size={14} color={c.destructive} />
                        <Text className="text-[13px] font-semibold text-destructive">
                          Cancel
                        </Text>
                      </Button>
                    ) : null}
                  </View>

                  {r.status === "OTP_PENDING" ? (
                    <CollectPanel
                      declaredQty={r.wasteQuantity}
                      otp={otpInput[r.id] || ""}
                      qty={qtyInput[r.id] ?? String(r.wasteQuantity)}
                      busy={busyId === r.id}
                      onOtp={(v) => setOtpInput((p) => ({ ...p, [r.id]: v }))}
                      onQty={(v) => setQtyInput((p) => ({ ...p, [r.id]: v }))}
                      onSubmit={() => collect(r.id)}
                      quantityVerb="received"
                    />
                  ) : null}
                  <BookingDetails
                    type="dropoff"
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

          {/* HISTORY */}
          {history.length > 0 ? (
            <View className="gap-2">
              <Text className="text-[16px] font-bold tracking-tight">
                History
              </Text>
              {history.map((r, i) => (
                <Animated.View
                  key={r.id}
                  entering={FadeInDown.duration(400).delay(Math.min(i, 6) * 60)}
                >
                <Surface className="p-4">
                  <Summary r={r} compact />
                  <BookingDetails
                    type="dropoff"
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
              ))}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Summary({ r, compact }: { r: DropOffRequest; compact?: boolean }) {
  const c = useColors();
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-2">
        <StatusBadge status={r.status} />
        <Text className="text-[12px] text-muted-foreground">
          {r.userName ?? `User #${r.userId}`}
        </Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        <Package size={14} color={c.mutedForeground} />
        <Text className="text-[14px] font-medium">
          {r.wasteCategory} · {r.wasteQuantity} kg
          {!compact && r.storeName ? (
            <Text className="text-muted-foreground"> · {r.storeName}</Text>
          ) : null}
        </Text>
      </View>
      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
        <View className="flex-row items-center gap-1">
          <Calendar size={14} color={c.mutedForeground} />
          <Text className="text-[12px] text-muted-foreground">
            {fmtDate(r.scheduledDate)}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Clock size={14} color={c.mutedForeground} />
          <Text className="text-[12px] text-muted-foreground">{r.timeSlot}</Text>
        </View>
      </View>
    </View>
  );
}
