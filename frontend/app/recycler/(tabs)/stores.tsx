import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import {
  ArrowLeft,
  LocateFixed,
  MapPin,
  Pencil,
  Plus,
  Star,
  Store as StoreIcon,
  Trash2,
} from "lucide-react-native";
import { api, type Store, type WasteType } from "@/lib/api";
import {
  Screen,
  Text,
  Button,
  Input,
  Textarea,
  Field,
  Surface,
  Switch,
  Progress,
  EmptyState,
  LoadingState,
} from "@/components/ui";
import { LocationPicker } from "@/components/location/LocationPicker";
import { composeAddress } from "@/lib/geocode";
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

type FormState = {
  storeName: string;
  description: string;
  contactNumber: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  latitude: string;
  longitude: string;
  operatingHours: string;
  pickupAvailability: boolean;
  acceptedWasteTypes: WasteType[];
  dailyCapacityKg: string;
};

const emptyForm: FormState = {
  storeName: "",
  description: "",
  contactNumber: "",
  email: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  latitude: "",
  longitude: "",
  operatingHours: "",
  pickupAvailability: true,
  acceptedWasteTypes: [],
  dailyCapacityKg: "0",
};

const fromStore = (s: Store): FormState => ({
  storeName: s.storeName ?? "",
  description: s.description ?? "",
  contactNumber: s.contactNumber ?? "",
  email: s.email ?? "",
  address: "",
  city: s.city ?? "",
  state: s.state ?? "",
  pincode: s.pincode ?? "",
  latitude: String(s.latitude ?? ""),
  longitude: String(s.longitude ?? ""),
  operatingHours: s.operatingHours ?? "",
  pickupAvailability: s.pickupAvailability ?? true,
  acceptedWasteTypes: s.acceptedWasteTypes ?? [],
  dailyCapacityKg: String(s.dailyCapacityKg ?? 0),
});

const VERIF_TEXT: Record<string, string> = {
  Verified: "text-primary",
  Pending: "text-chart-3",
  Rejected: "text-destructive",
};
const VERIF_BG: Record<string, string> = {
  Verified: "bg-primary/[0.12]",
  Pending: "bg-chart-3/15",
  Rejected: "bg-destructive/10",
};

