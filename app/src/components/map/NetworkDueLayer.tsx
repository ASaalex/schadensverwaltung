import { Polyline, Tooltip } from 'react-leaflet';
import type { RoadSegment } from '@/hooks/useNetworkSegments';
import { useSegmentStatus } from '@/hooks/useInspections';

/** Fälligkeits-Status → Linienfarbe (analog InspectionStatusMap) */
const STATUS_COLOR: Record<string, string> = {
  red: '#ef4444', yellow: '#f59e0b', green: '#10b981', none: '#94a3b8',
};

const STATUS_LABEL: Record<string, string> = {
  red: 'überfällig / bald fällig', yellow: 'fällig in Kürze', green: 'im Plan', none: 'keine Kontrolle',
};

/**
 * Färbt das Straßennetz nach Kontroll-Fälligkeit (rot/gelb/grün/grau).
 * Reine Anzeige-Ebene – kein Klick-Handling, damit Schadens-Pins klickbar bleiben.
 */
export function NetworkDueLayer({ segments }: { segments: RoadSegment[] }) {
  const { data: statusMap = {} } = useSegmentStatus();
  return (
    <>
      {segments.map((seg) => {
        if (!seg.geometry?.coordinates?.length) return null;
        const positions = seg.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
        const st = statusMap[seg.id];
        const status = st?.status ?? 'none';
        const name = seg.name || (seg.strassen_klasse_asb && seg.strassen_nummer ? `${seg.strassen_klasse_asb} ${seg.strassen_nummer}` : 'Abschnitt');
        const due = st?.days_until_due;
        return (
          <Polyline
            key={`due-${seg.id}`}
            positions={positions}
            pathOptions={{
              color: STATUS_COLOR[status] ?? '#94a3b8',
              weight: status === 'none' ? 3 : 5,
              opacity: status === 'none' ? 0.55 : 0.85,
              dashArray: status === 'none' ? '4 6' : undefined,
            }}
          >
            <Tooltip sticky>
              {name} · {STATUS_LABEL[status]}
              {due != null && ` (${due < 0 ? `${Math.abs(due)} T. überfällig` : `in ${due} T.`})`}
            </Tooltip>
          </Polyline>
        );
      })}
    </>
  );
}
