import { useEffect, useState } from 'react';
import { MapContainer, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { MapLayerSwitcher } from './MapLayerSwitcher';
import { MapOptionsControl, type OverlayToggle } from './MapOptionsControl';
import { NetworkLayer } from './NetworkLayer';
import { NetworkAreaLayer } from './NetworkAreaLayer';
import { NetworkObjectViewportLayer } from './NetworkObjectViewportLayer';
import { NetworkDueLayer } from './NetworkDueLayer';
import { ObjectDueLayer } from './ObjectDueLayer';
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

function buildIcon(color: string, selected: boolean, bundled: boolean): L.DivIcon {
  const w = selected || bundled ? 28 : 22;
  const h = selected || bundled ? 34 : 28;
  // Gebündelte Pins: grüner, dicker Rand als Auswahl-Feedback auf der Karte
  const stroke = bundled ? '#16a34a' : selected ? '#1d4ed8' : 'white';
  const strokeWidth = bundled ? 3 : selected ? 2 : 1;
  return L.divIcon({
    className: '',
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h],
    html: `<svg width="${w}" height="${h}" viewBox="0 0 22 28" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 0c-6 0-11 5-11 11 0 8 11 17 11 17s11-9 11-17c0-6-5-11-11-11z"
        fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
      <circle cx="11" cy="11" r="4" fill="white"/>
      ${bundled ? '<circle cx="11" cy="11" r="2" fill="#16a34a"/>' : ''}
    </svg>`,
  });
}

const PRIO_LABEL: Record<string, string> = {
  niedrig: 'niedrig', normal: 'normal', hoch: 'hoch', dringend: 'dringend',
};

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
  /** Hover/Klick-Auswahl auf der Karte → in Tabelle selektieren */
  onPinSelect?: (id: string) => void;
  /** Rechtsklick auf einen Pin → Schaden öffnen */
  onPinOpen?: (id: string) => void;
  /** IDs der für einen Auftrag gebündelten Schäden (grün markiert) */
  bundledIds?: Set<string>;
  layers?: MapLayer[];
  className?: string;
  /** Auto-Fit auf items (Default true). Bei Viewport-Laden auf false. */
  autoFit?: boolean;
  /** Meldet Kartenausschnitt + Zoom (für serverseitiges Viewport-Laden) */
  onViewChange?: (bounds: L.LatLngBounds, zoom: number) => void;
  /** Welche Overlay-Schalter angeboten werden (Rollen-Filter). Default: alle. */
  allowOverlays?: { network?: boolean; objects?: boolean; damages?: boolean; due?: boolean };
}

export function DamagesMap({
  center, items, selectedId, onPinSelect, onPinOpen, bundledIds, layers, className,
  autoFit = true, onViewChange, allowOverlays,
}: Props) {
  const { data: segments = [] } = useNetworkSegments();
  const [showNetwork, setShowNetwork] = useState(true);
  const [showObjects, setShowObjects] = useState(true);
  const [showDamages, setShowDamages] = useState(true);
  const [showDue, setShowDue] = useState(false);
  const [baseId, setBaseId] = useState<string | null>(layers?.find((l) => l.is_default)?.id ?? null);

  const allow = { network: true, objects: true, damages: true, due: true, ...allowOverlays };
  const withPos = showDamages ? items.filter((d) => d.gps_lat != null && d.gps_lng != null) : [];

  const overlays: OverlayToggle[] = [
    allow.network && { key: 'net', label: 'Netz', checked: showNetwork, onChange: setShowNetwork, color: '#0ea5e9' },
    allow.due && { key: 'due', label: 'Fälligkeit', checked: showDue, onChange: setShowDue, color: '#f59e0b' },
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
        {allow.due && showDue && <NetworkDueLayer segments={segments} />}
        {allow.due && showDue && <ObjectDueLayer />}
        {allow.objects && showObjects && <NetworkObjectViewportLayer />}

        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={50}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          zoomToBoundsOnClick
          iconCreateFunction={createWimpelIcon}
        >
          {withPos.map((d) => {
            const bundled = bundledIds?.has(d.id) ?? false;
            const addr = [d.address_street, d.address_house_number].filter(Boolean).join(' ');
            const addrLine = [addr, [d.address_postal_code, d.address_city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
            return (
              <Marker
                key={d.id}
                position={[d.gps_lat!, d.gps_lng!]}
                icon={buildIcon(STATUS_COLORS[d.status] ?? '#94a3b8', d.id === selectedId, bundled)}
                eventHandlers={{
                  click: () => onPinSelect?.(d.id),
                  contextmenu: (e) => { e.originalEvent.preventDefault(); onPinOpen?.(d.id); },
                }}
              >
                {/* Hover-Infobox statt sofortiger Navigation */}
                <Tooltip direction="top" offset={[0, -28]} opacity={1}>
                  <div className="min-w-[160px] space-y-0.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-slate-500">{d.code}</span>
                      <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: (STATUS_COLORS[d.status] ?? '#94a3b8') + '22', color: STATUS_COLORS[d.status] ?? '#64748b' }}>{d.status}</span>
                    </div>
                    <div className="font-semibold text-slate-800">{d.category_name ?? 'Schaden'}</div>
                    {addrLine && <div className="text-slate-500">{addrLine}</div>}
                    <div className="text-slate-500">Priorität: {PRIO_LABEL[d.priority] ?? d.priority}</div>
                    {d.description && <div className="max-w-[200px] truncate text-slate-400">{d.description}</div>}
                    <div className="pt-0.5 text-[10px] text-blue-600">{bundled ? '✓ ausgewählt – Klick entfernt' : 'Klick: auswählen · Rechtsklick: öffnen'}</div>
                  </div>
                </Tooltip>
              </Marker>
            );
          })}
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
