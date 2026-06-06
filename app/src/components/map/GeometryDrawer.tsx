import { useEffect, useRef, useState } from 'react';
import {
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import { Hand, Edit3, Undo2, Trash2, Ruler } from 'lucide-react';
import { lineLength, polygonArea, formatLength, formatArea } from '@/lib/geoMeasure';
import { MapLayerSwitcher } from './MapLayerSwitcher';
import { useMapLayers } from '@/hooks/useMapLayers';
// Default-Marker-Icons werden zentral in src/lib/leafletIcons.ts gesetzt

// Kleiner farbiger Marker für Eckpunkte (im Zeichenmodus draggable)
const vertexIcon = L.divIcon({
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#ea580c;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
});

type Mode = 'pan' | 'draw';

interface Props {
  center: [number, number];
  zoom?: number;
  type: 'line' | 'polygon';
  /** Punkte als [lng, lat][] (GeoJSON-Konvention) */
  points: number[][];
  onChange: (points: number[][]) => void;
  /** Position-Pin (aus Schritt 1) als nicht-bearbeitbarer Anker im Hintergrund */
  anchorPoint?: [number, number] | null;
}

/** Behebt graue/leere Karte in Flex-Layouts (Höhe beim Mount unklar). */
function InvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    const t1 = setTimeout(fix, 100);
    const t2 = setTimeout(fix, 400);
    window.addEventListener('resize', fix);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener('resize', fix); };
  }, [map]);
  return null;
}

/** Synct die Leaflet-Map-Interaktionen mit dem aktuellen Modus. */
function ModeBinder({ mode }: { mode: Mode }) {
  const map = useMap();
  useEffect(() => {
    if (mode === 'draw') {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
      // Cursor optisch zum Zeichnen
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.doubleClickZoom.enable();
      map.touchZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
      map.getContainer().style.cursor = '';
    }
  }, [map, mode]);
  return null;
}

