import { CircleMarker, Polyline, Polygon, Tooltip } from 'react-leaflet';
import type { NetworkObject } from '@/hooks/useNetworkObjects';

interface Props {
  objects: NetworkObject[];
  selectedId?: string | null;
  onObjectClick?: (id: string) => void;
}

export function NetworkObjectLayer({ objects, selectedId, onObjectClick }: Props) {
  return (
    <>
      {objects.map((obj) => {
        const color  = obj.type_color ?? '#6366f1';
        const label  = [obj.type_name, obj.name ?? obj.identifier].filter(Boolean).join(' · ');
        const isSelected = obj.id === selectedId;
        const weight = isSelected ? 4 : 2;
        const opts = { color, weight, opacity: isSelected ? 1 : 0.85, fillOpacity: 0.3 };
        const handlers = onObjectClick ? { click: () => onObjectClick(obj.id) } : undefined;

        if (obj.geometry.type === 'Point') {
          const [lng, lat] = obj.geometry.coordinates as number[];
          return (
            <CircleMarker key={obj.id}
              center={[lat, lng]}
              radius={isSelected ? 10 : 7}
              pathOptions={{ ...opts, fillOpacity: 0.6 }}
              eventHandlers={handlers}>
              <Tooltip sticky>{label}</Tooltip>
            </CircleMarker>
          );
        }
        if (obj.geometry.type === 'LineString') {
          const positions = (obj.geometry.coordinates as number[][]).map(
            ([lo, la]) => [la, lo] as [number, number]);
          return (
            <Polyline key={obj.id} positions={positions} pathOptions={opts} eventHandlers={handlers}>
              <Tooltip sticky>{label}</Tooltip>
            </Polyline>
          );
        }
        if (obj.geometry.type === 'Polygon') {
          const ring = (obj.geometry.coordinates as number[][][])[0].map(
            ([lo, la]) => [la, lo] as [number, number]);
          return (
            <Polygon key={obj.id} positions={ring} pathOptions={opts} eventHandlers={handlers}>
              <Tooltip sticky>{label}</Tooltip>
            </Polygon>
          );
        }
        return null;
      })}
    </>
  );
}
