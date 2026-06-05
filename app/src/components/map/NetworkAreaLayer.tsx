import { Polygon, Tooltip } from 'react-leaflet';
import { useNetworkAreas, AREA_TYPE_LABELS, AREA_TYPE_COLORS } from '@/hooks/useNetworkAreas';

export function NetworkAreaLayer() {
  const { query } = useNetworkAreas();
  const areas = query.data ?? [];

  return (
    <>
      {areas.map((area) => {
        if (!area.geometry?.coordinates?.length) return null;
        // GeoJSON: [lng, lat] → Leaflet: [lat, lng]
        const ring = area.geometry.coordinates[0].map(
          ([lng, lat]) => [lat, lng] as [number, number],
        );
        const c = AREA_TYPE_COLORS[area.area_type] ?? AREA_TYPE_COLORS.sonstige;
        return (
          <Polygon
            key={area.id}
            positions={ring}
            pathOptions={{
              color:       c.border,
              fillColor:   c.fill,
              weight:      2,
              fillOpacity: 0.25,
              opacity:     0.8,
            }}
          >
            <Tooltip sticky>
              <span className="font-medium">{area.name}</span>
              {' · '}
              <span className="text-slate-500">{AREA_TYPE_LABELS[area.area_type] ?? area.area_type}</span>
            </Tooltip>
          </Polygon>
        );
      })}
    </>
  );
}
