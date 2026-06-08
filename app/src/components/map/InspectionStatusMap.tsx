/**
 * Karte des Straßennetzes mit Fälligkeits-Ampel:
 *  rot   = Begehung diesen Monat fällig oder überfällig (auch: nie begangen)
 *  gelb  = Begehung nächsten Monat fällig
 *  grün  = Begehung im übernächsten Monat oder später
 */
import { useEffect } from 'react';
import { MapContainer, Polyline, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapLayerSwitcher } from './MapLayerSwitcher';
import { useMapLayers } from '@/hooks/useMapLayers';
import { useNetworkSegments } from '@/hooks/useNetworkSegments';
import { useSegmentStatus } from '@/hooks/useInspections';

const STATUS_COLOR: Record<string, string> = { red: '#ef4444', yellow: '#f59e0b', green: '#10b981' };

function FitToSegments({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (pts.length === 0) return;
    map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts.length]);
  return null;
}

export function InspectionStatusMap() {
  const { data: layers } = useMapLayers();
  const { data: segments = [] } = useNetworkSegments();
  const { data: statusMap = {} } = useSegmentStatus();

  const allPts: [number, number][] = [];
  const lines = segments
    .filter((s) => s.geometry?.type === 'LineString' && Array.isArray(s.geometry.coordinates))
    .map((s) => {
      const positions = (s.geometry!.coordinates as number[][]).map(([lng, lat]) => {
        allPts.push([lat, lng]);
        return [lat, lng] as [number, number];
      });
      const st = statusMap[s.id];
      const status = st?.status ?? 'red';
      return { id: s.id, positions, status, name: s.name, from: s.from_node, to: s.to_node, due: st?.due_at, days: st?.days_until_due ?? null };
    });

  const center: [number, number] = allPts[0] ?? [50.9787, 11.0328];

  return (
    <div className="relative h-full w-full">
      <MapContainer center={center} zoom={13} maxZoom={22} className="h-full w-full">
        <MapLayerSwitcher layers={layers} maxZoom={22} />
        <FitToSegments pts={allPts} />
        {lines.map((l) => (
          <Polyline key={l.id} positions={l.positions}
            pathOptions={{ color: STATUS_COLOR[l.status] ?? '#94a3b8', weight: 5, opacity: 0.85 }}>
            <Tooltip sticky>
              <div className="text-xs">
                <b>{l.name ?? `${l.from} → ${l.to}`}</b>
                {l.due && <div>fällig: {new Date(l.due).toLocaleDateString('de-DE')}</div>}
                {l.days != null && (
                  <div>{l.days < 0 ? `überfällig seit ${Math.abs(l.days)} Tag(en)` : `in ${l.days} Tag(en) fällig`}</div>
                )}
                {l.days == null && <div>keine Begehung / keine Kontrolle</div>}
              </div>
            </Tooltip>
          </Polyline>
        ))}
      </MapContainer>

      {/* Legende */}
      <div className="absolute bottom-2 left-2 z-[1000] flex flex-wrap gap-3 rounded bg-white/95 px-3 py-1.5 text-xs shadow">
        {[['red', 'überfällig / ≤ 30 Tage'], ['yellow', '31–60 Tage'], ['green', '> 60 Tage']].map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded" style={{ background: STATUS_COLOR[k] }} />
            <span className="text-slate-700">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
