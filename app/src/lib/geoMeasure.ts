/**
 * Geo-Mess-Helfer für lat/lng-Punktlisten (GeoJSON-Konvention: [lng, lat]).
 *
 * Distanzen via Haversine — exakt für unsere Bauhof-Distanzen.
 * Polygon-Fläche via lokale equirectangulare Projektion + Shoelace —
 * für kleine Polygone (< ein paar km) ausreichend genau.
 */

const EARTH_RADIUS_M = 6371000;

/** Distanz zwischen zwei Punkten in Metern (Haversine). */
export function haversineDistance(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number],
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Länge einer Polyline in Metern (Summe der Haversine-Distanzen). */
export function lineLength(points: number[][]): number {
  if (points.length < 2) return 0;
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += haversineDistance(
      points[i - 1] as [number, number],
      points[i] as [number, number],
    );
  }
  return len;
}

/** Fläche eines Polygons in m² (lokale equirect. Projektion + Shoelace). */
export function polygonArea(points: number[][]): number {
  if (points.length < 3) return 0;
  const avgLat =
    points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const cosLat = Math.cos((avgLat * Math.PI) / 180);
  const projected = points.map(([lng, lat]) => [
    ((lng * Math.PI) / 180) * EARTH_RADIUS_M * cosLat,
    ((lat * Math.PI) / 180) * EARTH_RADIUS_M,
  ]);
  let area = 0;
  for (let i = 0; i < projected.length; i++) {
    const [x1, y1] = projected[i];
    const [x2, y2] = projected[(i + 1) % projected.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

/** Lesbare Formatierung: Meter ↔ Kilometer */
export function formatLength(m: number): string {
  if (m < 1) return `${(m * 100).toFixed(0)} cm`;
  if (m < 1000) return `${m.toFixed(m < 10 ? 1 : 0)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

/** Lesbare Formatierung: m² ↔ Hektar */
export function formatArea(m2: number): string {
  if (m2 < 10000) return `${m2.toFixed(m2 < 100 ? 1 : 0)} m²`;
  return `${(m2 / 10000).toFixed(2)} ha`;
}
