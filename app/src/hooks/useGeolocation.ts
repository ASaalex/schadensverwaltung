import { useCallback, useEffect, useRef, useState } from 'react';
import { Geolocation } from '@capacitor/geolocation';

export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
}

export function useGeolocation() {
  const [position, setPosition] = useState<Position | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPosition = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10_000,
      });
      setPosition({
        lat: result.coords.latitude,
        lng: result.coords.longitude,
        accuracy: result.coords.accuracy,
      });
    } catch (e) {
      const msg = (e as Error).message ?? 'GPS-Position konnte nicht ermittelt werden';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  return { position, setPosition, loading, error, fetchPosition };
}

/**
 * Live-GPS-Tracking via watchPosition. Liefert kontinuierlich Updates,
 * solange `enabled` true ist. Beim Stoppen wird die Subscription beendet.
 */
export function useGpsWatch(enabled: boolean) {
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let active = true;

    (async () => {
      try {
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10_000 },
          (pos, err) => {
            if (!active) return;
            if (err) {
              setError(err.message ?? 'GPS-Update fehlgeschlagen');
              return;
            }
            if (pos) {
              setError(null);
              setPosition({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              });
            }
          },
        );
        watchIdRef.current = id;
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    })();

    return () => {
      active = false;
      const id = watchIdRef.current;
      if (id) {
        Geolocation.clearWatch({ id }).catch(() => {});
        watchIdRef.current = null;
      }
    };
  }, [enabled]);

  return { position, error };
}
