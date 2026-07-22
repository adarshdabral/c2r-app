import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { format } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Navigation,
  PackageCheck,
} from "lucide-react-native";
import { api, type WasteType } from "@/lib/api";
import { GradientHeader } from "@/components/GradientHeader";
import { DOMAIN } from "@/lib/domains";
import {
  Text,
  Button,
  Input,
  Field,
  Surface,
  Select,
  LoadingState,
  ErrorState,
  type SelectOption,
} from "@/components/ui";
import { CategoryMultiSelect } from "@/components/CategoryMultiSelect";
import { useLocation } from "@/hooks/useLocation";

type SelectableStore = {
  id: number;
  storeName: string;
  address: string;
  acceptedWasteTypes: WasteType[];
  status?: string;
  verificationStatus?: string;
  distanceKm?: number;
};

// Fixed drop-off slots — the backend stores the slot as a free-form label.
const TIME_SLOTS = [
  "09:00 - 11:00",
  "11:00 - 13:00",
  "13:00 - 15:00",
  "15:00 - 17:00",
  "17:00 - 19:00",
];

const SLOT_OPTIONS: SelectOption[] = TIME_SLOTS.map((s) => ({
  value: s,
  label: s,
}));

export default function UserDropoffScreen() {
  const router = useRouter();
  const { storeId: storeIdParam } = useLocalSearchParams<{ storeId?: string }>();
  const { request: requestLocation } = useLocation();

  const [stores, setStores] = useState<SelectableStore[]>([]);
  const [store, setStore] = useState<SelectableStore | null>(null);
  const [storeLoading, setStoreLoading] = useState(Boolean(storeIdParam));
  const [storeError, setStoreError] = useState("");

  const [wasteCategories, setWasteCategories] = useState<WasteType[]>([]);
  const [quantity, setQuantity] = useState("");
  const [dateObj, setDateObj] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [timeSlot, setTimeSlot] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  /* ===== MODE A: a specific store via ?storeId= ===== */
  useEffect(() => {
    if (!storeIdParam) return;
    setStoreLoading(true);
    api
      .get<SelectableStore>(`/stores/${storeIdParam}`)
      .then((res) => {
        setStore(res.data);
        setWasteCategories([]);
      })
      .catch((err: any) =>
        setStoreError(
          err?.response?.status === 404
            ? "Store not found. It may have been removed."
            : "Failed to load this store."
        )
      )
      .finally(() => setStoreLoading(false));
  }, [storeIdParam]);

  /* ===== MODE B: discover nearby stores ===== */
  useEffect(() => {
    if (storeIdParam) return;
    requestLocation().then((loc) => {
      if (!loc) return;
      api
        .get<SelectableStore[]>(
          `/stores/nearest?lat=${loc.lat}&lng=${loc.lng}&eligibleOnly=true`
        )
        .then((res) => {
          setStores(res.data);
          const first = res.data[0] ?? null;
          setStore(first);
          setWasteCategories([]);
        })
        .catch(() => setError("Failed to fetch nearby stores"));
    });
  }, [storeIdParam, requestLocation]);

  const selectStore = (s: SelectableStore) => {
    setStore(s);
    setWasteCategories([]);
  };

  const ineligibleReason = useMemo(() => {
    if (!store) return "";
    if (store.status && store.status !== "Active")
      return "This store is currently inactive.";
    if (store.verificationStatus && store.verificationStatus !== "Verified")
      return "This store is pending verification.";
    return "";
  }, [store]);

  const scheduledDate = dateObj ? format(dateObj, "yyyy-MM-dd") : "";

  const handleSubmit = async () => {
    if (
      !store ||
      wasteCategories.length === 0 ||
      !quantity ||
      !scheduledDate ||
      !timeSlot
    ) {
      setError("Pick a store, at least one e-waste type, quantity, date and slot.");
      return;
    }
    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) {
      setError("Quantity must be a positive number");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.post("/dropoff-requests", {
        storeId: store.id,
        wasteCategories,
        wasteQuantity: q,
        scheduledDate,
        timeSlot,
      });
      setDone(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Could not request drop-off");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- states ---------------- */
  if (storeLoading) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-background">
        <View className="flex-1 px-5 pt-4">
          <LoadingState label="Loading store…" />
        </View>
      </SafeAreaView>
    );
  }
  if (storeError) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-background">
        <View className="flex-1 px-5 pt-4">
          <ErrorState
            description={storeError}
            onRetry={() => router.replace("/dashboard" as any)}
          />
        </View>
      </SafeAreaView>
    );
  }
  if (done) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-background">
        <View className="flex-1 justify-center px-5">
          <Surface className="items-center gap-4 px-6 py-16">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-primary/[0.12]">
              <CheckCircle2 size={32} color="#34c759" strokeWidth={2.2} />
            </View>
            <View className="items-center">
              <Text className="font-display text-[21px] tracking-tight">
                Request submitted
              </Text>
              <Text className="mt-1.5 max-w-sm text-center text-[14px] leading-relaxed text-muted-foreground">
                {store?.storeName} will review your request. You&apos;ll be
                notified once it&apos;s approved.
              </Text>
            </View>
            <View className="mt-2 w-full gap-2.5">
              <Button onPress={() => router.push("/dropoff/mine" as any)}>
                View my drop-offs
              </Button>
              <Button
                variant="outline"
                onPress={() => router.replace("/dashboard" as any)}
              >
                Back to dashboard
              </Button>
            </View>
          </Surface>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-5 px-5 pb-10 pt-4">
        <GradientHeader
          eyebrow="DROP-OFF"
          title="Schedule a drop-off"
          subtitle={
            store
              ? `Drop your recycling at ${store.storeName}.`
              : "Pick a store, a date, and a time slot."
          }
          colors={DOMAIN.dropoffs}
          icon={PackageCheck}
        />

        {/* STORE SELECTION (discovery mode only) */}
        {!storeIdParam ? (
          <Surface className="gap-3 p-5">
            <Text className="text-[15px] font-bold">Choose a store</Text>
            {stores.length === 0 ? (
              <Text className="py-2 text-center text-[13px] text-muted-foreground">
                Finding stores near you…
              </Text>
            ) : (
              <View className="gap-2">
                {stores.map((s, i) => {
                  const active = store?.id === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => selectStore(s)}
                      className={
                        "rounded-2xl border p-3.5 " +
                        (active
                          ? "border-primary/30 bg-primary/[0.06]"
                          : "border-border bg-card")
                      }
                    >
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className="text-[14px] font-semibold">
                          {s.storeName}
                        </Text>
                        {i === 0 ? (
                          <View className="rounded-full bg-primary px-2 py-0.5">
                            <Text className="text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                              Nearest
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View className="mt-1 flex-row items-center gap-1.5">
                        <Navigation size={12} color="#34c759" />
                        <Text className="text-[12px] text-muted-foreground">
                          {s.distanceKm ?? 0} km
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Surface>
        ) : null}

        {ineligibleReason ? (
          <View className="flex-row items-center gap-2 rounded-xl bg-chart-3/10 px-4 py-3">
            <AlertCircle size={16} color="#9a5b00" />
            <Text className="flex-1 text-[13.5px] font-semibold text-chart-3">
              {ineligibleReason}
            </Text>
          </View>
        ) : null}

        {/* WASTE + QUANTITY */}
        <Surface className="gap-4 p-5">
          <Text className="text-[15px] font-bold">
            What are you dropping off?
          </Text>
          <Field label="E-waste types (select one or more)">
            {store && store.acceptedWasteTypes.length > 0 ? (
              <CategoryMultiSelect
                options={store.acceptedWasteTypes}
                value={wasteCategories}
                onChange={setWasteCategories}
              />
            ) : (
              <Text className="text-[13px] text-muted-foreground">
                {store ? "This store lists no accepted types." : "Select a store first."}
              </Text>
            )}
          </Field>
          <Field label="Quantity (kg)">
            <Input
              keyboardType="decimal-pad"
              placeholder="e.g. 8"
              value={quantity}
              onChangeText={setQuantity}
            />
          </Field>
        </Surface>

        {/* DATE + TIME SLOT */}
        <Surface className="gap-4 p-5">
          <View className="flex-row items-center gap-1.5">
            <Clock size={16} color="#34c759" />
            <Text className="text-[15px] font-bold">When works for you?</Text>
          </View>
          <Field label="Date">
            <Pressable
              onPress={() => setShowDatePicker(true)}
              className="h-12 flex-row items-center rounded-full border border-input bg-card px-4"
            >
              <Text
                className={
                  "text-[15px] " +
                  (dateObj ? "text-foreground" : "text-muted-foreground")
                }
              >
                {dateObj
                  ? format(dateObj, "EEE, MMM d, yyyy")
                  : "Select a date"}
              </Text>
            </Pressable>
          </Field>
          {showDatePicker ? (
            <DateTimePicker
              value={dateObj ?? new Date()}
              mode="date"
              minimumDate={new Date()}
              onChange={(e, d) => {
                setShowDatePicker(Platform.OS === "ios");
                if (e.type === "set" && d) setDateObj(d);
                if (e.type === "dismissed") setShowDatePicker(false);
              }}
            />
          ) : null}
          <Field label="Time slot">
            <Select
              value={timeSlot}
              onValueChange={setTimeSlot}
              options={SLOT_OPTIONS}
              placeholder="Select a time slot"
            />
          </Field>
        </Surface>

        {/* SUMMARY */}
        {store ? (
          <Surface className="gap-3 bg-primary/[0.04] p-5">
            <Text className="text-[15px] font-bold">Drop-off summary</Text>
            <View className="gap-2.5">
              <Row label="Store" value={store.storeName} />
              <Row label="Waste types" value={wasteCategories.join(", ") || "—"} />
              <Row label="Quantity" value={quantity ? `${quantity} kg` : "—"} />
              <Row
                label="Date"
                value={
                  dateObj ? format(dateObj, "EEE, MMM d, yyyy") : "—"
                }
              />
              <Row label="Time slot" value={timeSlot || "—"} />
            </View>
          </Surface>
        ) : null}

        {error ? (
          <View className="rounded-xl bg-destructive/10 px-4 py-3">
            <Text className="text-[13px] font-medium text-destructive">
              {error}
            </Text>
          </View>
        ) : null}

        <Button
          size="lg"
          onPress={handleSubmit}
          loading={loading}
          disabled={!store || Boolean(ineligibleReason)}
          className="flex-row gap-2"
        >
          <PackageCheck size={16} color="#fff" />
          <Text className="text-[15px] font-semibold text-primary-foreground">
            Request drop-off
          </Text>
        </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="text-[13.5px] text-muted-foreground">{label}</Text>
      <Text className="flex-1 text-right text-[13.5px] font-semibold">
        {value}
      </Text>
    </View>
  );
}
