/**
 * ASB-Netzreferenzierung
 *
 * Ermittelt für einen GPS-Punkt den nächstgelegenen Netzabschnitt und
 * berechnet die lotrechte Station auf der Bestandsachse (Polyline).
 *
 * Koordinaten: GeoJSON-Konvention [lng, lat].
 * Distanzen:   Näherungsweise metrisch via äquirectangulärer Projektion —
 *              für kommunale Maßstäbe (< ~50 km) ausreichend genau.
 */

import type { RoadSegment } from '@/hooks/useNetworkSegments';

// ─── Typen ──────────────────────────────────────────────────────────────────

export interface NetworkReference {
  segment_id: string;
  /** Absolute Stationierung = von_station + Offset entlang Abschnitt */
  station_m: number;
  /** Offset ab Segment-Startpunkt in Metern */
  offset_m: number;
  /** Lotrechter Abstand zur Bestandsachse in Metern */
  abstand_m: number;
  /** Menschenlesbare ASB-Referenz, z. B. "K 12 · Abschn. 100/0 · Stat. 1+234 m · Abst. 3.4 m" */
  referenz_text: string;
}

// ─── Projektion ──────────────────────────────────────────────────────────────

const EARTH_R = 6371000; // m

/** [lng,lat] → metrische [x,y] relativ zu einem Referenz-Breitengrad */
function toMetric(lng: number, lat: number, refLat: number): [number, number] {
  const cosRef = Math.cos((refLat * Math.PI) / 180);
  return [
    (lng * Math.PI * EARTH_R * cosRef) / 180,
    (lat * Math.PI * EARTH_R) / 180,
  ];
}

// ─── Lotfußpunkt auf Strecke A→B ────────────────────────────────────────────

function perpFoot(
  Q: [number, number],
  A: [number, number],
  B: [number, number],
): { t: number; dist: number } {
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) {
    return { t: 0, dist: Math.hypot(Q[0] - A[0], Q[1] - A[1]) };
  }
  const t = Math.max(0, Math.min(1, ((Q[0] - A[0]) * dx + (Q[1] - A[1]) * dy) / len2));
  const fx = A[0] + t * dx;
  const fy = A[1] + t * dy;
  return { t, dist: Math.hypot(Q[0] - fx, Q[1] - fy) };
}

// ─── ASB-Stationsformat ──────────────────────────────────────────────────────

/** Formatiert Meter als ASB-Station "km+mmm", z. B. 1234.5 → "1+235" */
export function formatStationAsb(m: number): string {
  const rounded = Math.round(m);
  const km = Math.floor(rounded / 1000);
  const rest = rounded - km * 1000;
  return `${km}+${String(rest).padStart(3, '0')}`;
}

// ─── Hauptfunktion ───────────────────────────────────────────────────────────

/**
 * Referenziert einen GPS-Punkt auf das nächste Segment.
 * Gibt null zurück wenn keine Segmente mit Geometrie vorhanden sind.
 */
export function referenceToNetwork(
  lat: number,
  lng: number,
  segments: RoadSegment[],
): NetworkReference | null {
  let bestSegId = '';
  let bestDist = Infinity;
  let bestOffset = 0;
  let bestSeg: RoadSegment | null = null;

  for (const seg of segments) {
    const coords = seg.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;

    // Referenz-Breitengrad = Mittelpunkt des Segments
    const midLat = coords[Math.floor(coords.length / 2)][1];
    const Q = toMetric(lng, lat, midLat);

    let accumulated = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const A = toMetric(coords[i][0], coords[i][1], midLat);
      const B = toMetric(coords[i + 1][0], coords[i + 1][1], midLat);
      const subLen = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const { t, dist } = perpFoot(Q, A, B);
      const offsetHere = accumulated + t * subLen;

      if (dist < bestDist) {
        bestDist = dist;
        bestOffset = offsetHere;
        bestSegId = seg.id;
        bestSeg = seg;
      }
      accumulated += subLen;
    }
  }

  if (!bestSeg) return null;

  const vonStation = bestSeg.von_station ?? 0;
  const absStation = vonStation + bestOffset;

  // Menschenlesbare Referenz zusammenbauen
  const parts: string[] = [];

  // Straßenklasse + Nummer
  if (bestSeg.strassen_klasse_asb && bestSeg.strassen_nummer) {
    parts.push(`${bestSeg.strassen_klasse_asb} ${bestSeg.strassen_nummer}`);
  } else if (bestSeg.name) {
    parts.push(bestSeg.name);
  } else if (bestSeg.strassen_klasse_asb) {
    parts.push(bestSeg.strassen_klasse_asb);
  }

  // Abschnitt / Ast
  if (bestSeg.abschnitts_nummer) {
    const ast = bestSeg.ast_nummer && bestSeg.ast_nummer !== '0' ? `/${bestSeg.ast_nummer}` : '';
    parts.push(`Abschn. ${bestSeg.abschnitts_nummer}${ast}`);
  }

  // Stationierung
  parts.push(`Stat. ${formatStationAsb(absStation)} m`);

  // Lotabstand
  parts.push(`Abst. ${bestDist.toFixed(1)} m`);

  return {
    segment_id: bestSegId,
    station_m: Math.round(absStation * 10) / 10,
    offset_m: Math.round(bestOffset * 10) / 10,
    abstand_m: Math.round(bestDist * 10) / 10,
    referenz_text: parts.join(' · '),
  };
}
