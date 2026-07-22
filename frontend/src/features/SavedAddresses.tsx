import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import {
  LocateFixed,
  MapPin,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react-native";
import { api, type SavedAddress } from "@/lib/api";
import {
  Text,
  Button,
  Input,
  Field,
  Surface,
  LoadingState,
} from "@/components/ui";
import { LocationPicker } from "@/components/location/LocationPicker";
import { useLocation } from "@/hooks/useLocation";

type LatLng = { lat: number; lng: number };

/**
 * Saved-address CRUD (GET/POST/PATCH/DELETE /addresses). Ported from the web
 * SavedAddresses component — the web LocationCascade (State→District→City→
 * Locality) is replaced by a plain address line + a map pin (LocationPicker),
 * but the POST payload and validation are preserved exactly.
 */
export function SavedAddresses() {
  const { coords: userLocation, request: requestLocation } = useLocation();

  const [items, setItems] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api
      .get<SavedAddress[]>("/addresses")
      .then(({ data }) => setItems(data))
      .catch(() => setError("Could not load your addresses."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Best-effort geolocation to center the map when adding.
  useEffect(() => {
    requestLocation().then((loc) => {
      if (loc) setMapCenter(loc);
    });
  }, [requestLocation]);

  const resetForm = () => {
    setAdding(false);
    setLabel("");
    setAddress("");
    setCoords(null);
    setError("");
  };

  const useMyLocation = async () => {
    const loc = userLocation ?? (await requestLocation());
    if (loc) {
      setMapCenter({ ...loc });
      setCoords({ ...loc });
    }
  };

  const save = async () => {
    if (!label.trim()) return setError("Give it a label (e.g. Home, Work).");
    if (!address.trim() || coords == null) {
      return setError("Enter an address and drop a pin on the map first.");
    }
    setSaving(true);
    setError("");
    try {
      await api.post("/addresses", {
        label: label.trim(),
        address: address.trim(),
        latitude: coords.lat,
        longitude: coords.lng,
        isDefault: items.length === 0,
      });
      resetForm();
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Could not save address.");
    } finally {
      setSaving(false);
    }
  };

  const makeDefault = async (id: number) => {
    setBusyId(id);
    try {
      await api.patch(`/addresses/${id}/default`);
      load();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: number) => {
    setBusyId(id);
    try {
      await api.delete(`/addresses/${id}`);
      load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Surface className="gap-4 p-5">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <MapPin size={18} color="#34c759" />
          <Text className="text-[16px] font-extrabold tracking-tight">
            Saved addresses
          </Text>
        </View>
        {!adding ? (
          <Button
            size="sm"
            variant="outline"
            onPress={() => setAdding(true)}
            className="flex-row gap-1.5"
          >
            <Plus size={14} color="#14181a" />
            <Text className="text-[13px] font-semibold">Add</Text>
          </Button>
        ) : null}
      </View>
      <Text className="text-[13px] text-muted-foreground">
        Save where you recycle so scheduling a pickup is one tap.
      </Text>

      {/* List */}
      <View className="gap-2">
        {loading ? (
          <LoadingState label="Loading…" />
        ) : items.length === 0 && !adding ? (
          <View className="rounded-2xl bg-muted px-4 py-6">
            <Text className="text-center text-[13px] text-muted-foreground">
              No saved addresses yet.
            </Text>
          </View>
        ) : (
          items.map((a) => (
            <View
              key={a.id}
              className="flex-row items-start justify-between gap-3 rounded-2xl border border-border p-3.5"
            >
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-[14px] font-semibold">{a.label}</Text>
                  {a.isDefault ? (
                    <View className="flex-row items-center gap-1 rounded-full bg-primary/[0.12] px-2 py-0.5">
                      <Star size={10} color="#34c759" fill="#34c759" />
                      <Text className="text-[10px] font-bold uppercase tracking-wide text-primary">
                        Default
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  className="mt-0.5 text-[12px] text-muted-foreground"
                  numberOfLines={1}
                >
                  {a.address}
                </Text>
              </View>
              <View className="flex-row shrink-0 items-center gap-1">
                {!a.isDefault ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === a.id}
                    onPress={() => makeDefault(a.id)}
                  >
                    <Text className="text-[12px] font-semibold text-muted-foreground">
                      Set default
                    </Text>
                  </Button>
                ) : null}
                <Button
                  size="icon"
                  variant="ghost"
                  loading={busyId === a.id}
                  disabled={busyId === a.id}
                  onPress={() => remove(a.id)}
                >
                  <Trash2 size={16} color="#ff3b30" />
                </Button>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Add form */}
      {adding ? (
        <View className="gap-4 rounded-2xl border border-border p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-[14px] font-bold">New address</Text>
            <Pressable onPress={resetForm} hitSlop={8} className="p-1">
              <X size={18} color="#6c7278" />
            </Pressable>
          </View>
          <Field label="Label">
            <Input
              placeholder="Home, Work, Mum's place…"
              value={label}
              onChangeText={setLabel}
              maxLength={60}
            />
          </Field>
          <Field label="Address">
            <Input
              placeholder="Enter the full address"
              value={address}
              onChangeText={setAddress}
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
            value={coords}
            center={mapCenter}
            onChange={(lat, lng) => setCoords({ lat, lng })}
          />
          {coords ? (
            <Text className="text-[12px] text-muted-foreground">
              Pinned at {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </Text>
          ) : null}
          {error ? (
            <Text className="text-[13px] font-medium text-destructive">
              {error}
            </Text>
          ) : null}
          <Button
            onPress={save}
            loading={saving}
            disabled={saving}
            className="flex-row gap-2"
          >
            <Plus size={16} color="#fff" />
            <Text className="text-[15px] font-semibold text-primary-foreground">
              Save address
            </Text>
          </Button>
        </View>
      ) : null}

      {!adding && error ? (
        <Text className="text-[13px] font-medium text-destructive">{error}</Text>
      ) : null}
    </Surface>
  );
}
