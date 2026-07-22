import { useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import {
  CheckCircle2,
  Clock,
  Info,
  LocateFixed,
  MapPin,
  Package,
} from "lucide-react-native";
import { api, type SavedAddress, type WasteType } from "@/lib/api";
import {
  Screen,
  Text,
  Button,
  Input,
  Field,
  Surface,
  Select,
  type SelectOption,
} from "@/components/ui";
import { LocationPicker } from "@/components/location/LocationPicker";
import { CategoryMultiSelect } from "@/components/CategoryMultiSelect";
import { useLocation } from "@/hooks/useLocation";

const WASTE_TYPES: WasteType[] = [
  "Waste Batteries",
  "PCB Scrap",
  "Mobile Phone Scrap",
  "Laptop Scrap",
  "Computer Scrap",
  "Hard Drive Scrap",
  "IT Equipment Scrap",
  "Telecom Equipment Scrap",
  "Display Panel Scrap",
];

const TIME_SLOTS = [
  "09:00 - 11:00",
  "11:00 - 13:00",
  "13:00 - 15:00",
  "15:00 - 17:00",
  "17:00 - 19:00",
];

const SLOT_OPTIONS: SelectOption[] = [
  { value: "", label: "No preference" },
  ...TIME_SLOTS.map((s) => ({ value: s, label: s })),
];

type LatLng = { lat: number; lng: number };

export default function NewPickupScreen() {
  const router = useRouter();
  const { coords: userLocation, request: requestLocation } = useLocation();

  const [wasteCategories, setWasteCategories] = useState<WasteType[]>([]);
  const [quantity, setQuantity] = useState("");

  // Preferred slot (optional): a date + a time window. The assigned store
  // confirms one. Sent as a free-form label, or null when left blank.
  const [slotDate, setSlotDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [slotWindow, setSlotWindow] = useState<string>("");

  // Location: saved addresses first, a map-picked "new" address as fallback.
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selected, setSelected] = useState<number | "new" | null>(null);
  const [newAddress, setNewAddress] = useState("");
  const [pickedCoords, setPickedCoords] = useState<LatLng | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Preselect the default saved address (or the first); fall back to entering a
  // new one when the user has none saved yet.
  useEffect(() => {
    api
      .get<SavedAddress[]>("/addresses")
      .then(({ data }) => {
        setAddresses(data);
        const def = data.find((a) => a.isDefault) ?? data[0];
        setSelected(def ? def.id : "new");
      })
      .catch(() => setSelected("new"));
  }, []);

  // Best-effort geolocation to center the map for the "new" address path.
  useEffect(() => {
    requestLocation().then((loc) => {
      if (loc) setMapCenter(loc);
    });
  }, [requestLocation]);

  const useMyLocation = async () => {
    const loc = userLocation ?? (await requestLocation());
    if (loc) {
      setMapCenter({ ...loc });
      setPickedCoords({ ...loc });
    }
  };

  const handleSubmit = async () => {
    // Resolve the pickup point from the chosen saved address, or the map pin.
    const savedAddr =
      typeof selected === "number"
        ? addresses.find((a) => a.id === selected)
        : null;
    const address = savedAddr ? savedAddr.address : newAddress.trim();
    const lat = savedAddr ? savedAddr.latitude : pickedCoords?.lat ?? null;
    const lng = savedAddr ? savedAddr.longitude : pickedCoords?.lng ?? null;

    if (wasteCategories.length === 0 || !quantity || !address) {
      setError(
        "Select at least one e-waste type, a quantity, and a pickup location."
      );
      return;
    }
    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) {
      setError("Quantity must be a positive number.");
      return;
    }
    if (lat == null || lng == null) {
      setError(
        "We couldn't pin your location yet. Refine the address or tap the map."
      );
      return;
    }
    setLoading(true);
    setError("");
    try {
      const preferredTimeSlot =
        slotDate && slotWindow
          ? `${format(slotDate, "EEE, MMM d")} · ${slotWindow}`
          : slotWindow || null;
      // No store is chosen here — the backend auto-assigns the best-matched store
      // (weighted by proximity, current daily load, and rating).
      await api.post("/pickup-requests", {
        wasteCategories,
        wasteQuantity: q,
        pickupAddress: address,
        pickupLatitude: lat,
        pickupLongitude: lng,
        preferredTimeSlot,
      });
      setDone(true);
    } catch (err: any) {
      setError(
        err?.response?.data?.message || "Could not submit your pickup request."
      );
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <Screen contentClassName="py-6">
        <Surface className="items-center gap-4 px-6 py-16">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-primary/[0.12]">
            <CheckCircle2 size={32} color="#34c759" strokeWidth={2.2} />
          </View>
          <View className="items-center">
            <Text className="text-[20px] font-extrabold tracking-tight">
              You&apos;re all set
            </Text>
            <Text className="mt-1.5 max-w-sm text-center text-[14px] leading-relaxed text-muted-foreground">
              We&apos;re matching you with the best available store. You&apos;ll
              see the assigned store on your pickups page.
            </Text>
          </View>
          <View className="mt-2 w-full gap-2.5">
            <Button onPress={() => router.replace("/pickups" as any)}>
              View my pickups
            </Button>
            <Button
              variant="outline"
              onPress={() => router.replace("/dashboard" as any)}
            >
              Back to dashboard
            </Button>
          </View>
        </Surface>
      </Screen>
    );
  }

  return (
    <Screen contentClassName="gap-5 py-6">
      <View>
        <Text className="font-display text-[25px] tracking-tight">
          Request a pickup
        </Text>
        <Text className="mt-1 text-[13px] text-muted-foreground">
          Tell us what to collect — we&apos;ll assign the best store for you
          automatically.
        </Text>
      </View>

      {/* Auto-assignment notice (no store selection) */}
      <Surface className="flex-row items-start gap-3 bg-primary/[0.05] p-4">
        <View className="mt-0.5 h-8 w-8 items-center justify-center rounded-xl bg-primary/[0.12]">
          <Info size={16} color="#34c759" />
        </View>
        <Text className="flex-1 text-[13px] leading-relaxed text-muted-foreground">
          No need to choose a store — our system assigns the most suitable one
          based on distance, current load, and rating.
        </Text>
      </Surface>

      {/* WASTE + QUANTITY */}
      <Surface className="gap-4 p-5">
        <Text className="text-[15px] font-bold">What are we collecting?</Text>
        <Field label="E-waste types (select one or more)">
          <CategoryMultiSelect
            options={WASTE_TYPES}
            value={wasteCategories}
            onChange={setWasteCategories}
          />
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

      {/* PREFERRED TIME SLOTS — propose one, the recycler confirms */}
      <Surface className="gap-3 p-5">
        <View className="flex-row items-center gap-1.5">
          <Clock size={16} color="#34c759" />
          <Text className="text-[15px] font-bold">Preferred slot</Text>
          <Text className="text-[12px] font-medium text-muted-foreground">
            (optional)
          </Text>
        </View>
        <Text className="text-[12.5px] text-muted-foreground">
          Add a date &amp; time window that suits you — the assigned store will
          confirm one.
        </Text>
        <Field label="Date">
          <Pressable
            onPress={() => setShowDatePicker(true)}
            className="h-12 flex-row items-center rounded-full border border-input bg-card px-4"
          >
            <Text
              className={
                "text-[15px] " +
                (slotDate ? "text-foreground" : "text-muted-foreground")
              }
            >
              {slotDate
                ? format(slotDate, "EEE, MMM d, yyyy")
                : "Select a date"}
            </Text>
          </Pressable>
        </Field>
        {showDatePicker ? (
          <DateTimePicker
            value={slotDate ?? new Date()}
            mode="date"
            minimumDate={new Date()}
            onChange={(e, d) => {
              setShowDatePicker(Platform.OS === "ios");
              if (e.type === "set" && d) setSlotDate(d);
              if (e.type === "dismissed") setShowDatePicker(false);
            }}
          />
        ) : null}
        <Field label="Time window">
          <Select
            value={slotWindow}
            onValueChange={setSlotWindow}
            options={SLOT_OPTIONS}
            placeholder="No preference"
          />
        </Field>
      </Surface>

      {/* LOCATION — saved addresses first, map pin as fallback */}
      <Surface className="gap-3 p-5">
        <View className="flex-row items-center gap-1.5">
          <MapPin size={16} color="#34c759" />
          <Text className="text-[15px] font-bold">Pickup location</Text>
        </View>

        {addresses.length > 0 ? (
          <>
            <Text className="text-[12.5px] text-muted-foreground">
              Pick a saved address, or add a new one.
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {addresses.map((a) => {
                const active = selected === a.id;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => setSelected(a.id)}
                    className={
                      "rounded-2xl px-4 py-2.5 " +
                      (active ? "bg-primary" : "border border-input bg-card")
                    }
                  >
                    <Text
                      className={
                        "text-[13px] font-semibold " +
                        (active
                          ? "text-primary-foreground"
                          : "text-muted-foreground")
                      }
                    >
                      {a.label}
                      {a.isDefault && !active ? " · default" : ""}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setSelected("new")}
                className={
                  "rounded-2xl px-4 py-2.5 " +
                  (selected === "new"
                    ? "bg-primary"
                    : "border border-input bg-card")
                }
              >
                <Text
                  className={
                    "text-[13px] font-semibold " +
                    (selected === "new"
                      ? "text-primary-foreground"
                      : "text-muted-foreground")
                  }
                >
                  + New address
                </Text>
              </Pressable>
            </View>
            {typeof selected === "number" ? (
              <View className="flex-row items-start gap-1.5">
                <MapPin size={14} color="#34c759" className="mt-0.5" />
                <Text className="flex-1 text-[12.5px] text-muted-foreground">
                  {addresses.find((a) => a.id === selected)?.address}
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <Text className="text-[12.5px] text-muted-foreground">
            Enter your address and drop a pin on the map for pickup.
          </Text>
        )}

        {selected === "new" ? (
          <View className="gap-3">
            <Field label="Address">
              <Input
                placeholder="Enter your pickup address"
                value={newAddress}
                onChangeText={setNewAddress}
              />
            </Field>
            <View className="flex-row items-center justify-between">
              <Text className="text-[12.5px] text-muted-foreground">
                Tap the map to drop a pin.
              </Text>
              <Button
                size="sm"
                variant="outline"
                onPress={useMyLocation}
                className="flex-row gap-1.5"
              >
                <LocateFixed size={14} color="#14181a" />
                <Text className="text-[13px] font-semibold">My location</Text>
              </Button>
            </View>
            <LocationPicker
              value={pickedCoords}
              center={mapCenter}
              onChange={(lat, lng) => setPickedCoords({ lat, lng })}
            />
            {pickedCoords ? (
              <Text className="text-[12px] text-muted-foreground">
                Pinned at {pickedCoords.lat.toFixed(5)},{" "}
                {pickedCoords.lng.toFixed(5)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Surface>

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
        className="flex-row gap-2"
      >
        <Package size={16} color="#fff" />
        <Text className="text-[15px] font-semibold text-primary-foreground">
          Request pickup
        </Text>
      </Button>
    </Screen>
  );
}
