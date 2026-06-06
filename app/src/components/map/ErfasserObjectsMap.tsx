/**
 * Karte für die Erfasser-Objektübersicht.
 * - zeigt eigene GPS-Position
 * - rendert Objekte NUR im sichtbaren Kartenausschnitt und erst ab einem
 *   Zoomlevel (Performance bei vielen Objekten)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Crosshair, Loader2 } from 'lucide-react';
import { NetworkObjectLayer } from './NetworkObjectLayer';
import { objectCenter, type NetworkObject } from '@/hooks/useNetworkObjects';
import { useGpsWatch } from '@/hooks/useGeolocation';

/** Ab diesem Zoom werden Objekte geladen/angezeigt */
const ZOOM_THRESHOLD = 15;
const DEFAULT_CENTER: [number, number] = [50.9787, 11.0328];

interface Props {
  objects: NetworkObject[];
  onObjectClick: (id: string) => void;
}

// ── Viewport-Tracker ──────────────────────────────────────────────────────────

function ViewportTracker({ onChange }: { onChange: (bounds: L.LatLngBounds, zoom: number) => void }) {
  const map = useMapEvents({
    moveend: () => onChange(map.getBounds(), map.getZoom()),
    zoomend: () => onChange(map.getBounds(), map.getZoom()),
  });
  useEffect(() => {
    const t = setTimeout(() => { map.invalidateSize(); onChange(map.getBounds(), map.getZoom()); }, 200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// ── GPS-Marker + Auto-Center beim ersten Fix ──────────────────────────────────

function GpsMarker({ pos, autoCenteredRef }: {
  pos: { lat: number; lng: number; accuracy: number } | null;
  autoCenteredRef: React.MutableRefObject<boolean>;
}) {
  const map = useMap();
  useEffect(() => {
    if (pos && !autoCenteredRef.current) {
      autoCenteredRef.current = true;
      map.setView([pos.lat, pos.lng], 17);
    }
  }, [pos, map, autoCenteredRef]);

  if (!pos) return null;
  return (
    <CircleMarker center={[pos.lat, pos.lng]} radius={8}
      pathOptions={{ color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }} />
  );
}

// ── Locate-Button ─────────────────────────────────────────────────────────────

function LocateButton({ pos }: { pos: { lat: number; lng: number } | null }) {
  const map = useMap();
  return (
    <button
      onClick={() => pos && map.setView([pos.lat, pos.lng], Math.max(map.getZoom(), 17))}
      className="absolute right-3 top-3 z-[1000] flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg active:scale-95"
      title="Auf meine Position zentrieren"
    >
      <Crosshair className="h-5 w-5 text-blue-600" />
    </button>
  );
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export function ErfasserObjectsMap({ objects, onObjectClick }: Props) {
  const { position } = useGpsWatch(true);
  const autoCenteredRef = useRef(false);
  const [view, setView] = useState<{ bounds: L.LatLngBounds | null; zoom: number }>({ bounds: null, zoom: 13 });

  const visible = useMemo(() => {
    if (!view.bounds || view.zoom < ZOOM_THRESHOLD) return [];
    const b = view.bounds;
    return objects.filter((o) => {
      const [lng, lat] = objectCenter(o);
      return b.contains([lat, lng]);
    });
  }, [objects, view]);

  const tooFarOut = view.zoom < ZOOM_THRESHOLD;
  const initialCenter: [number, number] = position ? [position.lat, position.lng] : DEFAULT_CENTER;

  return (
    <div className="relative h-full w-full">
      <MapContainer center={initialCenter} zoom={position ? 16 : 13} className="h-full w-full" zoomControl>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" maxZoom={19} />
        <ViewportTracker onChange={(bounds, zoom) => setView({ bounds, zoom })} />
        <GpsMarker pos={position} autoCenteredRef={autoCenteredRef} />
        <LocateButton pos={position} />
        {!tooFarOut && <NetworkObjectLayer objects={visible} onObjectClick={onObjectClick} />}
      </MapContainer>

      {/* Status-Badge oben links */}
      <div className="pointer-events-none absolute left-3 top-3 z-[1000] rounded-full bg-white/95 px-3 py-1.5 text-xs shadow">
        {tooFarOut ? (
          <span className="flex items-center gap-1.5 text-slate-600">
            🔍 Reinzoomen, um Objekte zu sehen
          </span>
        ) : (
          <span className="font-medium text-slate-700">{visible.length} Objekt{visible.length === 1 ? '' : 'e'} im Ausschnitt</span>
        )}
      </div>

      {/* GPS-Suche-Hinweis */}
      {!position && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-white/95 px-3 py-1.5 text-xs text-slate-600 shadow flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" /> GPS wird gesucht …
        </div>
      )}
    </div>
  );
}
