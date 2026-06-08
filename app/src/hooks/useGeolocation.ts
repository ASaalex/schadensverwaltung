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
      // Mehrere Messungen über ~6 s — die mit der besten (kleinsten) Genauigkeit gewinnt
      const ATTEMPTS = 3;
      let best: Position | null = null;
      for (let i = 0; i < ATTEMPTS; i++) {
        try {
          const r = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 10_000,
            maximumAge: 0,
          });
          const p: Position = { lat: r.coords.latitude, lng: r.coords.longitude, accuracy: r.coords.accuracy };
          if (!best || p.accuracy < best.accuracy) best = p;
          setPosition(p.accuracy <= (best?.accuracy ?? Infinity) ? p : best);
          // Gut genug → früher abbrechen
          if (p.accuracy <= 10) break;
        } catch (inner) {
          // Letzter Versuch wirft weiter
          if (i === ATTEMPTS - 1) throw inner;
        }
      }
      if (best) setPosition(best);
    } catch (e) {
      const msg = friendlyGpsError(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  return { position, setPosition, loading, error, fetchPosition };
}

/** Übersetzt technische GPS-/Lade-Fehler in verständliche Hinweise */
function friendlyGpsError(e: unknown): string {
  const msg = (e as Error)?.message ?? String(e);
  const m = msg.toLowerCase();
  if (m.includes('mime type') || m.includes('load failed') || m.includes('dynamically imported')) {
    return 'Standortdienst lädt — bitte erneut versuchen (App wird ggf. kurz neu geladen).';
  }
  if (m.includes('denied') || m.includes('permission')) {
    return 'Standortzugriff verweigert. Bitte in den Browser-/App-Einstellungen erlauben.';
  }
  if (m.includes('timeout')) return 'GPS-Timeout — bitte im Freien erneut versuchen.';
  return msg || 'GPS-Position konnte nicht ermittelt werden';
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
    let bestAcc = Infinity;
    let lastTs = 0;

    (async () => {
      try {
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
          (pos, err) => {
            if (!active) return;
            if (err) {
              setError(friendlyGpsError(err));
              return;
            }
            if (pos) {
              setError(null);
              const acc = pos.coords.accuracy;
              const now = Date.now();
              // Bessere Genauigkeit immer übernehmen; schlechtere nur, wenn
              // der letzte gute Wert > 15 s alt ist (Position könnte gewandert sein).
              if (acc <= bestAcc || now - lastTs > 15_000) {
                bestAcc = acc;
                lastTs = now;
                setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: acc });
              }
            }
          },
        );
        watchIdRef.current = id;
      } catch (e) {
        if (active) setError(friendlyGpsError(e));
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
