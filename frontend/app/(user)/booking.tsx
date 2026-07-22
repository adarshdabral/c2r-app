import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { format } from "date-fns";
import {
  AlertCircle,
  CalendarClock,
  MapPin,
  Navigation,
} from "lucide-react-native";
import { api, type WasteType } from "@/lib/api";
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
import { useLocation } from "@/hooks/useLocation";

// Unified shape used for both the nearest-store list and a pre-selected store.
type SelectableStore = {
  id: number;
  storeName: string;
  address: string;
  acceptedWasteTypes: WasteType[];
  pickupAvailability: boolean;
  status?: string;
  verificationStatus?: string;
  distanceKm?: number;
};

export default function BookingScreen() {
  const router = useRouter();
  const { storeId: storeIdParam } = useLocalSearchParams<{ storeId?: string }>();
  const { request: requestLocation } = useLocation();

  const [stores, setStores] = useState<SelectableStore[]>([]);
  const [store, setStore] = useState<SelectableStore | null>(null);
  const [storeLoading, setStoreLoading] = useState(Boolean(storeIdParam));
  const [storeError, setStoreError] = useState("");

  const [wasteType, setWasteType] = useState<string>("");
  const [estimatedWeight, setEstimatedWeight] = useState("");
  const [address, setAddress] = useState("");
  const [userLocation, setUserLocation] = useState({ lat: 0, lng: 0 });

  const [dateObj, setDateObj] = useState<Date | null>(null);
  const [timeObj, setTimeObj] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* ================= GET LOCATION ================= */
  useEffect(() => {
    requestLocation().then((loc) => {
      if (loc) setUserLocation({ lat: loc.lat, lng: loc.lng });
    });
  }, [requestLocation]);

  /* ===== MODE A: a specific store was passed via ?storeId= ===== */
  useEffect(() => {
    if (!storeIdParam) return;
    setStoreLoading(true);
    api
      .get<SelectableStore>(`/stores/${storeIdParam}`)
      .then((res) => {
        setStore(res.data);
        setWasteType(res.data.acceptedWasteTypes?.[0] ?? "");
      })
      .catch((err: any) => {
        setStoreError(
          err?.response?.status === 404
            ? "Store not found. It may have been removed."
            : "Failed to load this store."
        );
      })
      .finally(() => setStoreLoading(false));
  }, [storeIdParam]);

  /* ===== MODE B: no storeId — discover nearby stores ===== */
  useEffect(() => {
    if (storeIdParam || !userLocation.lat) return;
    api
      .get<SelectableStore[]>(
        `/stores/nearest?lat=${userLocation.lat}&lng=${userLocation.lng}`
      )
      .then((res) => {
        setStores(res.data);
        const first = res.data[0] ?? null;
        setStore(first);
        setWasteType(first?.acceptedWasteTypes?.[0] ?? "");
      })
      .catch(() => setError("Failed to fetch nearby stores"));
  }, [storeIdParam, userLocation]);

  const selectStore = (s: SelectableStore) => {
    setStore(s);
    setWasteType(s.acceptedWasteTypes?.[0] ?? "");
  };

  const ineligibleReason = useMemo(() => {
    if (!store) return "";
    if (store.status && store.status !== "Active")
      return "This store is currently inactive.";
    if (store.verificationStatus && store.verificationStatus !== "Verified")
      return "This store is pending verification.";
    if (store.pickupAvailability === false)
      return "This store is not accepting pickups right now.";
    return "";
  }, [store]);

  const wasteOptions: SelectOption[] = (store?.acceptedWasteTypes ?? []).map(
    (t) => ({ value: t, label: t })
  );

  /* ================= BOOKING ================= */
  const handleBooking = async () => {
    if (
      !store ||
      !wasteType ||
      !estimatedWeight ||
      !address ||
      !dateObj ||
      !timeObj
    ) {
      setError("All fields are required");
      return;
    }
    const weight = Number(estimatedWeight);
    if (!Number.isFinite(weight) || weight <= 0) {
      setError("Estimated weight must be a positive number");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const pickup_date = new Date(dateObj);
      pickup_date.setHours(timeObj.getHours(), timeObj.getMinutes(), 0, 0);
      await api.post("/bookings", {
        store_id: store.id,
        waste_type: wasteType,
        estimated_weight_kg: weight,
        latitude: userLocation.lat,
        longitude: userLocation.lng,
        address,
        pickup_date,
      });
      router.replace("/dashboard" as any);
    } catch (err: any) {
      // Surface the backend's friendly message (capacity full, inactive, etc.).
      setError(err?.response?.data?.message || "Booking failed");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- store-load states (mode A) ---------------- */
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

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-5 px-5 pb-10 pt-4">
          {/* HEADER */}
          <View>
            <Text className="text-[24px] font-extrabold tracking-tight">
              Book Pickup
            </Text>
            <Text className="mt-1 text-[13px] text-muted-foreground">
              {store
                ? `Schedule a pickup with ${store.storeName}`
                : "Choose a store, date & time"}
            </Text>
          </View>

          {/* STORE SELECTION (discovery mode only) */}
          {!storeIdParam ? (
            <Surface className="gap-2 p-4">
              {stores.length === 0 ? (
                <Text className="text-[13px] text-muted-foreground">
                  Finding stores near you…
                </Text>
              ) : (
                stores.map((s, i) => {
                  const active = store?.id === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => selectStore(s)}
                      className={
                        "rounded-2xl border p-3.5 " +
                        (active
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card")
                      }
                    >
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className="text-[14px] font-semibold">
                          {s.storeName}
                        </Text>
                        {i === 0 ? (
                          <View className="rounded bg-primary/10 px-2 py-0.5">
                            <Text className="text-[11px] font-semibold text-primary">
                              Nearest
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View className="mt-1 flex-row items-center gap-1.5">
                        <Navigation size={12} color="#6c7278" />
                        <Text className="text-[12px] text-muted-foreground">
                          {s.distanceKm ?? 0} km
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
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

          {/* WASTE TYPE + ESTIMATED WEIGHT */}
          <Surface className="gap-4 p-5">
            <Field label="Waste Type">
              <Select
                value={wasteType}
                onValueChange={setWasteType}
                options={wasteOptions}
                placeholder={
                  wasteOptions.length === 0 ? "No accepted types" : "Select…"
                }
                disabled={!store}
              />
            </Field>
            <Field label="Estimated Weight (kg)">
              <Input
                keyboardType="decimal-pad"
                placeholder="e.g. 10"
                value={estimatedWeight}
                onChangeText={setEstimatedWeight}
              />
            </Field>
          </Surface>

          {/* ADDRESS */}
          <Surface className="gap-3 p-5">
            <Field label="Pickup Address">
              <Input
                placeholder="Enter your address"
                value={address}
                onChangeText={setAddress}
              />
            </Field>
          </Surface>

          {/* DATE & TIME */}
          <Surface className="gap-4 p-5">
            <View className="flex-row items-center gap-1.5">
              <CalendarClock size={16} color="#34c759" />
              <Text className="text-[15px] font-bold">
                When should we collect?
              </Text>
            </View>
            <Field label="Pickup Date">
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
            <Field label="Pickup Time">
              <Pressable
                onPress={() => setShowTimePicker(true)}
                className="h-12 flex-row items-center rounded-full border border-input bg-card px-4"
              >
                <Text
                  className={
                    "text-[15px] " +
                    (timeObj ? "text-foreground" : "text-muted-foreground")
                  }
                >
                  {timeObj ? format(timeObj, "h:mm a") : "Select a time"}
                </Text>
              </Pressable>
            </Field>
            {showTimePicker ? (
              <DateTimePicker
                value={timeObj ?? new Date()}
                mode="time"
                minuteInterval={5}
                onChange={(e, d) => {
                  setShowTimePicker(Platform.OS === "ios");
                  if (e.type === "set" && d) setTimeObj(d);
                  if (e.type === "dismissed") setShowTimePicker(false);
                }}
              />
            ) : null}
          </Surface>

          {/* BOOKING SUMMARY */}
          {store ? (
            <Surface className="gap-2.5 border-primary/20 bg-primary/[0.02] p-5">
              <Text className="text-[15px] font-bold">Booking Summary</Text>
              <Row label="Store" value={store.storeName} />
              <Row label="Address" value={address || store.address} icon />
              <Row label="Waste Type" value={wasteType || "—"} />
              <Row
                label="Estimated Weight"
                value={estimatedWeight ? `${estimatedWeight} kg` : "—"}
              />
              <Row
                label="Pickup Date"
                value={dateObj ? format(dateObj, "EEE, MMM d, yyyy") : "—"}
              />
              <Row
                label="Pickup Time"
                value={timeObj ? format(timeObj, "h:mm a") : "—"}
              />
            </Surface>
          ) : null}

          {/* ERROR */}
          {error ? (
            <Text className="text-[13px] font-medium text-destructive">
              {error}
            </Text>
          ) : null}

          {/* CONFIRM */}
          <Button
            onPress={handleBooking}
            loading={loading}
            disabled={!store || Boolean(ineligibleReason)}
          >
            Confirm Booking
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="text-[13.5px] text-muted-foreground">{label}</Text>
      <View className="flex-1 flex-row items-center justify-end gap-1">
        {icon ? <MapPin size={12} color="#6c7278" /> : null}
        <Text className="text-right text-[13.5px] font-medium" numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}
