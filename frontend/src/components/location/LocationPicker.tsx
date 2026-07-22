import { useEffect, useRef } from "react";
import { View } from "react-native";
import MapView, {
  Marker,
  UrlTile,
  PROVIDER_DEFAULT,
  type Region,
} from "react-native-maps";

type LatLng = { lat: number; lng: number };

// Default view when we have neither a value nor geolocation (central India).
const DEFAULT_CENTER: LatLng = { lat: 20.5937, lng: 78.9629 };

const toRegion = (c: LatLng, delta: number): Region => ({
  latitude: c.lat,
  longitude: c.lng,
  latitudeDelta: delta,
  longitudeDelta: delta,
});

/**
 * Interactive location picker (react-native-maps port). Tap anywhere to drop
 * the pin, or drag it — both report the new lat/lng via onChange. Used by the
 * store form and pickup/drop-off flows to set coordinates from the map.
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
  const mapRef = useRef<MapView>(null);
  const initial = value || center || DEFAULT_CENTER;
  const zoomed = Boolean(value || center);

  useEffect(() => {
    if (center && mapRef.current) {
      mapRef.current.animateToRegion(toRegion(center, 0.02), 400);
    }
  }, [center]);

  return (
    <View className={className ?? "h-[260px] w-full overflow-hidden rounded-2xl"}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        initialRegion={toRegion(initial, zoomed ? 0.02 : 6)}
        onPress={(e) => {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          onChange(latitude, longitude);
        }}
      >
        <UrlTile
          urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
        />
        {value ? (
          <Marker
            coordinate={{ latitude: value.lat, longitude: value.lng }}
            draggable
            pinColor="#16a34a"
            onDragEnd={(e) => {
              const { latitude, longitude } = e.nativeEvent.coordinate;
              onChange(latitude, longitude);
            }}
          />
        ) : null}
      </MapView>
    </View>
  );
}
