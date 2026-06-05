import { useEffect, useState } from 'react';
import { MapContainer, Marker, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { MapLayerSwitcher } from './MapLayerSwitcher';
import { NetworkLayer } from './NetworkLayer';
import { NetworkAreaLayer } from './NetworkAreaLayer';
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

/** Netz-Toggle-Button als Leaflet-Control */
function NetworkToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <div className="leaflet-top leaflet-left" style={{ pointerEvents: 'auto', marginTop: 80, marginLeft: 10 }}>
      <button
        onClick={onToggle}
        className="leaflet-control leaflet-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '4px 8px',
          background: show ? '#0ea5e9' : 'white',
          color: show ? 'white' : '#64748b',
          border: `1.5px solid ${show ? '#0284c7' : '#cbd5e1'}`,
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'sans-serif',
          cursor: 'pointer',
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          whiteSpace: 'nowrap',
        }}
        title="Straßennetz ein-/ausblenden"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M3 3l7 7m0 0l4-4 7 7M10 10l2 11"/>
        </svg>
        Netz
      </button>
    </div>
  );
}

interface Props {
  center: [number, number];
  items: DamageListItem[];
  selectedId?: string | null;
  onPinClick?: (id: string) => void;
  layers?: MapLayer[];
  className?: string;
}

export function DamagesMap({ center, items, selectedId, onPinClick, layers, className }: Props) {
  const { data: segments = [] } = useNetworkSegments();
  const [showNetwork, setShowNetwork] = useState(true);

  const withPos = items.filter((d) => d.gps_lat != null && d.gps_lng != null);

  return (
    <div className={`relative ${className ?? 'h-full w-full'}`}>
      <MapContainer center={center} zoom={13} maxZoom={22} scrollWheelZoom className="h-full w-full">
        <FitBounds items={items} />
        <MapLayerSwitcher layers={layers} maxZoom={22} />
        {showNetwork && <NetworkLayer segments={segments} />}
        {showNetwork && <NetworkAreaLayer />}
        <NetworkToggle show={showNetwork} onToggle={() => setShowNetwork((v) => !v)} />

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
