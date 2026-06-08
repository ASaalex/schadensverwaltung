import { useEffect, useState } from 'react';
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { MapLayerSwitcher } from './MapLayerSwitcher';
import { MapOptionsControl, type OverlayToggle } from './MapOptionsControl';
import { NetworkLayer } from './NetworkLayer';
import { NetworkAreaLayer } from './NetworkAreaLayer';
import { NetworkObjectVectorOverlay } from './NetworkObjectVectorOverlay';
import { useNetworkSegments } from '@/hooks/useNetworkSegments';
import type { DamageListItem } from '@/hooks/useDamageList';
import type { MapLayer } from '@/types/database';

const STATUS_COLORS: Record<string, string> = {
  neu:        '#3b82f6',
  geprueft:   '#6366f1',
  zugewiesen: '#8b5cf6',
  bearbeitung:'#f59e0b',
  erledigt:   '#10b981',
  abgelehnt:  '#94a3b8',
};

function buildIcon(color: string, selected: boolean): L.DivIcon {
  const w = selected ? 28 : 22;
  const h = selected ? 34 : 28;
  return L.divIcon({
    className: '',
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h],
    html: `<svg width="${w}" height="${h}" viewBox="0 0 22 28" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 0c-6 0-11 5-11 11 0 8 11 17 11 17s11-9 11-17c0-6-5-11-11-11z"
        fill="${color}" stroke="${selected ? '#1d4ed8' : 'white'}" stroke-width="${selected ? 2 : 1}"/>
      <circle cx="11" cy="11" r="4" fill="white"/>
    </svg>`,
  });
}

/** Wimpel-Cluster-Icon: runde Badge mit Dreieck-Zeiger nach unten */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createWimpelIcon(cluster: any): L.DivIcon {
  const count = cluster.getChildCount();
  const label = count >= 1000 ? `${Math.floor(count / 1000)}k` : String(count);
  // Größe und Farbe nach Anzahl
  const size  = count < 10  ? 36 : count < 100 ? 42 : count < 1000 ? 48 : 54;
  const color = count < 10  ? '#3b82f6'
              : count < 100 ? '#f59e0b'
              : count < 500 ? '#ef4444'
              : '#7c3aed';
  const total = size + 11; // Höhe inkl. Dreieck-Spitze
  const fontSize = count < 10 ? 14 : count < 100 ? 13 : count < 1000 ? 12 : 10;

  return L.divIcon({
    className: '',
    iconSize: [size, total],
    iconAnchor: [size / 2, total],
    html: `<div style="position:relative;width:${size}px;height:${total}px;">
      <!-- Kreis -->
      <div style="
        position:absolute;top:0;left:0;
        width:${size}px;height:${size}px;
        background:${color};
        border:2.5px solid white;
        border-radius:50%;
        box-shadow:0 2px 8px rgba(0,0,0,0.35);
        display:flex;align-items:center;justify-content:center;
        color:white;font-size:${fontSize}px;font-weight:700;
        font-family:-apple-system,sans-serif;
        line-height:1;
      ">${label}</div>
      <!-- Dreieck-Wimpel -->
      <div style="
        position:absolute;bottom:0;left:50%;transform:translateX(-50%);
        width:0;height:0;
        border-left:7px solid transparent;
        border-right:7px solid transparent;
        border-top:11px solid ${color};
        filter:drop-shadow(0 2px 2px rgba(0,0,0,0.2));
      "></div>
    </div>`,
  });
}

function FitBounds({ items }: { items: DamageListItem[] }) {
  const map = useMap();
  useEffect(() => {
    const pts = items
      .filter((d) => d.gps_lat != null && d.gps_lng != null)
      .map((d) => [d.gps_lat!, d.gps_lng!] as [number, number]);
    if (pts.length === 0) return;
    if (pts.length === 1) { map.setView(pts[0], 16); return; }
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
  }, [items, map]);
  return null;
}

