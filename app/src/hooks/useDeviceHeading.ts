import { useEffect, useRef, useState } from 'react';
import {
  deviceBasisFromEuler,
  lerpBasis,
  headingFromBasis,
  rotateBasisAroundUp,
  type DeviceBasis,
} from '@/lib/arProjection';

/**
 * Volle Geräteorientierung als Basisvektoren im Erd-Frame (für AR-Projektion).
 * Android liefert über `deviceorientationabsolute` eine fusionierte, absolute
 * Orientierung (Rotation-Vector-Sensor). iOS nutzt `webkitCompassHeading` als
 * echten Nord-Bezug. requestOrientationPermission() muss per Nutzergeste
 * laufen (iOS 13+).
 */
export function useDeviceOrientation(enabled: boolean) {
  const [basis, setBasis] = useState<DeviceBasis | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const basisRef = useRef<DeviceBasis | null>(null);
  const headingOffsetRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    basisRef.current = null;
    setReady(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (e: any) => {
      if (typeof e.alpha !== 'number' || typeof e.beta !== 'number' || typeof e.gamma !== 'number') return;

      const hasCompass = typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading);
      // Nur nordbezogene Daten verwenden: absolutes Event ODER iOS-Kompass.
      // Relative `deviceorientation`-Events (Android-Fallback) ignorieren –
      // sie hätten keinen Nordbezug und würden die Ausrichtung verfälschen.
      if (!e.absolute && !hasCompass) return;

      let alpha = e.alpha;
      if (hasCompass) {
        // iOS: echten Nord-Bezug aus webkitCompassHeading herstellen
        alpha = (360 - e.webkitCompassHeading) % 360;
      }

      const raw = deviceBasisFromEuler(alpha, e.beta, e.gamma);
      // Glättung: stärker (schnell) wenn noch kein Wert, sonst sanft gegen Zittern
      const smoothed = lerpBasis(basisRef.current, raw, basisRef.current ? 0.25 : 1);
      basisRef.current = smoothed; // ungedreht speichern → Glättung bleibt stetig
      // Manuellen Kompass-Offset auf die ausgegebene Basis anwenden
      const corrected = rotateBasisAroundUp(smoothed, headingOffsetRef.current);
      setBasis(corrected);
      setHeading(headingFromBasis(corrected));
      if (!ready) setReady(true);
    };

    window.addEventListener('deviceorientationabsolute', handler as EventListener, true);
    window.addEventListener('deviceorientation', handler as EventListener, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handler as EventListener, true);
      window.removeEventListener('deviceorientation', handler as EventListener, true);
    };
    // ready bewusst nicht in deps – würde Handler unnötig neu binden
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  /** Manueller Kompass-Offset (Grad) gegen Harteisen-Abweichung. */
  const setHeadingOffset = (deg: number) => { headingOffsetRef.current = deg; };

  return { basis, heading, ready, headingOffset: headingOffsetRef, setHeadingOffset };
}

/** Anfrage der Sensor-Berechtigung (iOS). true = erlaubt/nicht nötig. */
export async function requestOrientationPermission(): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const D = DeviceOrientationEvent as any;
  if (typeof D !== 'undefined' && typeof D.requestPermission === 'function') {
    try {
      const res = await D.requestPermission();
      return res === 'granted';
    } catch {
      return false;
    }
  }
  return true; // Android/Desktop: keine explizite Freigabe nötig
}

export { bearingTo } from '@/lib/arProjection';
