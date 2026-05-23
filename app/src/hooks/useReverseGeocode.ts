import { useEffect, useState } from 'react';

export interface ResolvedAddress {
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  display_name: string;
}

async function reverseGeocode(lat: number, lng: number): Promise<ResolvedAddress> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18`;
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'de' },
  });
  if (!res.ok) throw new Error(`Reverse-Geocoding fehlgeschlagen (${res.status})`);
  const json = await res.json();
  const addr = json.address ?? {};
  return {
    street: addr.road ?? addr.pedestrian ?? null,
    house_number: addr.house_number ?? null,
    postal_code: addr.postcode ?? null,
    city: addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? null,
    display_name: json.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
  };
}

/** Reverse-geocoded address — null bis Lookup fertig oder fehlgeschlagen. */
export function useReverseGeocode(lat: number | null, lng: number | null) {
  const [address, setAddress] = useState<ResolvedAddress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lat == null || lng == null) {
      setAddress(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    reverseGeocode(lat, lng)
      .then((res) => {
        if (!cancelled) setAddress(res);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return { address, loading, error };
}
