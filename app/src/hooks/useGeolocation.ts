import { useCallback, useState } from 'react';
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
      // Web: triggert Browser-Permission-Dialog · Mobile: Capacitor-Native-Permission
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
