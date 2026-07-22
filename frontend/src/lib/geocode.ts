/**
 * Lightweight geocoding via OpenStreetMap Nominatim — no API key, same OSM
 * stack the maps already use. Used by the cascading location picker so a typed
 * State / District / City / Locality resolves to a point on the map (and a
 * tapped point resolves back to those fields).
 *
 * Respect Nominatim's usage policy: requests are debounced by callers and
 * limited to one result. For production-scale traffic, swap the endpoint for a
 * self-hosted Nominatim or a keyed provider.
 */

const ENDPOINT = "https://nominatim.openstreetmap.org";

export type LocationParts = {
  state?: string;
  district?: string;
  city?: string;
  locality?: string;
};

export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string;
};

export type ReverseResult = LocationParts & {
  displayName: string;
};

const hasAny = (p: LocationParts) =>
  Boolean(p.state || p.district || p.city || p.locality);

/** Build the human-readable address string we store / display. */
export function composeAddress(p: LocationParts, prefix?: string): string {
  return [prefix, p.locality, p.city, p.district, p.state]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * Forward geocode the structured parts to a coordinate. Returns null if nothing
 * was provided or no match was found. `signal` lets callers cancel stale calls.
 */
export async function forwardGeocode(
  parts: LocationParts,
  signal?: AbortSignal
): Promise<GeocodeResult | null> {
  if (!hasAny(parts)) return null;

  const q = composeAddress(parts);
  const url =
    `${ENDPOINT}/search?format=jsonv2&limit=1&addressdetails=0&countrycodes=in` +
    `&q=${encodeURIComponent(q)}`;

  try {
    const res = await fetch(url, {
      signal,
      headers: { Accept: "application/json", "Accept-Language": "en" },
    });
    if (!res.ok) return null;
    const data: Array<{ lat: string; lon: string; display_name: string }> = await res.json();
    if (!data.length) return null;
    return {
      lat: Number(data[0].lat),
      lng: Number(data[0].lon),
      displayName: data[0].display_name,
    };
  } catch {
    // Aborted or network error — treat as "no result".
    return null;
  }
}

/** Reverse geocode a coordinate into best-effort State / District / City / Locality. */
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<ReverseResult | null> {
  const url =
    `${ENDPOINT}/reverse?format=jsonv2&addressdetails=1&zoom=16` +
    `&lat=${lat}&lon=${lng}`;

  try {
    const res = await fetch(url, {
      signal,
      headers: { Accept: "application/json", "Accept-Language": "en" },
    });
    if (!res.ok) return null;
    const data: { display_name?: string; address?: Record<string, string> } = await res.json();
    const a = data.address ?? {};

    return {
      state: a.state || "",
      district: a.state_district || a.county || a.district || "",
      city: a.city || a.town || a.municipality || a.village || a.suburb || "",
      locality:
        a.neighbourhood || a.suburb || a.quarter || a.residential || a.hamlet || a.road || "",
      displayName: data.display_name || "",
    };
  } catch {
    return null;
  }
}
