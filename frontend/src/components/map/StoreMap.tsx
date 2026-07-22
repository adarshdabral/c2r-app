import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { Station } from "@/lib/api";
import { LeafletMap, type LatLng, type MapMarker } from "@/components/map/LeafletMap";

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

/**
 * Store map — Leaflet/OSM in a WebView (no API key; works on Android + iOS in
 * Expo Go). Shows store markers (selected one highlighted), the user's location,
 * and a route line from the user to the selected store. The route is fetched
 * from the public OSRM server; on any failure it falls back to a straight line.
 */
export function StoreMap({
  stores,
  userLocation,
  center,
  selectedId,
  onSelect,
  className,
}: StoreMapProps) {
  const [route, setRoute] = useState<LatLng[] | null>(null);

  // Stable initial focus captured once; `center`/`userLocation` override it.
  const initial = useRef<LatLng | null>(
    userLocation ||
      center ||
      (stores[0] && isLatLng(Number(stores[0].latitude), Number(stores[0].longitude))
        ? { lat: Number(stores[0].latitude), lng: Number(stores[0].longitude) }
        : null)
  ).current;

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

  const focus = center || userLocation || initial;

  if (!focus) {
    return (
      <View className="min-h-[320px] flex-1 items-center justify-center rounded-2xl bg-muted" />
    );
  }

  const markers: MapMarker[] = stores
    .filter((s) => isLatLng(Number(s.latitude), Number(s.longitude)))
    .map((s) => ({
      id: s.id,
      lat: Number(s.latitude),
      lng: Number(s.longitude),
      color: "#34c759",
      selected: s.id === selectedId,
    }));

  return (
    <View className={className ?? "min-h-[320px] flex-1 overflow-hidden rounded-2xl"}>
      <LeafletMap
        center={focus}
        zoom={12}
        markers={markers}
        userLocation={userLocation}
        route={route}
        onMarkerPress={(id) => onSelect?.(Number(id))}
        className="flex-1"
      />
    </View>
  );
}
