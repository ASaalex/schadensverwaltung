import { useEffect, useRef, useState } from 'react';

/**
 * Geräte-Kompass (Heading 0–360°, 0 = Norden, im Uhrzeigersinn) + Neigung (pitch).
 * iOS liefert webkitCompassHeading (true heading), Android nutzt absolute alpha.
 * requestPermission() muss per Nutzergeste aufgerufen werden (iOS 13+).
 */
export function useDeviceHeading(enabled: boolean) {
  const [heading, setHeading] = useState<number | null>(null);
  const [pitch, setPitch] = useState<number>(0);
  const headingRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (e: any) => {
      let h: number | null = null;
      if (typeof e.webkitCompassHeading === 'number') {
        h = e.webkitCompassHeading; // iOS: bereits true heading, im Uhrzeigersinn
      } else if (e.absolute && typeof e.alpha === 'number') {
        h = (360 - e.alpha) % 360; // Android absolute
      } else if (typeof e.alpha === 'number') {
        h = (360 - e.alpha) % 360;
      }
      if (h != null && !Number.isNaN(h)) {
        // leichte Glättung
        const prev = headingRef.current;
        const next = prev == null ? h : prev + angleDelta(prev, h) * 0.25;
        headingRef.current = (next + 360) % 360;
        setHeading(headingRef.current);
      }
      if (typeof e.beta === 'number') setPitch(e.beta);
    };
    window.addEventListener('deviceorientationabsolute', handler as EventListener);
    window.addEventListener('deviceorientation', handler as EventListener);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handler as EventListener);
      window.removeEventListener('deviceorientation', handler as EventListener);
    };
  }, [enabled]);

  return { heading, pitch };
}

function angleDelta(a: number, b: number): number {
  let d = ((b - a + 540) % 360) - 180;
  return d;
}

/** Anfrage der Sensor-Berechtigung (iOS). Gibt true zurück, wenn erlaubt/nicht nötig. */
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

/** Peilung (bearing) von Punkt A nach B in Grad (0 = Nord, im Uhrzeigersinn). */
export function bearingTo(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
