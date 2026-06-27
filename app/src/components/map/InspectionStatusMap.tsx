/**
 * Karte des Straßennetzes mit Fälligkeits-Ampel + Begehungs-Historie.
 * Schwellen relativ zum Kontrollintervall (serverseitig in segment_inspection_status):
 *  rot  = überfällig / nie begangen / Restzeit <= 10 % des Intervalls
 *  gelb = Restzeit <= 25 % des Intervalls
 *  grün = sonst
 *  grau = keine Kontrollpflicht (Netz-Farbe)
 * Klick auf einen Abschnitt → Historie (wann/von wem).
 */
import { useEffect, useState } from 'react';
import { MapContainer, Polyline, Polygon, Tooltip, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { X, History, Loader2 } from 'lucide-react';
import { MapLayerSwitcher } from './MapLayerSwitcher';
import { useMapLayers } from '@/hooks/useMapLayers';
import { useNetworkSegments } from '@/hooks/useNetworkSegments';
import { useNetworkObjects } from '@/hooks/useNetworkObjects';
import { useSegmentStatus, useSegmentInspections, useObjectStatus, useObjectInspections } from '@/hooks/useInspections';

const STATUS_COLOR: Record<string, string> = {
  red: '#ef4444', yellow: '#f59e0b', green: '#10b981', none: '#94a3b8',
};

function FitToSegments({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (pts.length === 0) return;
    map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts.length]);
  return null;
}

/** Folgt der aktuellen Position (Kontrollgang) */
function FollowCurrent({ current }: { current: [number, number] | null }) {
  const map = useMap();
  useEffect(() => { if (current) map.setView(current, Math.max(map.getZoom(), 16)); }, [current, map]);
  return null;
}

interface Props {
  /** Live-Track des Kontrollgangs [lng,lat][] */
  track?: number[][];
  /** Aktuelle GPS-Position [lat,lng] */
  current?: [number, number] | null;
}

