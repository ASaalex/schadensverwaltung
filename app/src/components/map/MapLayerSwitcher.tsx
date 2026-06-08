import { useState } from 'react';
import { TileLayer, WMSTileLayer } from 'react-leaflet';
import { Layers } from 'lucide-react';
import type { MapLayer } from '@/types/database';

export interface MapLayerSwitcherProps {
  layers?: MapLayer[];
  /** Hoch-Zoom-Grenze (Default 22 = bis zum maximalen Overzoom) */
  maxZoom?: number;
  /** UI-Switcher anzeigen (false bei sehr kleinen Karten / Print) */
  showSwitcher?: boolean;
  /** Kontrolliert: aktive Layer-ID von außen (z. B. gemeinsames Optionen-Panel) */
  activeId?: string | null;
  /** Kontrolliert: Änderung der aktiven Layer-ID melden */
  onActiveChange?: (id: string | null) => void;
}

/** WMS-URL-Template parsen: extrahiert base + Parameter wie layers/format/transparent */
function parseWmsUrl(template: string) {
  const [base, query = ''] = template.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  return {
    base,
    layers: params.layers ?? '',
    format: params.format ?? 'image/png',
    transparent: (params.transparent ?? 'true').toLowerCase() === 'true',
  };
}

/**
 * Rendert den aktiven Karten-Layer + (optional) einen Switcher in der Ecke.
 * Muss INNERHALB einer <MapContainer> verwendet werden.
 */
export function MapLayerSwitcher({
  layers,
  maxZoom = 22,
  showSwitcher = true,
  activeId: controlledId,
  onActiveChange,
}: MapLayerSwitcherProps) {
  const [internalId, setInternalId] = useState<string | null>(
    layers?.find((l) => l.is_default)?.id ?? layers?.[0]?.id ?? null,
  );
  const controlled = controlledId !== undefined;
  const activeId = controlled ? controlledId : internalId;
  const setActiveId = (id: string | null) => {
    if (controlled) onActiveChange?.(id);
    else setInternalId(id);
  };
  const active = layers?.find((l) => l.id === activeId) ?? null;

  const tileMaxNative = 19; // OSM/Tiles haben ~19 echte Zoom-Stufen, Rest = Overzoom

  return (
    <>
      {/* Layer-Rendering */}
      {(!active || active.type === 'xyz') && (
        <TileLayer
          attribution={
            active?.attribution ??
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende'
          }
          url={active?.url_template ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}
          maxNativeZoom={active?.max_zoom ?? tileMaxNative}
          maxZoom={maxZoom}
        />
      )}
      {active?.type === 'wms' && (() => {
        const parsed = parseWmsUrl(active.url_template);
        return (
          <WMSTileLayer
            key={active.id}
            url={parsed.base}
            layers={parsed.layers}
            format={parsed.format}
            transparent={parsed.transparent}
            attribution={active.attribution ?? ''}
            maxNativeZoom={active.max_zoom ?? tileMaxNative}
            maxZoom={maxZoom}
          />
        );
      })()}

      {/* Switcher-UI als HTML-Overlay (per absolute Position) — wird via Portal-Pattern aus Parent positioniert */}
      {showSwitcher && layers && layers.length > 1 && (
        <div className="leaflet-top leaflet-right" style={{ pointerEvents: 'auto' }}>
          <div className="leaflet-control leaflet-bar" style={{ background: 'white', padding: 0, marginRight: 10, marginTop: 10, borderRadius: 6, overflow: 'hidden' }}>
            <div className="flex items-center gap-1 border-b bg-slate-50 px-2 py-1 text-xs text-slate-500">
              <Layers className="h-3 w-3" />
              Karte
            </div>
            {layers.map((l) => (
              <button
                key={l.id}
                onClick={() => setActiveId(l.id)}
                className={`block w-full px-3 py-1.5 text-left text-xs ${
                  l.id === activeId ? 'bg-blue-50 font-medium text-blue-700' : 'hover:bg-slate-50'
                }`}
              >
                {l.id === activeId ? '●' : '○'} {l.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
