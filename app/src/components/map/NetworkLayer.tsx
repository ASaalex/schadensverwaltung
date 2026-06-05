import { Polyline, Tooltip } from 'react-leaflet';
import type { RoadSegment } from '@/hooks/useNetworkSegments';

/** ASB-Klasse → Linienfarbe */
const ASB_COLORS: Record<string, string> = {
  A:    '#dc2626', // rot      – Autobahn
  B:    '#ea580c', // orange   – Bundesstraße
  L:    '#ca8a04', // gelb     – Landesstraße
  K:    '#16a34a', // grün     – Kreisstraße
  St:   '#0ea5e9', // hellblau – Stadtstraße
  Gem:  '#6366f1', // indigo   – Gemeindestraße
  GV:   '#8b5cf6', // violett  – Gemeindeverbindungsstraße
  P:    '#78716c', // braun    – Privat-/Wirtschaftsweg
  Rad:  '#10b981', // smaragd  – Radweg
  sonst:'#94a3b8', // grau     – Sonstige
};

/** Legacy road_class → Farbe (Fallback) */
const LEGACY_COLORS: Record<string, string> = {
  hauptstrasse:   '#dc2626',
  nebenstrasse:   '#ea580c',
  wirtschaftsweg: '#78716c',
  radweg:         '#10b981',
  fussweg:        '#94a3b8',
  sonstige:       '#94a3b8',
};

function segmentColor(seg: RoadSegment): string {
  if (seg.strassen_klasse_asb) return ASB_COLORS[seg.strassen_klasse_asb] ?? '#6b7280';
  if (seg.road_class) return LEGACY_COLORS[seg.road_class] ?? '#6b7280';
  return '#6b7280';
}

function segmentWeight(seg: RoadSegment): number {
  const cls = seg.strassen_klasse_asb ?? '';
  if (cls === 'A') return 5;
  if (cls === 'B') return 4;
  if (cls === 'L' || cls === 'K') return 3;
  return 2.5;
}

function buildTooltip(seg: RoadSegment): string {
  const parts: string[] = [];
  if (seg.strassen_klasse_asb && seg.strassen_nummer) {
    parts.push(`${seg.strassen_klasse_asb} ${seg.strassen_nummer}`);
  } else if (seg.name) {
    parts.push(seg.name);
  }
  if (seg.abschnitts_nummer) {
    const ast = seg.ast_nummer && seg.ast_nummer !== '0' ? `/${seg.ast_nummer}` : '';
    parts.push(`Abschn. ${seg.abschnitts_nummer}${ast}`);
  }
  parts.push(`${seg.from_node} → ${seg.to_node}`);
  if (seg.length_m) parts.push(`${Math.round(seg.length_m)} m`);
  if (seg.von_station != null && seg.bis_station != null) {
    parts.push(`Stat. ${seg.von_station}–${seg.bis_station} m`);
  }
  return parts.join(' · ');
}

interface Props {
  segments: RoadSegment[];
}

export function NetworkLayer({ segments }: Props) {
  return (
    <>
      {segments.map((seg) => {
        if (!seg.geometry?.coordinates?.length) return null;
        const positions = seg.geometry.coordinates.map(
          ([lng, lat]) => [lat, lng] as [number, number],
        );
        return (
          <Polyline
            key={seg.id}
            positions={positions}
            pathOptions={{
              color: segmentColor(seg),
              weight: segmentWeight(seg),
              opacity: 0.8,
            }}
          >
            <Tooltip sticky>{buildTooltip(seg)}</Tooltip>
          </Polyline>
        );
      })}
    </>
  );
}
