/**
 * NetworkEditorMap
 *
 * Zwei Modi:
 *  'nodes'    – Netzknoten setzen, verschieben, löschen
 *  'segments' – Abschnitt zwischen zwei Knoten zeichnen (Zwischenpunkte optional)
 */
import { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Hand, MapPin, Edit3, Undo2, Trash2, Ruler, Layers } from 'lucide-react';
import { lineLength, formatLength } from '@/lib/geoMeasure';
import { MapLayerSwitcher } from './MapLayerSwitcher';
import { NetworkLayer } from './NetworkLayer';
import { NetworkAreaLayer } from './NetworkAreaLayer';
import { useMapLayers } from '@/hooks/useMapLayers';
import type { NetworkNode } from '@/hooks/useNetworkNodes';
import type { RoadSegment } from '@/hooks/useNetworkSegments';

// ── Icons ─────────────────────────────────────────────────────────────────────

function nodeBaseIcon(_name: string, highlight: 'none' | 'from' | 'to' | 'hover'): L.DivIcon {
  const colors = {
    none:  { bg: '#0ea5e9', border: 'white' },
    from:  { bg: '#10b981', border: 'white' },
    to:    { bg: '#ef4444', border: 'white' },
    hover: { bg: '#0284c7', border: '#bae6fd' },
  };
  const { bg, border } = colors[highlight];
  const size = highlight !== 'none' ? 28 : 22;
  const label = highlight === 'from' ? 'A' : highlight === 'to' ? 'B' : '';
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${bg};border:2.5px solid ${border};
      box-shadow:0 2px 6px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
      color:white;font-size:${label ? 11 : 8}px;font-weight:bold;font-family:sans-serif;
    ">${label || '<div style="width:7px;height:7px;background:white;border-radius:50%"></div>'}</div>`,
  });
}

