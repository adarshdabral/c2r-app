import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import MapView, {
  Marker,
  Polyline,
  UrlTile,
  PROVIDER_DEFAULT,
  type Region,
} from "react-native-maps";
import type { Station } from "@/lib/api";

type LatLng = { lat: number; lng: number };

interface StoreMapProps {
  stores: Station[];
  userLocation: LatLng | null;
  /** Optional explicit map center (e.g. after a location search). */
  center?: LatLng | null;
  selectedId?: number | null;
  onSelect?: (id: number) => void;
  className?: string;
}

const isLatLng = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng);

const toRegion = (c: LatLng, delta = 0.08): Region => ({
  latitude: c.lat,
  longitude: c.lng,
  latitudeDelta: delta,
  longitudeDelta: delta,
});

/**
 * Store map — the react-native-maps port of the web Leaflet store-map. Renders
 * OSM raster tiles (no API key, matching the web stack), store markers, the
 * user's location, and a route line from the user to the selected store.
 *
 * The route is fetched from the public OSRM server (same as web); on any failure
 * it falls back to a straight dashed line so a route is always shown.
 */
export function StoreMap({
  stores,
  userLocation,
  center,
  selectedId,
  onSelect,
  className,
}: StoreMapProps) {
  const mapRef = useRef<MapView>(null);
  const [route, setRoute] = useState<{ lat: number; lng: number }[] | null>(null);

  const initial =
    userLocation ||
    center ||
    (stores[0] && isLatLng(Number(stores[0].latitude), Number(stores[0].longitude))
      ? { lat: Number(stores[0].latitude), lng: Number(stores[0].longitude) }
      : null);

  // Recenter when `center` changes (location search).
  useEffect(() => {
    if (center && mapRef.current) {
      mapRef.current.animateToRegion(toRegion(center, 0.05), 400);
    }
  }, [center]);

  const selectedStore = stores.find((s) => s.id === selectedId) || null;

  // Fetch a driving route from the user to the selected store (OSRM), falling
  // back to a straight line.
  useEffect(() => {
    if (!userLocation || !selectedStore) {
      setRoute(null);
      return;
    }
    const sLat = Number(selectedStore.latitude);
    const sLng = Number(selectedStore.longitude);
    if (!isLatLng(sLat, sLng)) {
      setRoute(null);
      return;
    }
    const straight = [
      { lat: userLocation.lat, lng: userLocation.lng },
      { lat: sLat, lng: sLng },
    ];
    let cancelled = false;
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${userLocation.lng},${userLocation.lat};${sLng},${sLat}?overview=full&geometries=geojson`
    )
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const g = j?.routes?.[0]?.geometry?.coordinates;
        if (Array.isArray(g) && g.length) {
          setRoute(g.map((c: number[]) => ({ lat: c[1], lng: c[0] })));
        } else {
          setRoute(straight);
        }
      })
      .catch(() => {
        if (!cancelled) setRoute(straight);
      });
    return () => {
      cancelled = true;
    };
  }, [userLocation, selectedStore]);

  if (!initial) {
    return (
      <View className="min-h-[320px] flex-1 items-center justify-center rounded-2xl bg-muted" />
    );
  }

  return (
    <View className={className ?? "min-h-[320px] flex-1 overflow-hidden rounded-2xl"}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        initialRegion={toRegion(initial)}
        showsUserLocation={Boolean(userLocation)}
      >
        {/* OSM raster tiles (matches the web look, no API key). */}
        <UrlTile
          urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
        />

        {stores.map((s) => {
          const lat = Number(s.latitude);
          const lng = Number(s.longitude);
          if (!isLatLng(lat, lng)) return null;
          return (
            <Marker
              key={s.id}
              coordinate={{ latitude: lat, longitude: lng }}
              title={s.name || s.storeName || "Store"}
              description={s.distance != null ? `${s.distance} km away` : undefined}
              pinColor={s.id === selectedId ? "#16a34a" : "#34c759"}
              onPress={() => onSelect?.(s.id)}
            />
          );
        })}

        {route ? (
          <Polyline
            coordinates={route.map((c) => ({ latitude: c.lat, longitude: c.lng }))}
            strokeColor="#2563eb"
            strokeWidth={4}
          />
        ) : null}
      </MapView>
    </View>
  );
}
