import { useEffect, useState } from 'react';

export interface AddressSuggestion {
  lat: number;
  lng: number;
  display_name: string;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
}

interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    road?: string;
    pedestrian?: string;
    house_number?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
  };
}

/**
 * Adresssuche via Nominatim (OpenStreetMap), debounced.
 * Beschränkt auf Deutschland (`countrycodes=de`).
 */
export function useAddressSearch(query: string, minLength = 3, debounceMs = 350) {
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < minLength) {
      setResults([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const url =
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}` +
          `&format=json&limit=6&addressdetails=1&countrycodes=de`;
        const res = await fetch(url, {
          headers: { 'Accept-Language': 'de' },
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`Suche fehlgeschlagen (${res.status})`);
        const json: NominatimItem[] = await res.json();
        const mapped: AddressSuggestion[] = json.map((r) => ({
          lat: Number(r.lat),
          lng: Number(r.lon),
          display_name: r.display_name,
          street: r.address?.road ?? r.address?.pedestrian ?? null,
          house_number: r.address?.house_number ?? null,
          postal_code: r.address?.postcode ?? null,
          city:
            r.address?.city ?? r.address?.town ?? r.address?.village ?? r.address?.municipality ?? null,
        }));
        setResults(mapped);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setError((e as Error).message);
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, debounceMs);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, minLength, debounceMs]);

  return { results, loading, error };
}
