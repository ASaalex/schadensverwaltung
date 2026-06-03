import { useEffect, useRef, useState } from 'react';
import {
  MapContainer,
  Marker,
  Polyline,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import { Hand, Edit3, Undo2, Trash2, Ruler, Layers } from 'lucide-react';
import { lineLength, formatLength } from '@/lib/geoMeasure';
import { MapLayerSwitcher } from './MapLayerSwitcher';
import { NetworkLayer } from './NetworkLayer';
import { useMapLayers } from '@/hooks/useMapLayers';
import type { RoadSegment } from '@/hooks/useNetworkSegments';

// ── Node-Extraktion ───────────────────────────────────────────────────────────

/** Alle benannten Netzknoten aus bestehenden Segmenten ableiten. */
export function extractNodes(segments: RoadSegment[]): Map<string, [number, number]> {
  const nodes = new Map<string, [number, number]>();
  for (const seg of segments) {
    const coords = seg.geometry?.coordinates;
    if (!coords?.length) continue;
    nodes.set(seg.from_node, coords[0] as [number, number]);
    nodes.set(seg.to_node, coords[coords.length - 1] as [number, number]);
  }
  return nodes;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const nodeIcon = L.divIcon({
  className: '',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  html: `<div style="
    width:20px;height:20px;border-radius:50%;
    background:#0ea5e9;border:2.5px solid white;
    box-shadow:0 1px 4px rgba(0,0,0,0.35);
    display:flex;align-items:center;justify-content:center;
  ">
    <div style="width:6px;height:6px;background:white;border-radius:50%"></div>
  </div>`,
});

const nodeIconHighlight = L.divIcon({
  className: '',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  html: `<div style="
    width:26px;height:26px;border-radius:50%;
    background:#0284c7;border:3px solid white;
    box-shadow:0 1px 6px rgba(0,0,0,0.45);
    display:flex;align-items:center;justify-content:center;
  ">
    <div style="width:7px;height:7px;background:white;border-radius:50%"></div>
  </div>`,
});

const vertexIcon = L.divIcon({
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#ea580c;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
});

const startIcon = L.divIcon({
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: `<div style="
    width:22px;height:22px;border-radius:50%;
    background:#10b981;border:2.5px solid white;
    box-shadow:0 1px 4px rgba(0,0,0,0.3);
    display:flex;align-items:center;justify-content:center;
    color:white;font-size:10px;font-weight:bold;font-family:sans-serif;
  ">A</div>`,
});

const endIcon = L.divIcon({
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: `<div style="
    width:22px;height:22px;border-radius:50%;
    background:#ef4444;border:2.5px solid white;
    box-shadow:0 1px 4px rgba(0,0,0,0.3);
    display:flex;align-items:center;justify-content:center;
    color:white;font-size:10px;font-weight:bold;font-family:sans-serif;
  ">B</div>`,
});

// ── Inner Components ──────────────────────────────────────────────────────────

type DrawMode = 'draw' | 'pan';

function ModeBinder({ mode }: { mode: DrawMode }) {
  const map = useMap();
  useEffect(() => {
    if (mode === 'draw') {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
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

function MapClickHandler({ mode, onAdd }: { mode: DrawMode; onAdd: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (mode === 'draw') onAdd(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function DraggableVertex({
  position,
  draggable,
  onDragEnd,
  onDblClick,
  icon,
}: {
  position: [number, number];
  draggable: boolean;
  onDragEnd: (lat: number, lng: number) => void;
  onDblClick: () => void;
  icon: L.DivIcon;
}) {
  const ref = useRef<L.Marker>(null);
  return (
    <Marker
      position={position}
      icon={icon}
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

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  center: [number, number];
  zoom?: number;
  /** Linienpunkte [lng, lat][] (GeoJSON) */
  points: number[][];
  onChange: (points: number[][]) => void;
  /** Bestehende Segmente für Knotenextraktion */
  segments: RoadSegment[];
  /** Callback wenn ein Knoten angeklickt wird (name, coords, isStart) */
  onNodeSnap: (name: string, coords: [number, number], isStart: boolean) => void;
}

export function NetworkMapEditor({ center, zoom = 14, points, onChange, segments, onNodeSnap }: Props) {
  const [mode, setMode] = useState<DrawMode>('draw');
  const [showNetwork, setShowNetwork] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const { data: layers } = useMapLayers();

  const nodes = extractNodes(segments);

  // GeoJSON [lng,lat] → Leaflet [lat,lng]
  const latLngPoints = points.map(([lng, lat]) => [lat, lng] as [number, number]);

  function addPoint(lat: number, lng: number) {
    onChange([...points, [lng, lat]]);
  }

  function updatePoint(i: number, lat: number, lng: number) {
    const next = [...points];
    next[i] = [lng, lat];
    onChange(next);
  }

  function removePoint(i: number) {
    onChange(points.filter((_, idx) => idx !== i));
  }

  function handleNodeClick(name: string, coords: [number, number]) {
    if (mode !== 'draw') return;
    const isStart = points.length === 0;
    // Koordinaten in GeoJSON-Reihenfolge [lng, lat]
    onChange([...points, coords]);
    onNodeSnap(name, coords, isStart);
  }

  // Erster und letzter Punkt bekommen spezielle Icons
  function iconForVertex(i: number): L.DivIcon {
    if (i === 0) return startIcon;
    if (i === points.length - 1 && points.length > 1) return endIcon;
    return vertexIcon;
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer center={center} zoom={zoom} maxZoom={22} className="h-full w-full">
        <ModeBinder mode={mode} />
        <MapClickHandler mode={mode} onAdd={addPoint} />
        <MapLayerSwitcher layers={layers} maxZoom={22} />

        {/* Netz-Overlay */}
        {showNetwork && <NetworkLayer segments={segments} />}

        {/* Bestehende Netzknoten als anklickbare Marker */}
        {Array.from(nodes.entries()).map(([name, coords]) => (
          <Marker
            key={name}
            position={[coords[1], coords[0]]}
            icon={hoveredNode === name ? nodeIconHighlight : nodeIcon}
            zIndexOffset={100}
            eventHandlers={{
              click: () => handleNodeClick(name, coords),
              mouseover: () => setHoveredNode(name),
              mouseout: () => setHoveredNode(null),
            }}
          >
            <Tooltip permanent={false} direction="top" offset={[0, -12]}>
              <span className="font-mono text-xs">{name}</span>
            </Tooltip>
          </Marker>
        ))}

        {/* Gezeichnete Linie */}
        {latLngPoints.length >= 2 && (
          <Polyline positions={latLngPoints} pathOptions={{ color: '#ea580c', weight: 3 }} />
        )}

        {/* Vertex-Marker (draggable) */}
        {latLngPoints.map((pos, i) => (
          <DraggableVertex
            key={i}
            position={pos}
            draggable={mode === 'draw'}
            icon={iconForVertex(i)}
            onDragEnd={(lat, lng) => updatePoint(i, lat, lng)}
            onDblClick={() => removePoint(i)}
          />
        ))}
      </MapContainer>

      {/* ── Modus-Steuerung ── */}
      <div className="absolute left-2 top-2 z-[1000] flex flex-col gap-1 rounded-lg bg-white p-1 shadow">
        <button
          onClick={() => setMode('draw')}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${
            mode === 'draw' ? 'bg-orange-500 text-white font-medium' : 'text-slate-600 hover:bg-slate-50'
          }`}
          title="Zeichnen-Modus: Klick fügt Punkt hinzu. Klick auf Knoten → snap."
        >
          <Edit3 className="h-3.5 w-3.5" /> Zeichnen
        </button>
        <button
          onClick={() => setMode('pan')}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${
            mode === 'pan' ? 'bg-blue-600 text-white font-medium' : 'text-slate-600 hover:bg-slate-50'
          }`}
          title="Karte verschieben"
        >
          <Hand className="h-3.5 w-3.5" /> Verschieben
        </button>
        <hr className="my-0.5" />
        <button
          onClick={() => setShowNetwork((v) => !v)}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${
            showNetwork ? 'bg-sky-50 text-sky-700 font-medium' : 'text-slate-400 hover:bg-slate-50'
          }`}
          title="Vorhandenes Netz ein-/ausblenden"
        >
          <Layers className="h-3.5 w-3.5" />
          {showNetwork ? 'Netz sichtbar' : 'Netz ausgeblendet'}
        </button>
      </div>

      {/* ── Aktionen ── */}
      <div className="absolute bottom-2 right-2 z-[1000] flex gap-1">
        <button
          onClick={() => points.length > 0 && onChange(points.slice(0, -1))}
          disabled={points.length === 0}
          className="rounded bg-white p-2 shadow disabled:opacity-50"
          title="Letzten Punkt entfernen"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={() => onChange([])}
          disabled={points.length === 0}
          className="rounded bg-white p-2 text-red-600 shadow disabled:opacity-50"
          title="Alle Punkte löschen"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* ── Längen-Anzeige ── */}
      {points.length >= 2 && (
        <div className="absolute right-2 top-2 z-[1000] flex items-center gap-1.5 rounded bg-white/95 px-2.5 py-1.5 text-xs font-medium shadow">
          <Ruler className="h-3.5 w-3.5 text-orange-600" />
          <span className="text-slate-500">Länge:</span>
          <span className="font-semibold">{formatLength(lineLength(points))}</span>
        </div>
      )}

      {/* ── Hinweistext ── */}
      <div className="absolute bottom-2 left-2 z-[1000] max-w-[55%] rounded bg-white/95 px-2 py-1 text-[11px] text-slate-600 shadow">
        {mode === 'draw' ? (
          <>
            <b>Zeichnen:</b> Karte klicken → Punkt.{' '}
            <span className="text-sky-600">Blauer Kreis klicken → Knoten-Snap.</span>{' '}
            Doppelklick auf Punkt → löschen.
          </>
        ) : (
          <><b>Verschieben:</b> Wechsle zu „Zeichnen" um Punkte zu setzen.</>
        )}
      </div>
    </div>
  );
}
