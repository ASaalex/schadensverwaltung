import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DISPO_SIDEBAR } from './sidebar';
import { useNetworkObjects } from '@/hooks/useNetworkObjects';
import { useNetworkObjectTypes } from '@/hooks/useNetworkObjectTypes';
import { ObjectsMap } from '@/components/map/ObjectsMap';
import {
  Search, MapPin, Minus, Hexagon, Box, Filter as FilterIcon,
  ChevronLeft, ChevronRight,
} from 'lucide-react';

const GEOM_ICON = { point: MapPin, line: Minus, polygon: Hexagon } as const;

export function DispoObjectsPage() {
  const nav = useNavigate();
  const { query } = useNetworkObjects();
  const { query: typesQ } = useNetworkObjectTypes();
  const objects = query.data ?? [];
  const types = typesQ.data ?? [];

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return objects.filter((o) => {
      if (typeFilter.size > 0 && !typeFilter.has(o.object_type_id)) return false;
      if (!q) return true;
      return [o.name, o.identifier, o.type_name].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [objects, search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice(page * pageSize, (page + 1) * pageSize);

  function toggleType(id: string) {
    setTypeFilter((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setPage(0);
  }

  return (
    <AppShell title="Disposition" subtitle="Objekte" sidebar={DISPO_SIDEBAR}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Objekte</h2>
          <p className="text-sm text-muted-foreground">
            {filtered.length} von {objects.length}
            {(search || typeFilter.size > 0) && <span className="ml-1 text-blue-600">· gefiltert</span>}
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
            placeholder="Suche nach Name, Kennung, Typ …"
            className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm"
          />
        </div>
        {/* Typ-Chips */}
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
                {query.isLoading && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">Lade …</td></tr>
                )}
                {!query.isLoading && filtered.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                    {objects.length === 0 ? 'Noch keine Objekte erfasst.' : 'Keine Treffer.'}
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-xl border bg-white px-4 py-2 text-sm">
              <span className="text-xs text-muted-foreground">
                {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} von {filtered.length}
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
            {filtered.length} Objekt{filtered.length === 1 ? '' : 'e'} sichtbar (synchron zur Liste)
          </div>
          <div className="h-[600px]">
            {filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Box className="mr-2 h-5 w-5 text-slate-300" /> Keine Objekte
              </div>
            ) : (
              <ObjectsMap
                objects={filtered}
                selectedId={selectedId}
                onObjectClick={(id) => { setSelectedId(id); }}
              />
            )}
          </div>
          <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
            Tipp: Objekt in der Karte antippen zum Markieren · in der Liste anklicken zum Öffnen
          </div>
        </div>
      </div>
    </AppShell>
  );
}
