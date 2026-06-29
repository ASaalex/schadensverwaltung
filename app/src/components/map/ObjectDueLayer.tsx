import { CircleMarker, Polyline, Polygon, Tooltip } from 'react-leaflet';
import { useNetworkObjects } from '@/hooks/useNetworkObjects';
import { useObjectStatus } from '@/hooks/useInspections';

const STATUS_COLOR: Record<string, string> = {
  red: '#ef4444', yellow: '#f59e0b', green: '#10b981', none: '#94a3b8',
};
const STATUS_LABEL: Record<string, string> = {
  red: 'überfällig / bald fällig', yellow: 'fällig in Kürze', green: 'im Plan', none: 'keine Kontrolle',
};

/**
 * Zeigt kontrollpflichtige Objekte (Status != 'none') nach Fälligkeit eingefärbt.
 * Reine Anzeige-Ebene – analog zu NetworkDueLayer für Straßenabschnitte.
 */
export function ObjectDueLayer() {
  const { query } = useNetworkObjects();
  const objects = query.data ?? [];
  const { data: statusMap = {} } = useObjectStatus();

  return (
    <>
      {objects.map((o) => {
        const st = statusMap[o.id];
        if (!st || st.status === 'none') return null;
        const color = STATUS_COLOR[st.status] ?? '#94a3b8';
        const name = o.name || o.identifier || o.type_name || 'Objekt';
        const days = st.days_until_due;
        const tip = (
          <Tooltip sticky>
            {name} · {STATUS_LABEL[st.status]}
            {days != null && ` (${days < 0 ? `${Math.abs(days)} T. überfällig` : `in ${days} T.`})`}
          </Tooltip>
        );
        const g = o.geometry;
        if (g.type === 'Point') {
          const [lng, lat] = g.coordinates as number[];
          return (
            <CircleMarker key={`due-${o.id}`} center={[lat, lng]} radius={7}
              pathOptions={{ color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 }}>{tip}</CircleMarker>
          );
        }
        if (g.type === 'LineString') {
          const positions = (g.coordinates as number[][]).map(([lng, lat]) => [lat, lng] as [number, number]);
          return (
            <Polyline key={`due-${o.id}`} positions={positions}
              pathOptions={{ color, weight: 5, opacity: 0.85 }}>{tip}</Polyline>
          );
        }
        const ring = (g.coordinates as number[][][])[0] ?? [];
        const positions = ring.map(([lng, lat]) => [lat, lng] as [number, number]);
        return (
          <Polygon key={`due-${o.id}`} positions={positions}
            pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.3 }}>{tip}</Polygon>
        );
      })}
    </>
  );
}
