import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Search,
  Navigation,
  LocateFixed,
  MapPin,
  PackageCheck,
  Store as StoreIcon,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, type Station, type WasteType } from "@/lib/api";
import {
  Text,
  Button,
  Input,
  Select,
  Switch,
  Surface,
  LoadingState,
  ErrorState,
  EmptyState,
  type SelectOption,
} from "@/components/ui";
import { StoreMap } from "@/components/map/StoreMap";
import { GradientHeader } from "@/components/GradientHeader";
import { DOMAIN } from "@/lib/domains";
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

const WASTE_OPTIONS: SelectOption[] = [
  { value: "", label: "All waste types" },
  ...WASTE_TYPES.map((t) => ({ value: t, label: t })),
];

type LatLng = { lat: number; lng: number };
type PanelView = "list" | "map";

export default function StoresDiscoveryScreen() {
  const router = useRouter();
  const { coords: userLocation, request: requestLocation } = useLocation();

  const [center, setCenter] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(true);

  const [keyword, setKeyword] = useState("");
  const [wasteType, setWasteType] = useState<string>("");
  const [pickupOnly, setPickupOnly] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [geoError, setGeoError] = useState("");

  const [stores, setStores] = useState<Station[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<PanelView>("list");

  // Geolocation on mount (best-effort).
  useEffect(() => {
    let mounted = true;
    requestLocation().then((loc) => {
      if (!mounted) return;
      if (loc) setCenter(loc);
      setLocating(false);
    });
    return () => {
      mounted = false;
    };
  }, [requestLocation]);

  const fetchStores = useCallback(
    async (c: LatLng, kw: string, waste: string, pickup: boolean) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          lat: String(c.lat),
          lng: String(c.lng),
          limit: "100",
        });
        if (kw.trim()) params.set("search", kw.trim());
        if (waste) params.set("wasteType", waste);
        if (pickup) params.set("pickupAvailable", "true");
        const { data } = await api.get<Station[]>(
          `/stores/nearest?${params.toString()}`
        );
        setStores(data);
        setSelectedId((prev) => (data.some((s) => s.id === prev) ? prev : null));
      } catch {
        setError("Could not load stores.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Debounce keyword; refetch on center/waste/availability change.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!center) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(
      () => fetchStores(center, keyword, wasteType, pickupOnly),
      350
    );
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [center, keyword, wasteType, pickupOnly, fetchStores]);

  const handleLocationSearch = async () => {
    const q = locationQuery.trim();
    if (!q) return;
    setGeocoding(true);
    setGeoError("");
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } }
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        setCenter({ lat: Number(data[0].lat), lng: Number(data[0].lon) });
      } else {
        setGeoError("No results for that location.");
      }
    } catch {
      setGeoError("Location search failed. Try again.");
    } finally {
      setGeocoding(false);
    }
  };

  const useMyLocation = async () => {
    const loc = userLocation ?? (await requestLocation());
    if (loc) {
      setCenter({ ...loc });
      setLocationQuery("");
    }
  };

  const selected = useMemo(
    () => stores.find((s) => s.id === selectedId) || null,
    [stores, selectedId]
  );

  const renderStore = ({ item: s }: { item: Station }) => (
    <Pressable
      onPress={() => setSelectedId(s.id)}
      className={
        "mb-2.5 flex-row gap-3 rounded-2xl border p-3.5 " +
        (selectedId === s.id
          ? "border-[#6366f1]/40 bg-[#6366f1]/[0.06]"
          : "border-border bg-card")
      }
    >
      {/* indigo pin medallion — the stores hue */}
      <View className="h-11 w-11 overflow-hidden rounded-2xl">
        <LinearGradient
          colors={DOMAIN.stores}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <MapPin size={19} color="#fff" strokeWidth={2.2} />
        </LinearGradient>
      </View>

      <View className="min-w-0 flex-1">
        <View className="flex-row items-start justify-between gap-2">
          <Text className="flex-1 text-[14px] font-semibold">
            {s.name || s.storeName}
          </Text>
          {s.distance != null ? (
            <View className="items-end">
              <Text className="font-display text-[16px] leading-4 text-[#4f46e5]">
                {s.distance}
              </Text>
              <Text className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                km away
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="mt-1 text-[12px] text-muted-foreground" numberOfLines={1}>
          {s.address}
        </Text>
        <View className="mt-2.5 flex-row items-center gap-2">
          {s.hasCapacity === false ? (
            <View className="rounded-full bg-chart-3/15 px-2 py-0.5">
              <Text className="text-[10px] font-semibold text-chart-3">Full</Text>
            </View>
          ) : null}
          <Pressable onPress={() => router.push(`/stores/${s.id}` as any)} hitSlop={6}>
            <Text className="text-[12px] font-semibold text-[#4f46e5]">
              View details →
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <View className="flex-1 px-5 pt-4">
        {/* Header */}
        <GradientHeader
          eyebrow="FIND A STORE"
          title="Stores near you"
          subtitle="Verified recyclers ready to take your e-waste."
          colors={DOMAIN.stores}
          icon={StoreIcon}
          className="mb-3"
          right={
            <Pressable onPress={useMyLocation} className="active:opacity-80">
              <View className="flex-row items-center gap-1.5 rounded-full bg-white/20 px-3 py-2">
                <LocateFixed size={15} color="#fff" />
                <Text className="text-[12.5px] font-semibold text-white">Locate me</Text>
              </View>
            </Pressable>
          }
        />

        {/* Filters */}
        <Surface className="mb-3 gap-2.5 p-3.5">
          <View className="relative justify-center">
            <View className="absolute left-3 z-10">
              <Search size={16} color="#6c7278" />
            </View>
            <Input
              placeholder="Search by store name"
              value={keyword}
              onChangeText={setKeyword}
              className="pl-9"
            />
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Input
                placeholder="Search by location"
                value={locationQuery}
                onChangeText={setLocationQuery}
                onSubmitEditing={handleLocationSearch}
                returnKeyType="search"
              />
            </View>
            <Button
              size="sm"
              variant="outline"
              onPress={handleLocationSearch}
              loading={geocoding}
            >
              Go
            </Button>
          </View>
          <Select
            value={wasteType}
            onValueChange={setWasteType}
            options={WASTE_OPTIONS}
            placeholder="All waste types"
          />
          <View className="flex-row items-center justify-between rounded-full border border-input bg-card px-4 py-2">
            <View className="flex-row items-center gap-2">
              <PackageCheck size={16} color="#6c7278" />
              <Text className="text-[14px]">Pickup available</Text>
            </View>
            <Switch value={pickupOnly} onValueChange={setPickupOnly} />
          </View>
          {geoError ? (
            <Text className="text-[12px] text-destructive">{geoError}</Text>
          ) : null}
        </Surface>

        {/* List/Map toggle */}
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-[15px] font-bold">
            {loading
              ? "Searching…"
              : `${stores.length} store${stores.length === 1 ? "" : "s"}`}
          </Text>
          <View className="flex-row gap-1 rounded-full bg-muted p-1">
            {(["list", "map"] as PanelView[]).map((v) => (
              <Pressable
                key={v}
                onPress={() => setTab(v)}
                className={
                  "rounded-full px-4 py-1.5 " + (tab === v ? "bg-primary" : "")
                }
              >
                <Text
                  className={
                    "text-[13px] font-semibold " +
                    (tab === v ? "text-primary-foreground" : "text-muted-foreground")
                  }
                >
                  {v === "list" ? "List" : "Map"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Body */}
        {locating ? (
          <LoadingState label="Getting your location…" />
        ) : !center ? (
          <EmptyState
            icon={MapPin}
            title="Find stores near you"
            description="Enable location access or search a location to discover stores."
            actionLabel="Use my location"
            onAction={useMyLocation}
          />
        ) : error ? (
          <ErrorState
            description={error}
            onRetry={() => fetchStores(center, keyword, wasteType, pickupOnly)}
          />
        ) : tab === "map" ? (
          <View className="flex-1 pb-4">
            <StoreMap
              stores={stores}
              userLocation={userLocation}
              center={center}
              selectedId={selectedId}
              onSelect={setSelectedId}
              className="flex-1 overflow-hidden rounded-2xl"
            />
            {selected ? (
              <Text className="mt-2 text-[12px] text-muted-foreground">
                Route to{" "}
                <Text className="font-semibold">
                  {selected.name || selected.storeName}
                </Text>
                {selected.distance != null ? ` · ${selected.distance} km` : ""}
              </Text>
            ) : null}
          </View>
        ) : loading && stores.length === 0 ? (
          <LoadingState />
        ) : stores.length === 0 ? (
          <EmptyState title="No stores match your search" />
        ) : (
          <FlatList
            data={stores}
            keyExtractor={(s) => String(s.id)}
            renderItem={renderStore}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
