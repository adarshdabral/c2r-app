import { useCallback, useState } from "react";
import * as Location from "expo-location";

export type Coords = { lat: number; lng: number };

/**
 * Geolocation via expo-location — the RN replacement for navigator.geolocation.
 * Requests foreground permission on demand and returns the current position.
 */
export function useLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async (): Promise<Coords | null> => {
    setLoading(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission denied");
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCoords(next);
      return next;
    } catch {
      setError("Could not get your location");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { coords, loading, error, request };
}