export default function RecyclerStoresScreen() {
  const { coords: userLocation, request: requestLocation } = useLocation();

  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // form (create/edit)
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(
    null
  );

  // per-card busy (capacity / delete)
  const [busyId, setBusyId] = useState<number | null>(null);
  const [capacityDraft, setCapacityDraft] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Store[]>("/stores/mine");
      setStores(data);
    } catch {
      setError("Could not load your stores.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pickedCoords =
    form.latitude !== "" && form.longitude !== ""
      ? { lat: Number(form.latitude), lng: Number(form.longitude) }
      : null;

  const openCreate = async () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setFormOpen(true);
    const loc = userLocation ?? (await requestLocation());
    if (loc) setMapCenter(loc);
  };

  const openEdit = (s: Store) => {
    setEditingId(s.id);
    setForm(fromStore(s));
    setFormError("");
    setFormOpen(true);
    const lat = Number(s.latitude);
    const lng = Number(s.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setMapCenter({ lat, lng });
    }
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const useMyLocation = async () => {
    const loc = userLocation ?? (await requestLocation());
    if (loc) {
      setMapCenter({ ...loc });
      set("latitude", String(loc.lat));
      set("longitude", String(loc.lng));
    }
  };

  const toggleWaste = (t: WasteType) =>
    setForm((f) => ({
      ...f,
      acceptedWasteTypes: f.acceptedWasteTypes.includes(t)
        ? f.acceptedWasteTypes.filter((x) => x !== t)
        : [...f.acceptedWasteTypes, t],
    }));

  const submit = async () => {
    // Compose the full address from the optional street line + state/city.
    const fullAddress = composeAddress(
      { state: form.state, city: form.city },
      form.address
    );

    // Client-side mirror of the backend's required-field validation.
    if (form.storeName.trim().length < 2)
      return setFormError("Store name must be at least 2 characters.");
    if (fullAddress.trim().length < 3)
      return setFormError(
        "Add at least a state and city (or a street address)."
      );
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      form.latitude === "" ||
      form.longitude === ""
    )
      return setFormError(
        "We need a map location — tap the map to drop a pin."
      );

    const payload = {
      storeName: form.storeName.trim(),
      description: form.description.trim() || null,
      contactNumber: form.contactNumber.trim() || null,
      email: form.email.trim() || null,
      address: fullAddress.trim(),
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      pincode: form.pincode.trim() || null,
      latitude: lat,
      longitude: lng,
      operatingHours: form.operatingHours.trim() || null,
      pickupAvailability: form.pickupAvailability,
      acceptedWasteTypes: form.acceptedWasteTypes,
      dailyCapacityKg: Number(form.dailyCapacityKg) || 0,
    };

    setSaving(true);
    setFormError("");
    try {
      if (editingId) {
        await api.put(`/stores/${editingId}`, payload);
      } else {
        await api.post("/stores", payload);
      }
      setFormOpen(false);
      await load();
    } catch (e: any) {
      setFormError(e?.response?.data?.message || "Could not save the store.");
    } finally {
      setSaving(false);
    }
  };

  const saveCapacity = async (s: Store) => {
    const raw = capacityDraft[s.id];
    if (raw === undefined) return;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      setError("Capacity must be a non-negative number.");
      return;
    }
    setBusyId(s.id);
    setError("");
    try {
      await api.patch(`/stores/${s.id}/capacity`, { currentCapacityKg: value });
      setCapacityDraft((d) => {
        const next = { ...d };
        delete next[s.id];
        return next;
      });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Could not update capacity.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = (s: Store) => {
    Alert.alert(
      "Delete store",
      `Delete "${s.storeName}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusyId(s.id);
            setError("");
            try {
              await api.delete(`/stores/${s.id}`);
              await load();
            } catch (e: any) {
              setError(e?.response?.data?.message || "Could not delete the store.");
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  /* ---------------- create/edit form ---------------- */
  if (formOpen) {
    return (
      <Screen contentClassName="gap-3 py-6">
        <View className="flex-row items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            onPress={() => setFormOpen(false)}
            disabled={saving}
          >
            <ArrowLeft size={20} color="#14181a" />
          </Button>
          <Text className="text-[20px] font-extrabold tracking-tight">
            {editingId ? "Edit store" : "Add store"}
          </Text>
        </View>

        <Field label="Store name *">
          <Input
            value={form.storeName}
            onChangeText={(v) => set("storeName", v)}
            placeholder="GreenCycle Hub"
          />
        </Field>
        <Field label="Description">
          <Textarea
            value={form.description}
            onChangeText={(v) => set("description", v)}
            placeholder="What you accept, hours, notes…"
          />
        </Field>
        <Field label="Street / building (optional)">
          <Input
            value={form.address}
            onChangeText={(v) => set("address", v)}
            placeholder="Flat, building, street…"
          />
        </Field>
        <View className="flex-row gap-2">
          <Field label="Contact number" className="flex-1">
            <Input
              value={form.contactNumber}
              onChangeText={(v) => set("contactNumber", v)}
              keyboardType="phone-pad"
            />
          </Field>
          <Field label="Email" className="flex-1">
            <Input
              value={form.email}
              onChangeText={(v) => set("email", v)}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </Field>
        </View>
        <View className="flex-row gap-2">
          <Field label="State" className="flex-1">
            <Input
              value={form.state}
              onChangeText={(v) => set("state", v)}
              placeholder="State"
            />
          </Field>
          <Field label="City" className="flex-1">
            <Input
              value={form.city}
              onChangeText={(v) => set("city", v)}
              placeholder="City"
            />
          </Field>
        </View>
        <View className="flex-row gap-2">
          <Field label="Pincode" className="flex-1">
            <Input
              value={form.pincode}
              onChangeText={(v) => set("pincode", v)}
              keyboardType="number-pad"
            />
          </Field>
          <Field label="Operating hours" className="flex-1">
            <Input
              value={form.operatingHours}
              onChangeText={(v) => set("operatingHours", v)}
              placeholder="09:00 - 18:00"
            />
          </Field>
        </View>
        <Field label="Daily capacity (kg)">
          <Input
            value={form.dailyCapacityKg}
            onChangeText={(v) => set("dailyCapacityKg", v)}
            keyboardType="decimal-pad"
          />
        </Field>

        {/* Map location */}
        <Field label="Store location">
          <View className="gap-2">
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
              onChange={(lat, lng) => {
                set("latitude", String(lat));
                set("longitude", String(lng));
              }}
            />
            {pickedCoords ? (
              <Text className="text-[12px] text-muted-foreground">
                Pinned at {pickedCoords.lat.toFixed(5)},{" "}
                {pickedCoords.lng.toFixed(5)}
              </Text>
            ) : null}
          </View>
        </Field>

        <Field label="Accepted waste types">
          <View className="flex-row flex-wrap gap-1.5">
            {WASTE_TYPES.map((t) => {
              const on = form.acceptedWasteTypes.includes(t);
              return (
                <Pressable
                  key={t}
                  onPress={() => toggleWaste(t)}
                  className={
                    "rounded-full border px-3 py-1.5 " +
                    (on
                      ? "border-primary bg-primary"
                      : "border-border bg-card")
                  }
                >
                  <Text
                    className={
                      "text-[12px] font-semibold " +
                      (on ? "text-primary-foreground" : "text-foreground")
                    }
                  >
                    {t}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <View className="flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
          <Text className="text-[14px]">Offer pickup from this store</Text>
          <Switch
            value={form.pickupAvailability}
            onValueChange={(v) => set("pickupAvailability", v)}
          />
        </View>

        {formError ? (
          <Text className="text-[13px] font-medium text-destructive">
            {formError}
          </Text>
        ) : null}

        <View className="flex-row justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            onPress={() => setFormOpen(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onPress={submit} loading={saving} disabled={saving}>
            {editingId ? "Save changes" : "Create store"}
          </Button>
        </View>
      </Screen>
    );
  }

  /* ---------------- list ---------------- */
  return (
    <Screen contentClassName="gap-4 py-6">
      {/* Header */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[24px] font-extrabold tracking-tight">
            My Stores
          </Text>
          <Text className="mt-1 text-[13px] text-muted-foreground">
            Manage your drop-off locations, capacity, and verification status.
          </Text>
        </View>
        <Button size="sm" onPress={openCreate} className="flex-row gap-1.5">
          <Plus size={16} color="#fff" />
          <Text className="text-[13px] font-semibold text-primary-foreground">
            Add store
          </Text>
        </Button>
      </View>

      {error ? (
        <View className="rounded-xl border-l-4 border-l-destructive bg-destructive/10 px-4 py-2.5">
          <Text className="text-[13px] font-medium text-destructive">
            {error}
          </Text>
        </View>
      ) : null}

      {loading ? (
        <LoadingState label="Loading your stores…" />
      ) : stores.length === 0 ? (
        <EmptyState
          icon={StoreIcon}
          title="No stores yet"
          description="You haven't added any stores yet."
          actionLabel="Add your first store"
          onAction={openCreate}
        />
      ) : (
        stores.map((s) => {
          const remaining = Math.max(
            0,
            (s.dailyCapacityKg || 0) - (s.currentCapacityKg || 0)
          );
          const pct = s.dailyCapacityKg
            ? Math.min(100, Math.round((s.currentCapacityKg / s.dailyCapacityKg) * 100))
            : 0;
          return (
            <Surface key={s.id} className="gap-3 p-5">
              <View className="flex-row items-start justify-between gap-3">
                <View className="min-w-0 flex-1">
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text className="text-[15px] font-bold">{s.storeName}</Text>
                    <View
                      className={
                        "rounded-full px-2.5 py-0.5 " +
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
                      <View className="rounded-full bg-destructive/10 px-2.5 py-0.5">
                        <Text className="text-[11px] font-semibold text-destructive">
                          Inactive
                        </Text>
                      </View>
                    ) : null}
                    {!s.pickupAvailability ? (
                      <View className="rounded-full bg-muted px-2.5 py-0.5">
                        <Text className="text-[11px] font-semibold text-muted-foreground">
                          No pickup
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View className="mt-1 flex-row items-start gap-1">
                    <MapPin size={14} color="#6c7278" style={{ marginTop: 2 }} />
                    <Text
                      className="flex-1 text-[12px] text-muted-foreground"
                      numberOfLines={1}
                    >
                      {[s.address, s.city, s.state].filter(Boolean).join(", ")}
                    </Text>
                  </View>
                  <View className="mt-1.5 flex-row items-center gap-3">
                    <View className="flex-row items-center gap-1">
                      <Star size={14} color="#ffb800" fill="#ffb800" />
                      <Text className="text-[12px] text-muted-foreground">
                        {s.rating?.toFixed(1) ?? "0.0"} ({s.totalReviews ?? 0})
                      </Text>
                    </View>
                    {s.acceptedWasteTypes?.length > 0 ? (
                      <Text
                        className="flex-1 text-[12px] text-muted-foreground"
                        numberOfLines={1}
                      >
                        {s.acceptedWasteTypes.join(", ")}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View className="flex-row shrink-0 gap-1">
                  <Button size="icon" variant="ghost" onPress={() => openEdit(s)}>
                    <Pencil size={16} color="#14181a" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    loading={busyId === s.id}
                    disabled={busyId === s.id}
                    onPress={() => remove(s)}
                  >
                    <Trash2 size={16} color="#ff3b30" />
                  </Button>
                </View>
              </View>

              {/* capacity */}
              <Surface variant="inset" className="gap-2 p-4">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[12px] text-muted-foreground">
                    Today's intake
                  </Text>
                  <Text className="text-[12px] text-muted-foreground">
                    {s.currentCapacityKg} / {s.dailyCapacityKg} kg · {remaining}{" "}
                    kg free
                  </Text>
                </View>
                <Progress
                  value={pct}
                  barClassName={pct >= 100 ? "bg-destructive" : "bg-primary"}
                />
                <View className="mt-1 flex-row items-center gap-2">
                  <View className="flex-1">
                    <Input
                      className="h-10"
                      keyboardType="decimal-pad"
                      placeholder="Set current intake (kg)"
                      value={capacityDraft[s.id] ?? ""}
                      onChangeText={(v) =>
                        setCapacityDraft((d) => ({ ...d, [s.id]: v }))
                      }
                    />
                  </View>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      busyId === s.id ||
                      capacityDraft[s.id] === undefined ||
                      capacityDraft[s.id] === ""
                    }
                    onPress={() => saveCapacity(s)}
                  >
                    Update
                  </Button>
                </View>
              </Surface>
            </Surface>
          );
        })
      )}

      {stores.some((s) => s.verificationStatus === "Pending") ? (
        <Text className="text-[12px] text-muted-foreground">
          Stores stay hidden from customers until an admin verifies them.
        </Text>
      ) : null}
    </Screen>
  );
}