function ViewTracker({ onChange }: { onChange: (b: L.LatLngBounds, z: number) => void }) {
  const map = useMapEvents({
    moveend: () => onChange(map.getBounds(), map.getZoom()),
    zoomend: () => onChange(map.getBounds(), map.getZoom()),
  });
  useEffect(() => {
    const t = setTimeout(() => onChange(map.getBounds(), map.getZoom()), 200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

interface Props {
  center: [number, number];
  items: DamageListItem[];
  selectedId?: string | null;
  onPinClick?: (id: string) => void;
  layers?: MapLayer[];
  className?: string;
  /** Auto-Fit auf items (Default true). Bei Viewport-Laden auf false. */
  autoFit?: boolean;
  /** Meldet Kartenausschnitt + Zoom (für serverseitiges Viewport-Laden) */
  onViewChange?: (bounds: L.LatLngBounds, zoom: number) => void;
  /** Welche Overlay-Schalter angeboten werden (Rollen-Filter). Default: alle. */
  allowOverlays?: { network?: boolean; objects?: boolean; damages?: boolean };
}

export function DamagesMap({
  center, items, selectedId, onPinClick, layers, className,
  autoFit = true, onViewChange, allowOverlays,
}: Props) {
  const { data: segments = [] } = useNetworkSegments();
  const [showNetwork, setShowNetwork] = useState(true);
  const [showObjects, setShowObjects] = useState(true);
  const [showDamages, setShowDamages] = useState(true);
  const [baseId, setBaseId] = useState<string | null>(layers?.find((l) => l.is_default)?.id ?? null);

  const allow = { network: true, objects: true, damages: true, ...allowOverlays };
  const withPos = showDamages ? items.filter((d) => d.gps_lat != null && d.gps_lng != null) : [];

  const overlays: OverlayToggle[] = [
    allow.network && { key: 'net', label: 'Netz', checked: showNetwork, onChange: setShowNetwork, color: '#0ea5e9' },
    allow.objects && { key: 'obj', label: 'Objekte', checked: showObjects, onChange: setShowObjects, color: '#6366f1' },
    allow.damages && { key: 'dmg', label: 'Schäden', checked: showDamages, onChange: setShowDamages, color: '#ef4444' },
  ].filter(Boolean) as OverlayToggle[];

  return (
    <div className={`relative ${className ?? 'h-full w-full'}`}>
      <MapContainer center={center} zoom={13} maxZoom={22} scrollWheelZoom className="h-full w-full">
        {autoFit && <FitBounds items={items} />}
        {onViewChange && <ViewTracker onChange={onViewChange} />}
        <MapLayerSwitcher layers={layers} maxZoom={22} showSwitcher={false} activeId={baseId} onActiveChange={setBaseId} />
        {allow.network && showNetwork && <NetworkLayer segments={segments} />}
        {allow.network && showNetwork && <NetworkAreaLayer />}
        {allow.objects && showObjects && <NetworkObjectVectorOverlay />}

        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={50}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          zoomToBoundsOnClick
          iconCreateFunction={createWimpelIcon}
        >
          {withPos.map((d) => (
            <Marker
              key={d.id}
              position={[d.gps_lat!, d.gps_lng!]}
              icon={buildIcon(STATUS_COLORS[d.status] ?? '#94a3b8', d.id === selectedId)}
              eventHandlers={{ click: () => onPinClick?.(d.id) }}
            />
          ))}
        </MarkerClusterGroup>
      </MapContainer>

      {/* Karten-Optionen (ausklappbar): Hintergrund + Overlays */}
      <MapOptionsControl layers={layers} activeLayerId={baseId} onLayerChange={setBaseId} overlays={overlays} />

      {/* Status-Legende */}
      <div className="absolute bottom-2 left-2 z-[1000] flex flex-wrap gap-2 rounded bg-white/95 px-2 py-1 text-xs shadow">
        {Object.entries(STATUS_COLORS).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: c }} />
            <span className="text-slate-700">{k}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