export function InspectionStatusMap({ track, current }: Props = {}) {
  const { data: layers } = useMapLayers();
  const { data: segments = [] } = useNetworkSegments();
  const { data: statusMap = {} } = useSegmentStatus();
  const { query: objectsQ } = useNetworkObjects();
  const objects = objectsQ.data ?? [];
  const { data: objStatusMap = {} } = useObjectStatus();
  const [historySeg, setHistorySeg] = useState<{ id: string; name: string } | null>(null);
  const [historyObj, setHistoryObj] = useState<{ id: string; name: string } | null>(null);

  // Objekte mit Kontrollpflicht (Status != 'none') nach Fälligkeit einfärben
  const dueObjects = objects
    .map((o) => ({ o, st: objStatusMap[o.id] }))
    .filter((x) => x.st && x.st.status !== 'none');

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
      return {
        id: s.id, positions, status,
        name: s.name ?? `${s.from_node} → ${s.to_node}`,
        due: st?.due_at, days: st?.days_until_due ?? null,
      };
    });

  const trackLatLng: [number, number][] = (track ?? []).map(([lng, lat]) => [lat, lng]);
  const center: [number, number] = current ?? allPts[0] ?? [50.9787, 11.0328];
  const isWalk = !!track || !!current;

  return (
    <div className="relative h-full w-full">
      <MapContainer center={center} zoom={isWalk ? 17 : 13} maxZoom={22} className="h-full w-full">
        <MapLayerSwitcher layers={layers} maxZoom={22} />
        {isWalk ? <FollowCurrent current={current ?? null} /> : <FitToSegments pts={allPts} />}
        {trackLatLng.length >= 2 && (
          <Polyline positions={trackLatLng} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.9 }} />
        )}
        {current && (
          <CircleMarker center={current} radius={7}
            pathOptions={{ color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }} />
        )}
        {lines.map((l) => (
          <Polyline key={l.id} positions={l.positions}
            pathOptions={{
              color: STATUS_COLOR[l.status] ?? '#94a3b8',
              weight: l.status === 'none' ? 3 : 5,
              opacity: l.status === 'none' ? 0.6 : 0.85,
              dashArray: l.status === 'none' ? '4 6' : undefined,
            }}
            eventHandlers={{ click: () => setHistorySeg({ id: l.id, name: l.name }) }}>
            <Tooltip sticky>
              <div className="text-xs">
                <b>{l.name}</b>
                {l.status === 'none' ? (
                  <div>keine Kontrollpflicht</div>
                ) : (
                  <>
                    {l.due && <div>fällig: {new Date(l.due).toLocaleDateString('de-DE')}</div>}
                    {l.days != null
                      ? <div>{l.days < 0 ? `überfällig seit ${Math.abs(l.days)} Tag(en)` : `in ${l.days} Tag(en) fällig`}</div>
                      : <div>noch nie begangen</div>}
                  </>
                )}
                <div className="mt-0.5 text-slate-400">Klick → Historie</div>
              </div>
            </Tooltip>
          </Polyline>
        ))}

        {/* Objekte mit Kontrollpflicht – nach Fälligkeit eingefärbt */}
        {dueObjects.map(({ o, st }) => {
          const color = STATUS_COLOR[st!.status] ?? '#94a3b8';
          const name = o.name || o.identifier || o.type_name || 'Objekt';
          const days = st!.days_until_due;
          const tip = (
            <Tooltip sticky>
              <div className="text-xs">
                <b>{name}</b>
                {days != null
                  ? <div>{days < 0 ? `überfällig seit ${Math.abs(days)} Tag(en)` : `in ${days} Tag(en) fällig`}</div>
                  : <div>noch nie kontrolliert</div>}
                <div className="mt-0.5 text-slate-400">Klick → Historie</div>
              </div>
            </Tooltip>
          );
          const onClick = () => setHistoryObj({ id: o.id, name });
          const g = o.geometry;
          if (g.type === 'Point') {
            const [lng, lat] = g.coordinates as number[];
            return (
              <CircleMarker key={o.id} center={[lat, lng]} radius={8}
                pathOptions={{ color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 }}
                eventHandlers={{ click: onClick }}>{tip}</CircleMarker>
            );
          }
          if (g.type === 'LineString') {
            const positions = (g.coordinates as number[][]).map(([lng, lat]) => [lat, lng] as [number, number]);
            return (
              <Polyline key={o.id} positions={positions}
                pathOptions={{ color, weight: 5, opacity: 0.9 }}
                eventHandlers={{ click: onClick }}>{tip}</Polyline>
            );
          }
          const ring = (g.coordinates as number[][][])[0] ?? [];
          const positions = ring.map(([lng, lat]) => [lat, lng] as [number, number]);
          return (
            <Polygon key={o.id} positions={positions}
              pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.3 }}
              eventHandlers={{ click: onClick }}>{tip}</Polygon>
          );
        })}
      </MapContainer>

      {/* Legende */}
      <div className="absolute bottom-2 left-2 z-[1000] flex flex-wrap gap-3 rounded bg-white/95 px-3 py-1.5 text-xs shadow">
        {[['red', 'überfällig / bald fällig'], ['yellow', 'fällig in Kürze'], ['green', 'im Plan'], ['none', 'keine Kontrolle']].map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded" style={{ background: STATUS_COLOR[k] }} />
            <span className="text-slate-700">{label}</span>
          </span>
        ))}
      </div>

      {/* Historie-Modal */}
      {historySeg && (
        <HistoryModal segId={historySeg.id} name={historySeg.name} onClose={() => setHistorySeg(null)} />
      )}
      {historyObj && (
        <ObjectHistoryModal objId={historyObj.id} name={historyObj.name} onClose={() => setHistoryObj(null)} />
      )}
    </div>
  );
}

function ObjectHistoryModal({ objId, name, onClose }: { objId: string; name: string; onClose: () => void }) {
  const { data: inspections = [], isLoading } = useObjectInspections(objId);
  return (
    <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 font-medium">
            <History className="h-4 w-4 text-blue-500" /> Kontroll-Historie
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="px-4 py-2 text-xs text-muted-foreground">{name}</div>
        <div className="max-h-72 overflow-y-auto px-4 pb-4">
          {isLoading && <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lade …</div>}
          {!isLoading && inspections.length === 0 && (
            <div className="py-4 text-center text-sm text-muted-foreground">Noch keine Kontrolle erfasst.</div>
          )}
          <ul className="divide-y">
            {inspections.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium">{new Date(i.inspected_at).toLocaleString('de-DE')}</div>
                  <div className="text-xs text-muted-foreground">{i.inspector_name ?? 'Unbekannt'}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({ segId, name, onClose }: { segId: string; name: string; onClose: () => void }) {
  const { data: inspections = [], isLoading } = useSegmentInspections(segId);
  return (
    <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 font-medium">
            <History className="h-4 w-4 text-blue-500" /> Begehungs-Historie
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="px-4 py-2 text-xs text-muted-foreground">{name}</div>
        <div className="max-h-72 overflow-y-auto px-4 pb-4">
          {isLoading && <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lade …</div>}
          {!isLoading && inspections.length === 0 && (
            <div className="py-4 text-center text-sm text-muted-foreground">Noch keine Begehung erfasst.</div>
          )}
          <ul className="divide-y">
            {inspections.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium">{new Date(i.inspected_at).toLocaleString('de-DE')}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.inspector_name ?? 'Unbekannt'}
                    {i.coverage_pct != null && ` · ${Math.round(i.coverage_pct * 100)} % begangen`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
