import { useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer, WMSTileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Layers } from 'lucide-react';
import type { DamageListItem } from '@/hooks/useDamageList';
import type { MapLayer } from '@/types/database';

const STATUS_COLORS: Record<string, string> = {
  neu: '#3b82f6',
  geprueft: '#6366f1',
  zugewiesen: '#8b5cf6',
  bearbeitung: '#f59e0b',
  erledigt: '#10b981',
  abgelehnt: '#94a3b8',
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

function parseWmsUrl(template: string) {
  const [base, query = ''] = template.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  return {
    base,
    layers: params.layers,
    format: params.format ?? 'image/png',
    transparent: (params.transparent ?? 'true').toLowerCase() === 'true',
  };
}

function FitBounds({ items }: { items: DamageListItem[] }) {
  const map = useMap();
  useEffect(() => {
    const pts = items
      .filter((d) => d.gps_lat != null && d.gps_lng != null)
      .map((d) => [d.gps_lat!, d.gps_lng!] as [number, number]);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView(pts[0], 16);
      return;
    }
    const bounds = L.latLngBounds(pts);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [items, map]);
  return null;
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
  const [activeLayerId, setActiveLayerId] = useState<string | null>(
    layers?.find((l) => l.is_default)?.id ?? layers?.[0]?.id ?? null,
  );
  const activeLayer = layers?.find((l) => l.id === activeLayerId) ?? null;

  return (
    <div className={`relative ${className ?? 'h-full w-full'}`}>
      <MapContainer center={center} zoom={13} maxZoom={22} scrollWheelZoom className="h-full w-full">
        <FitBounds items={items} />

        {/* Aktiver Layer: XYZ oder WMS */}
        {(!activeLayer || activeLayer.type === 'xyz') && (
          <TileLayer
            attribution={
              activeLayer?.attribution ??
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende'
            }
            url={activeLayer?.url_template ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}
            maxNativeZoom={19}
            maxZoom={22}
          />
        )}
        {activeLayer?.type === 'wms' && (() => {
          const parsed = parseWmsUrl(activeLayer.url_template);
          return (
            <WMSTileLayer
              key={activeLayer.id}
              url={parsed.base}
              layers={parsed.layers ?? ''}
              format={parsed.format ?? 'image/png'}
              transparent={parsed.transparent ?? true}
              attribution={activeLayer.attribution ?? ''}
            />
          );
        })()}

        {items
          .filter((d) => d.gps_lat != null && d.gps_lng != null)
          .map((d) => (
            <Marker
              key={d.id}
              position={[d.gps_lat!, d.gps_lng!]}
              icon={buildIcon(STATUS_COLORS[d.status] ?? '#94a3b8', d.id === selectedId)}
              eventHandlers={{
                click: () => onPinClick?.(d.id),
              }}
            />
          ))}
      </MapContainer>

      {/* Layer-Switcher */}
      {layers && layers.length > 1 && (
        <div className="absolute right-2 top-2 z-[1000] rounded bg-white shadow">
          <div className="flex items-center gap-1 border-b px-2 py-1 text-xs text-slate-500">
            <Layers className="h-3 w-3" />
            Karte
          </div>
          {layers.map((l) => (
            <button
              key={l.id}
              onClick={() => setActiveLayerId(l.id)}
              className={`block w-full px-3 py-1.5 text-left text-xs ${
                l.id === activeLayerId ? 'bg-blue-50 font-medium text-blue-700' : 'hover:bg-slate-50'
              }`}
            >
              {l.id === activeLayerId ? '●' : '○'} {l.name}
            </button>
          ))}
        </div>
      )}

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
