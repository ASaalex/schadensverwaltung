/**
 * Ausklappbares Karten-Optionen-Panel (Leaflet) — Hintergrundkarte + Overlays.
 * Als absolut positioniertes Overlay im relativen Karten-Container nutzen.
 */
import { useState } from 'react';
import { Layers as LayersIcon, ChevronDown, ChevronUp } from 'lucide-react';
import type { MapLayer } from '@/types/database';

export interface OverlayToggle {
  key: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  color?: string;
}

interface Props {
  layers?: MapLayer[];
  activeLayerId: string | null;
  onLayerChange: (id: string | null) => void;
  overlays?: OverlayToggle[];
}

export function MapOptionsControl({ layers, activeLayerId, onLayerChange, overlays = [] }: Props) {
  const [open, setOpen] = useState(false);
  const hasLayers = (layers?.length ?? 0) > 0;

  return (
    <div className="absolute right-2 top-2 z-[1000] w-44 overflow-hidden rounded-lg bg-white/95 shadow-lg">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-slate-600"
      >
        <span className="flex items-center gap-1.5"><LayersIcon className="h-3.5 w-3.5" /> Kartenoptionen</span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="border-t">
          {/* Hintergrundkarte */}
          {hasLayers && (
            <div className="px-2 py-1.5">
              <div className="px-1 pb-1 text-[10px] uppercase tracking-wider text-slate-400">Hintergrund</div>
              {layers!.map((l) => (
                <button key={l.id} onClick={() => onLayerChange(l.id)}
                  className={`block w-full rounded px-2 py-1 text-left text-xs ${l.id === activeLayerId ? 'bg-blue-50 font-medium text-blue-700' : 'hover:bg-slate-50'}`}>
                  {l.id === activeLayerId ? '●' : '○'} {l.name}
                </button>
              ))}
            </div>
          )}

          {/* Overlays */}
          {overlays.length > 0 && (
            <div className={`px-2 py-1.5 ${hasLayers ? 'border-t' : ''}`}>
              <div className="px-1 pb-1 text-[10px] uppercase tracking-wider text-slate-400">Anzeigen</div>
              {overlays.map((o) => (
                <label key={o.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-slate-50">
                  <input type="checkbox" checked={o.checked} onChange={(e) => o.onChange(e.target.checked)} className="h-3.5 w-3.5" />
                  {o.color && <span className="h-2 w-2 rounded-full" style={{ background: o.color }} />}
                  {o.label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
