import { useRef } from "react";
import { View } from "react-native";
import { LeafletMap, type LatLng } from "@/components/map/LeafletMap";

// Default view when we have neither a value nor geolocation (central India).
const DEFAULT_CENTER: LatLng = { lat: 20.5937, lng: 78.9629 };

/**
 * Interactive location picker — tap the map to drop the pin; reports lat/lng via
 * onChange. Backed by Leaflet/OSM in a WebView (no API key; works on Android +
 * iOS in Expo Go). Re-centers only from an explicit `center` (search /
 * my-location); tapping to move the pin does NOT yank the viewport.
 */
export function LocationPicker({
  value,
  center,
  onChange,
  className,
}: {
  value: LatLng | null;
  center?: LatLng | null;
  onChange: (lat: number, lng: number) => void;
  className?: string;
}) {
  // Stable initial focus, captured once; an explicit `center` overrides it.
  const initial = useRef(center || value || DEFAULT_CENTER).current;
  const focus = center || initial;
  const zoomed = Boolean(center || value);
  const markers = value
    ? [{ id: "pick", lat: value.lat, lng: value.lng, color: "#16a34a", selected: true }]
    : [];

  return (
    <View className={className ?? "h-[260px] w-full overflow-hidden rounded-2xl"}>
      <LeafletMap
        center={focus}
        zoom={zoomed ? 15 : 5}
        markers={markers}
        tapToPlace
        onMapPress={(lat, lng) => onChange(lat, lng)}
        className="flex-1"
      />
    </View>
  );
}
