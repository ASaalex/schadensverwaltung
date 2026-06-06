import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type L from 'leaflet';
import { AppShell } from '@/components/layout/AppShell';
import { DISPO_SIDEBAR } from './sidebar';
import { useNetworkObjectTypes } from '@/hooks/useNetworkObjectTypes';
import { useObjectsInBounds, useObjectsSearch, type Bounds } from '@/hooks/useObjectsInBounds';
import { ObjectsMap } from '@/components/map/ObjectsMap';
import {
  Search, MapPin, Minus, Hexagon, Box, Filter as FilterIcon,
  ChevronLeft, ChevronRight, Loader2,
} from 'lucide-react';

const GEOM_ICON = { point: MapPin, line: Minus, polygon: Hexagon } as const;
/** Ab diesem Zoom lädt die Karte Objekte für den Ausschnitt */
const ZOOM_THRESHOLD = 13;

export function DispoObjectsPage() {
  const nav = useNavigate();
  const { query: typesQ } = useNetworkObjectTypes();
  const types = typesQ.data ?? [];

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Kartenausschnitt
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [zoom, setZoom] = useState(13);

  const typeIds = useMemo(() => Array.from(typeFilter), [typeFilter]);
  const searching = search.trim().length >= 2;
  const tooFarOut = zoom < ZOOM_THRESHOLD;

  // Datenquellen: Suche (überall) ODER Viewport
  const viewportQ = useObjectsInBounds(bounds, !searching && !tooFarOut, typeIds);
  const searchQ = useObjectsSearch(search, searching, typeIds);

  const objects = searching ? (searchQ.data ?? []) : (viewportQ.data ?? []);
  const isFetching = searching ? searchQ.isFetching : viewportQ.isFetching;

  const totalPages = Math.max(1, Math.ceil(objects.length / pageSize));
  const rows = objects.slice(page * pageSize, (page + 1) * pageSize);

  function toggleType(id: string) {
    setTypeFilter((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setPage(0);
  }

  function handleViewChange(b: L.LatLngBounds, z: number) {
    setZoom(z);
    setBounds({ minLng: b.getWest(), minLat: b.getSouth(), maxLng: b.getEast(), maxLat: b.getNorth() });
    setPage(0);
  }

  return (
    <AppShell title="Disposition" subtitle="Objekte" sidebar={DISPO_SIDEBAR}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Objekte</h2>
          <p className="text-sm text-muted-foreground">
            {searching
              ? <>{objects.length} Treffer für „{search.trim()}"</>
              : tooFarOut
                ? 'Reinzoomen, um Objekte zu laden'
                : <>{objects.length} Objekt{objects.length === 1 ? '' : 'e'} im Ausschnitt</>}
            {isFetching && <Loader2 className="ml-2 inline h-3 w-3 animate-spin text-blue-500" />}
          </p>
        </div>
      </div>

      {/* Filterleiste */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Objekte suchen (Name, Kennung) — durchsucht alle Objekte"
            className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {types.map((t) => {
            const active = typeFilter.has(t.id);
            return (
              <button key={t.id} onClick={() => toggleType(t.id)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'hover:bg-slate-50'}`}>
                <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                {t.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Linke Spalte: Tabelle */}
        <div className="space-y-3 lg:col-span-1">
          <div className="overflow-hidden rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Bezeichnung</th>
                  <th className="px-3 py-2 text-left">Typ</th>
                  <th className="px-3 py-2 text-left">Geom.</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isFetching && objects.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">Lade …</td></tr>
                )}
                {!isFetching && objects.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                    {searching ? 'Keine Treffer.' : tooFarOut ? 'Reinzoomen, um Objekte zu sehen.' : 'Keine Objekte im Ausschnitt.'}
                  </td></tr>
                )}
                {rows.map((o) => {
                  const gt = (o.type_geometry_type ?? 'point') as keyof typeof GEOM_ICON;
                  const Icon = GEOM_ICON[gt] ?? MapPin;
                  return (
                    <tr key={o.id}
                      onClick={() => nav(`/dispo/objects/${o.id}`)}
                      onMouseEnter={() => setSelectedId(o.id)}
                      className={`cursor-pointer hover:bg-slate-50 ${selectedId === o.id ? 'bg-blue-50/50' : ''}`}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{o.name ?? o.identifier ?? '—'}</div>
                        {o.identifier && o.name && (
                          <div className="font-mono text-xs text-muted-foreground">{o.identifier}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: o.type_color ?? '#6366f1' }} />
                          <span className="text-xs">{o.type_name ?? '—'}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-xl border bg-white px-4 py-2 text-sm">
              <span className="text-xs text-muted-foreground">
                {page * pageSize + 1}–{Math.min((page + 1) * pageSize, objects.length)} von {objects.length}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                  className="rounded border p-1 disabled:opacity-40 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
                <span className="text-xs">{page + 1} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  className="rounded border p-1 disabled:opacity-40 hover:bg-slate-50"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </div>

        {/* Rechte Spalte: Karte */}
        <div className="overflow-hidden rounded-xl border bg-white lg:col-span-2">
          <div className="flex items-center gap-1.5 border-b px-3 py-2 text-xs text-muted-foreground">
            <FilterIcon className="h-3 w-3" />
            {searching
              ? `${objects.length} Treffer (Karte zeigt Suchergebnisse)`
              : `${objects.length} Objekt${objects.length === 1 ? '' : 'e'} im Kartenausschnitt`}
          </div>
          <div className="h-[600px]">
            <ObjectsMap
              objects={objects}
              selectedId={selectedId}
              onObjectClick={(id) => nav(`/dispo/objects/${id}`)}
              onViewChange={searching ? undefined : handleViewChange}
              autoFit={searching}
              zoom={13}
            />
          </div>
          <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
            {searching
              ? 'Suche durchsucht alle Objekte. Leeren, um wieder den Kartenausschnitt zu laden.'
              : 'Karte verschieben/zoomen lädt die Objekte des sichtbaren Bereichs.'}
          </div>
        </div>
      </div>
      {types.length === 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Box className="h-3.5 w-3.5" /> Noch keine Objekttypen definiert.
        </p>
      )}
    </AppShell>
  );
}
