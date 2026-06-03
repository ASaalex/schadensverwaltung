import { Polyline, Tooltip } from 'react-leaflet';
import type { RoadSegment } from '@/hooks/useNetworkSegments';

const CLASS_COLORS: Record<string, string> = {
  hauptstrasse:  '#dc2626', // rot
  nebenstrasse:  '#ea580c', // orange
  wirtschaftsweg:'#ca8a04', // gelb
  radweg:        '#16a34a', // grün
  fussweg:       '#9333ea', // lila
  sonstige:      '#6b7280', // grau
};

interface Props {
  segments: RoadSegment[];
}

export function NetworkLayer({ segments }: Props) {
  return (
    <>
      {segments.map((seg) => {
        if (!seg.geometry?.coordinates?.length) return null;
        // GeoJSON: [lng, lat] → Leaflet: [lat, lng]
        const positions = seg.geometry.coordinates.map(
          ([lng, lat]) => [lat, lng] as [number, number],
        );
        const color = CLASS_COLORS[seg.road_class ?? ''] ?? '#6b7280';
        const label = seg.name ?? `${seg.from_node} → ${seg.to_node}`;
        return (
          <Polyline
            key={seg.id}
            positions={positions}
            pathOptions={{ color, weight: 3, opacity: 0.75, dashArray: undefined }}
          >
            <Tooltip sticky>{label}</Tooltip>
          </Polyline>
        );
      })}
    </>
  );
}