function ClickAddPoint({
  mode,
  onAdd,
}: {
  mode: Mode;
  onAdd: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (mode === 'draw') onAdd(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Standard-Pin für die Position aus Schritt 1 (semi-transparent, deutlich vom Vertex-Marker abgehoben)
const anchorIcon = L.divIcon({
  className: '',
  iconSize: [22, 28],
  iconAnchor: [11, 28],
  html: `<svg width="22" height="28" viewBox="0 0 22 28" xmlns="http://www.w3.org/2000/svg" style="opacity:0.85;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))">
    <path d="M11 0c-6 0-11 5-11 11 0 8 11 17 11 17s11-9 11-17c0-6-5-11-11-11z" fill="#3b82f6" stroke="white" stroke-width="1.5"/>
    <circle cx="11" cy="11" r="3.5" fill="white"/>
  </svg>`,
});

export function GeometryDrawer({ center, zoom = 17, type, points, onChange, anchorPoint }: Props) {
  const [mode, setMode] = useState<Mode>('draw');
  const { data: layers } = useMapLayers();

  // GeoJSON [lng, lat] → Leaflet [lat, lng]
  const latLngPoints = points.map(([lng, lat]) => [lat, lng] as [number, number]);

  function addPoint(lat: number, lng: number) {
    onChange([...points, [lng, lat]]);
  }

  function updatePoint(index: number, lat: number, lng: number) {
    const next = [...points];
    next[index] = [lng, lat];
    onChange(next);
  }

  function removePoint(index: number) {
    const next = points.filter((_, i) => i !== index);
    onChange(next);
  }

  function undoLast() {
    if (points.length === 0) return;
    onChange(points.slice(0, -1));
  }

  function clear() {
    onChange([]);
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer center={center} zoom={zoom} maxZoom={22} className="h-full w-full">
        <InvalidateOnMount />
        <ModeBinder mode={mode} />
        <ClickAddPoint mode={mode} onAdd={addPoint} />
        <MapLayerSwitcher layers={layers} maxZoom={22} />

        {/* Anker (Position aus Schritt 1) — wird mit angezeigt, ist aber nicht editierbar */}
        {anchorPoint && (
          <Marker position={anchorPoint} icon={anchorIcon} interactive={false} />
        )}

        {/* Eckpunkt-Marker (im Zeichnen-Modus draggable) */}
        {latLngPoints.map((pos, i) => (
          <DraggableVertex
            key={i}
            position={pos}
            draggable={mode === 'draw'}
            onDragEnd={(lat, lng) => updatePoint(i, lat, lng)}
            onDblClick={() => removePoint(i)}
          />
        ))}

        {/* Linie oder Fläche zeichnen */}
        {type === 'line' && latLngPoints.length >= 2 && (
          <Polyline positions={latLngPoints} pathOptions={{ color: '#ea580c', weight: 3 }} />
        )}
        {type === 'polygon' && latLngPoints.length >= 3 && (
          <Polygon
            positions={latLngPoints}
            pathOptions={{ color: '#ea580c', weight: 2, fillOpacity: 0.25 }}
          />
        )}
      </MapContainer>

      {/* Modus-Anzeige oben links */}
      <div className="absolute left-2 top-2 z-[1000] flex flex-col gap-1 rounded-lg bg-white p-1 shadow">
        <button
          onClick={() => setMode('draw')}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${
            mode === 'draw' ? 'bg-orange-500 text-white font-medium' : 'text-slate-600 hover:bg-slate-50'
          }`}
          title="Zeichnen-Modus — Klick auf Karte fügt Punkt hinzu, Punkte sind verschiebbar"
        >
          <Edit3 className="h-3.5 w-3.5" />
          Zeichnen
        </button>
        <button
          onClick={() => setMode('pan')}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${
            mode === 'pan' ? 'bg-blue-600 text-white font-medium' : 'text-slate-600 hover:bg-slate-50'
          }`}
          title="Karte verschieben & zoomen"
        >
          <Hand className="h-3.5 w-3.5" />
          Verschieben
        </button>
      </div>

      {/* Aktionen unten rechts */}
      <div className="absolute bottom-2 right-2 z-[1000] flex gap-1">
        <button
          onClick={undoLast}
          disabled={points.length === 0}
          className="rounded bg-white p-2 shadow disabled:opacity-50"
          title="Letzten Punkt entfernen"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={clear}
          disabled={points.length === 0}
          className="rounded bg-white p-2 text-red-600 shadow disabled:opacity-50"
          title="Alle Punkte löschen"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Mess-Anzeige oben rechts */}
      {points.length >= 2 && (
        <div className="absolute right-2 top-2 z-[1000] flex items-center gap-1.5 rounded bg-white/95 px-2.5 py-1.5 text-xs font-medium shadow">
          <Ruler className="h-3.5 w-3.5 text-orange-600" />
          {type === 'polygon' && points.length >= 3 ? (
            <>
              <span className="text-slate-500">Fläche:</span>
              <span className="font-semibold">{formatArea(polygonArea(points))}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500">Umfang:</span>
              <span>{formatLength(lineLength([...points, points[0]]))}</span>
            </>
          ) : (
            <>
              <span className="text-slate-500">Länge:</span>
              <span className="font-semibold">{formatLength(lineLength(points))}</span>
            </>
          )}
        </div>
      )}

      {/* Hinweistext unten links */}
      <div className="absolute bottom-2 left-2 z-[1000] max-w-[60%] rounded bg-white/95 px-2 py-1 text-[11px] text-slate-600 shadow">
        {mode === 'draw' ? (
          <>
            <strong>Zeichnen aktiv:</strong> Tippe Karte → Punkt setzen.
            Punkt ziehen → verschieben. Doppelklick → Punkt löschen.
          </>
        ) : (
          <>
            <strong>Verschiebe-Modus:</strong> Karte ist beweglich. Wechsle zu "Zeichnen" um Punkte zu setzen.
          </>
        )}
      </div>
    </div>
  );
}

function DraggableVertex({
  position,
  draggable,
  onDragEnd,
  onDblClick,
}: {
  position: [number, number];
  draggable: boolean;
  onDragEnd: (lat: number, lng: number) => void;
  onDblClick: () => void;
}) {
  const ref = useRef<L.Marker>(null);
  return (
    <Marker
      position={position}
      icon={vertexIcon}
      draggable={draggable}
      ref={ref}
      eventHandlers={{
        dragend: () => {
          const m = ref.current;
          if (m) {
            const { lat, lng } = m.getLatLng();
            onDragEnd(lat, lng);
          }
        },
        dblclick: () => onDblClick(),
      }}
    />
  );
}