const vertexIcon = L.divIcon({
  className: '',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
  html: `<div style="width:12px;height:12px;border-radius:50%;background:#ea580c;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function ModeBinder({ active }: { active: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (active) {
      map.dragging.disable(); map.scrollWheelZoom.disable();
      map.doubleClickZoom.disable(); map.touchZoom.disable();
      map.boxZoom.disable(); map.keyboard.disable();
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.dragging.enable(); map.scrollWheelZoom.enable();
      map.doubleClickZoom.enable(); map.touchZoom.enable();
      map.boxZoom.enable(); map.keyboard.enable();
      map.getContainer().style.cursor = '';
    }
  }, [map, active]);
  return null;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function DraggableNodeMarker({
  node, highlight, onDrag, onSelect,
}: {
  node: NetworkNode;
  highlight: 'none' | 'from' | 'to' | 'hover';
  onDrag: (id: string, lat: number, lng: number) => void;
  onSelect: (node: NetworkNode) => void;
}) {
  const ref = useRef<L.Marker>(null);
  return (
    <Marker
      position={[node.lat, node.lng]}
      icon={nodeBaseIcon(node.name, highlight)}
      draggable
      ref={ref}
      eventHandlers={{
        dragend: () => {
          const m = ref.current;
          if (m) { const { lat, lng } = m.getLatLng(); onDrag(node.id, lat, lng); }
        },
        click: () => onSelect(node),
      }}
      zIndexOffset={highlight !== 'none' ? 200 : 100}
    >
      <Tooltip direction="top" offset={[0, -12]} permanent={false}>
        <span className="font-mono text-xs">{node.name}</span>
      </Tooltip>
    </Marker>
  );
}

function DraggableVertex({
  pos, index, onDrag, onRemove,
}: { pos: [number, number]; index: number; onDrag: (i: number, lat: number, lng: number) => void; onRemove: (i: number) => void }) {
  const ref = useRef<L.Marker>(null);
  return (
    <Marker position={pos} icon={vertexIcon} draggable ref={ref}
      eventHandlers={{
        dragend: () => { const m = ref.current; if (m) { const { lat, lng } = m.getLatLng(); onDrag(index, lat, lng); } },
        dblclick: () => onRemove(index),
      }}
    />
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export type EditorMode = 'nodes' | 'segments';

interface Props {
  center: [number, number];
  zoom?: number;
  mode: EditorMode;
  nodes: NetworkNode[];
  segments: RoadSegment[];

  // Knoten-Modus
  onAddNode: (lat: number, lng: number) => void;        // Klick auf leere Karte
  onMoveNode: (id: string, lat: number, lng: number) => void;
  onSelectNode: (node: NetworkNode | null) => void;
  selectedNodeId?: string | null;

  // Abschnitt-Modus
  fromNodeId?: string | null;
  toNodeId?: string | null;
  onNodeClickForSegment: (node: NetworkNode) => void;   // A dann B
  intermediatePoints: number[][];                        // [lng,lat][]
  onIntermediateChange: (pts: number[][]) => void;

  selectedSegmentId?: string | null;
  onSegmentClick?: (id: string) => void;
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export function NetworkEditorMap({
  center, zoom = 14, mode, nodes, segments,
  onAddNode, onMoveNode, onSelectNode, selectedNodeId,
  fromNodeId, toNodeId, onNodeClickForSegment,
  intermediatePoints, onIntermediateChange,
  selectedSegmentId, onSegmentClick,
}: Props) {
  const [drawActive, setDrawActive] = useState(false);
  const [showNetwork, setShowNetwork] = useState(true);
  const { data: layers } = useMapLayers();

  // Im Knoten-Modus: addNode-Modus togglebar
  // Im Abschnitt-Modus: drawActive = automatisch wenn fromNode gesetzt und toNode noch nicht
  const isDrawing = mode === 'nodes'
    ? drawActive
    : (mode === 'segments' && !!fromNodeId && !toNodeId) || (mode === 'segments' && drawActive);

  function handleMapClick(lat: number, lng: number) {
    if (mode === 'nodes' && drawActive) {
      onAddNode(lat, lng);
    } else if (mode === 'segments' && drawActive && fromNodeId) {
      // Zwischenpunkt hinzufügen
      onIntermediateChange([...intermediatePoints, [lng, lat]]);
    }
  }

  function handleNodeClick(node: NetworkNode) {
    if (mode === 'nodes') {
      onSelectNode(node);
    } else {
      onNodeClickForSegment(node);
    }
  }

  function nodeHighlight(n: NetworkNode): 'none' | 'from' | 'to' | 'hover' {
    if (n.id === fromNodeId) return 'from';
    if (n.id === toNodeId)   return 'to';
    if (n.id === selectedNodeId && mode === 'nodes') return 'hover';
    return 'none';
  }

  // Gesamtlinie für Abschnitt-Modus
  const fromNode = nodes.find((n) => n.id === fromNodeId);
  const toNode   = nodes.find((n) => n.id === toNodeId);
  const segmentLineLatLng: [number, number][] = fromNode
    ? [
        [fromNode.lat, fromNode.lng],
        ...intermediatePoints.map(([lng, lat]) => [lat, lng] as [number, number]),
        ...(toNode ? [[toNode.lat, toNode.lng] as [number, number]] : []),
      ]
    : [];

  const totalPoints = fromNode
    ? 1 + intermediatePoints.length + (toNode ? 1 : 0)
    : 0;
  const allPts = fromNode
    ? [[fromNode.lng, fromNode.lat], ...intermediatePoints, ...(toNode ? [[toNode.lng, toNode.lat]] : [])]
    : [];

  return (
    <div className="relative h-full w-full">
      <MapContainer center={center} zoom={zoom} maxZoom={22} className="h-full w-full">
        <ModeBinder active={isDrawing} />
        <MapClickHandler onMapClick={handleMapClick} />
        <MapLayerSwitcher layers={layers} maxZoom={22} />
        {showNetwork && (
          <>
            <NetworkLayer segments={segments} onSegmentClick={onSegmentClick} selectedId={selectedSegmentId} />
            <NetworkAreaLayer />
          </>
        )}

        {/* Abschnitt-Linie im Abschnitt-Modus */}
        {segmentLineLatLng.length >= 2 && (
          <Polyline positions={segmentLineLatLng}
            pathOptions={{ color: '#ea580c', weight: 3, dashArray: toNode ? undefined : '6 4' }} />
        )}

        {/* Zwischenpunkte */}
        {intermediatePoints.map(([lng, lat], i) => (
          <DraggableVertex key={i} pos={[lat, lng]} index={i}
            onDrag={(idx, nlat, nlng) => {
              const next = [...intermediatePoints];
              next[idx] = [nlng, nlat];
              onIntermediateChange(next);
            }}
            onRemove={(idx) => onIntermediateChange(intermediatePoints.filter((_, j) => j !== idx))}
          />
        ))}

        {/* Alle Netzknoten */}
        {nodes.map((n) => (
          <DraggableNodeMarker
            key={n.id}
            node={n}
            highlight={nodeHighlight(n)}
            onDrag={onMoveNode}
            onSelect={handleNodeClick}
          />
        ))}
      </MapContainer>

      {/* ── Steuerleiste ── */}
      <div className="absolute left-2 top-2 z-[1000] flex flex-col gap-1 rounded-lg bg-white p-1 shadow">
        {mode === 'nodes' && (
          <>
            <button onClick={() => setDrawActive((v) => !v)}
              className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${drawActive ? 'bg-blue-600 text-white font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
              title="Klick auf Karte setzt neuen Knoten">
              <MapPin className="h-3.5 w-3.5" /> {drawActive ? 'Knoten setzen' : 'Knoten setzen'}
            </button>
            {drawActive && (
              <button onClick={() => { setDrawActive(false); onSelectNode(null); }}
                className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
                <Hand className="h-3.5 w-3.5" /> Verschieben
              </button>
            )}
          </>
        )}
        {mode === 'segments' && fromNodeId && !toNodeId && (
          <button onClick={() => setDrawActive((v) => !v)}
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${drawActive ? 'bg-orange-500 text-white font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
            title="Zwischenpunkte zeichnen">
            <Edit3 className="h-3.5 w-3.5" /> {drawActive ? 'Punkte zeichnen' : 'Zwischenpunkte'}
          </button>
        )}
        <hr className="my-0.5" />
        <button onClick={() => setShowNetwork((v) => !v)}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${showNetwork ? 'bg-sky-50 text-sky-700' : 'text-slate-400 hover:bg-slate-50'}`}>
          <Layers className="h-3.5 w-3.5" /> Netz
        </button>
      </div>

      {/* ── Aktionen (Segment-Modus) ── */}
      {mode === 'segments' && intermediatePoints.length > 0 && (
        <div className="absolute bottom-2 right-2 z-[1000] flex gap-1">
          <button onClick={() => onIntermediateChange(intermediatePoints.slice(0, -1))}
            className="rounded bg-white p-2 shadow" title="Letzten Zwischenpunkt entfernen">
            <Undo2 className="h-4 w-4" />
          </button>
          <button onClick={() => onIntermediateChange([])}
            className="rounded bg-white p-2 text-red-600 shadow" title="Alle Zwischenpunkte löschen">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Längenmessung ── */}
      {mode === 'segments' && allPts.length >= 2 && (
        <div className="absolute right-2 top-2 z-[1000] flex items-center gap-1.5 rounded bg-white/95 px-2.5 py-1.5 text-xs font-medium shadow">
          <Ruler className="h-3.5 w-3.5 text-orange-600" />
          <span className="text-slate-500">Länge:</span>
          <span className="font-semibold">{formatLength(lineLength(allPts))}</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500">{totalPoints} Pkt.</span>
        </div>
      )}

      {/* ── Hinweis ── */}
      <div className="absolute bottom-2 left-2 z-[1000] max-w-[55%] rounded bg-white/95 px-2 py-1 text-[11px] text-slate-600 shadow">
        {mode === 'nodes' && drawActive && (
          <><b>Knoten-Modus:</b> Karte klicken = neuen Knoten setzen. Knoten ziehen = verschieben.</>
        )}
        {mode === 'nodes' && !drawActive && (
          <><b>Knoten:</b> Anklicken = auswählen. Ziehen = verschieben. „Knoten setzen" zum Anlegen.</>
        )}
        {mode === 'segments' && !fromNodeId && (
          <><b>Abschnitt:</b> <span className="text-emerald-600">Grünen Knoten A</span> anklicken um zu starten.</>
        )}
        {mode === 'segments' && fromNodeId && !toNodeId && (
          <><b>Von {nodes.find(n => n.id === fromNodeId)?.name} →</b>{' '}
            Jetzt <span className="text-red-600">Ziel-Knoten B</span> anklicken.
            Optional „Zwischenpunkte" für Kurven.</>
        )}
        {mode === 'segments' && fromNodeId && toNodeId && (
          <><span className="text-emerald-600">A</span> → <span className="text-red-600">B</span> gewählt. Attribute links ausfüllen und speichern.</>
        )}
      </div>
    </div>
  );
}
