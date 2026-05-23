import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DISPO_SIDEBAR } from './sidebar';
import { useDamageList, type DamageListItem } from '@/hooks/useDamageList';
import { useCategoryTree } from '@/hooks/useCategoryTree';
import { useMapLayers } from '@/hooks/useMapLayers';
import { DamagesMap } from '@/components/map/DamagesMap';
import { exportCsv, exportGeoJson } from '@/lib/damageExport';
import {
  Search,
  Download,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  FileSpreadsheet,
  FileText,
  Map as MapIcon,
  Filter as FilterIcon,
  X,
  PackagePlus,
} from 'lucide-react';
import type { CategoryNode } from '@/lib/categories';

const STATUS_BADGE: Record<string, string> = {
  neu: 'bg-blue-100 text-blue-800',
  geprueft: 'bg-indigo-100 text-indigo-800',
  zugewiesen: 'bg-violet-100 text-violet-800',
  bearbeitung: 'bg-amber-100 text-amber-800',
  erledigt: 'bg-emerald-100 text-emerald-800',
  abgelehnt: 'bg-slate-100 text-slate-600',
};
const PRIO_BADGE: Record<string, string> = {
  niedrig: 'bg-slate-100 text-slate-600',
  normal: 'bg-blue-100 text-blue-700',
  hoch: 'bg-orange-100 text-orange-700',
  dringend: 'bg-red-100 text-red-700',
};

const ALL_STATUS = ['neu', 'geprueft', 'zugewiesen', 'bearbeitung', 'erledigt', 'abgelehnt'] as const;
const ALL_PRIO = ['niedrig', 'normal', 'hoch', 'dringend'] as const;

type SortKey = 'code' | 'created_at' | 'category_name' | 'address' | 'creator_name' | 'priority' | 'status';
const SORT_LABELS: Record<SortKey, string> = {
  code: 'ID',
  created_at: 'Aufnahmedatum',
  category_name: 'Kategorie',
  address: 'Adresse',
  creator_name: 'Erfasser',
  priority: 'Prio',
  status: 'Status',
};

function collectDescendantIds(node: CategoryNode): string[] {
  return [node.id, ...node.children.flatMap(collectDescendantIds)];
}

const PRIO_ORDER: Record<string, number> = { niedrig: 0, normal: 1, hoch: 2, dringend: 3 };
const STATUS_ORDER: Record<string, number> = {
  neu: 0, geprueft: 1, zugewiesen: 2, bearbeitung: 3, erledigt: 4, abgelehnt: 5,
};

export function DispoDamagesPage() {
  const nav = useNavigate();
  const { data: damages = [], isLoading, error } = useDamageList();
  const { data: tree = [] } = useCategoryTree();
  const { data: layers = [] } = useMapLayers();

  // ============= Filter-State =============
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [prioFilter, setPrioFilter] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set()); // IDs der gewählten Roots
  const [searchText, setSearchText] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'created_at',
    dir: 'desc',
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Mehrfachauswahl für "Zu Auftrag bündeln"
  const [bundleIds, setBundleIds] = useState<Set<string>>(new Set());
  function toggleBundle(id: string) {
    setBundleIds((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearBundle() {
    setBundleIds(new Set());
  }
  // Nur "bündelbare" Schäden zählen (offene, nicht bereits zugewiesen/erledigt)
  function isBundlable(d: DamageListItem) {
    return d.status === 'neu' || d.status === 'geprueft';
  }

  // Erweitere Kategoriefilter um alle Nachfahren der gewählten Knoten
  const effectiveCategoryIds = useMemo(() => {
    if (categoryFilter.size === 0) return null; // kein Filter
    const ids = new Set<string>();
    function walk(nodes: CategoryNode[]) {
      for (const n of nodes) {
        if (categoryFilter.has(n.id)) {
          collectDescendantIds(n).forEach((id) => ids.add(id));
        } else {
          walk(n.children);
        }
      }
    }
    walk(tree);
    return ids;
  }, [tree, categoryFilter]);

  // ============= Filter + Sort anwenden =============
  const filtered = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : -Infinity;
    const toTs = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : Infinity;
    const q = searchText.trim().toLowerCase();

    return damages.filter((d) => {
      const ts = new Date(d.created_at).getTime();
      if (ts < fromTs || ts > toTs) return false;
      if (statusFilter.size > 0 && !statusFilter.has(d.status)) return false;
      if (prioFilter.size > 0 && !prioFilter.has(d.priority)) return false;
      if (effectiveCategoryIds && !effectiveCategoryIds.has(d.category_id)) return false;
      if (q) {
        const haystack = [
          d.code, d.description, d.address_street, d.address_city, d.category_name,
          d.creator_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [damages, dateFrom, dateTo, statusFilter, prioFilter, effectiveCategoryIds, searchText]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const m = sort.dir === 'asc' ? 1 : -1;
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av === bv) return 0;
      if (av == null) return 1 * m;
      if (bv == null) return -1 * m;
      return av > bv ? 1 * m : -1 * m;
    });
    return arr;
  }, [filtered, sort]);

  // ============= Default-Center der Karte =============
  const mapCenter: [number, number] = useMemo(() => {
    const withPos = sorted.find((d) => d.gps_lat != null && d.gps_lng != null);
    if (withPos) return [withPos.gps_lat!, withPos.gps_lng!];
    return [50.9787, 11.0328]; // Erfurt
  }, [sorted]);

  // ============= Filter zurücksetzen =============
  const hasAnyFilter =
    !!dateFrom || !!dateTo || statusFilter.size > 0 || prioFilter.size > 0 || categoryFilter.size > 0 || !!searchText;
  function resetFilters() {
    setDateFrom('');
    setDateTo('');
    setStatusFilter(new Set());
    setPrioFilter(new Set());
    setCategoryFilter(new Set());
    setSearchText('');
  }

  // ============= Quick Date Picker =============
  function setLastDays(n: number) {
    const today = new Date();
    today.setHours(23, 59, 59);
    const from = new Date(today);
    from.setDate(from.getDate() - n + 1);
    from.setHours(0, 0, 0);
    setDateFrom(from.toISOString().slice(0, 10));
    setDateTo(today.toISOString().slice(0, 10));
  }

  // ============= Toggle-Helfer =============
  const toggleIn = (set: Set<string>, val: string) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  };

  // ============= Export-Dropdown =============
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <AppShell title="Disposition" subtitle="Schäden" sidebar={DISPO_SIDEBAR}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Schäden</h2>
          <p className="text-sm text-muted-foreground">
            {filtered.length} von {damages.length}
            {hasAnyFilter && <span className="ml-1 text-blue-600">· gefiltert</span>}
            {bundleIds.size > 0 && <span className="ml-1 text-blue-600">· {bundleIds.size} ausgewählt</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {bundleIds.size > 0 && (
            <>
              <button
                onClick={clearBundle}
                className="text-xs text-slate-500 underline"
              >
                Auswahl aufheben
              </button>
              <button
                onClick={() =>
                  nav('/dispo/orders/new', { state: { damageIds: Array.from(bundleIds) } })
                }
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <PackagePlus className="h-4 w-4" /> Zu Auftrag bündeln ({bundleIds.size})
              </button>
            </>
          )}
          <div className="relative">
            <button
              onClick={() => setExportOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
            >
              <Download className="h-4 w-4" /> Export
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded-lg border bg-white py-1 text-sm shadow-lg">
                <button
                  onClick={() => { exportCsv(sorted); setExportOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  CSV / Excel
                </button>
                <button
                  onClick={() => { exportGeoJson(sorted); setExportOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50"
                >
                  <MapIcon className="h-4 w-4 text-blue-600" /> GeoJSON
                </button>
                <button
                  disabled
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left opacity-50"
                >
                  <FileText className="h-4 w-4 text-red-600" /> PDF (folgt)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============= Filter-Bar ============= */}
      <div className="mb-3 rounded-xl border bg-white p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Zeitraum</label>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border px-2 py-1.5 text-sm"
              />
              <span className="text-slate-400">–</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Quick</label>
            <div className="flex gap-1">
              <button onClick={() => setLastDays(1)} className="rounded-md border px-2 py-1.5 text-xs hover:bg-slate-50">Heute</button>
              <button onClick={() => setLastDays(7)} className="rounded-md border px-2 py-1.5 text-xs hover:bg-slate-50">7 T.</button>
              <button onClick={() => setLastDays(30)} className="rounded-md border px-2 py-1.5 text-xs hover:bg-slate-50">30 T.</button>
              <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="rounded-md border px-2 py-1.5 text-xs hover:bg-slate-50">Alle</button>
            </div>
          </div>

          <div className="relative">
            <label className="mb-1 block text-xs text-slate-500">Schadensart</label>
            <button
              onClick={() => setShowCategoryPicker((s) => !s)}
              className="flex min-w-[180px] items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-sm"
            >
              {categoryFilter.size === 0 ? (
                <span className="text-slate-400">Alle</span>
              ) : (
                <span>{categoryFilter.size} gewählt</span>
              )}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {showCategoryPicker && (
              <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-72 overflow-y-auto rounded-lg border bg-white p-2 shadow-lg">
                {tree.map((root) => (
                  <CategoryPickerNode
                    key={root.id}
                    node={root}
                    selected={categoryFilter}
                    onToggle={(id) => setCategoryFilter((s) => toggleIn(s, id))}
                  />
                ))}
                <button
                  onClick={() => setShowCategoryPicker(false)}
                  className="mt-2 w-full rounded-md bg-slate-100 py-1 text-xs"
                >
                  Schließen
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-500">Status</label>
            <div className="flex flex-wrap gap-1">
              {ALL_STATUS.map((s) => {
                const active = statusFilter.has(s);
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter((set) => toggleIn(set, s))}
                    className={`rounded-full px-2 py-1 text-xs ${
                      active ? STATUS_BADGE[s] + ' font-medium' : 'bg-white border text-slate-600'
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-500">Priorität</label>
            <div className="flex flex-wrap gap-1">
              {ALL_PRIO.map((p) => {
                const active = prioFilter.has(p);
                return (
                  <button
                    key={p}
                    onClick={() => setPrioFilter((set) => toggleIn(set, p))}
                    className={`rounded-full px-2 py-1 text-xs ${
                      active ? PRIO_BADGE[p] + ' font-medium' : 'bg-white border text-slate-600'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-xs text-slate-500">Suche</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="ID, Bemerkung, Adresse …"
                className="w-full rounded-lg border py-1.5 pl-7 pr-2 text-sm"
              />
            </div>
          </div>

          {hasAnyFilter && (
            <button onClick={resetFilters} className="flex items-center gap-1 pb-1.5 text-xs text-slate-500 underline">
              <X className="h-3 w-3" /> Filter zurücksetzen
            </button>
          )}
        </div>
      </div>

      {/* ============= Tabelle + Karte ============= */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="overflow-hidden rounded-xl border bg-white lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-8 px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={
                        sorted.filter(isBundlable).length > 0 &&
                        sorted.filter(isBundlable).every((d) => bundleIds.has(d.id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          const next = new Set(bundleIds);
                          sorted.filter(isBundlable).forEach((d) => next.add(d.id));
                          setBundleIds(next);
                        } else {
                          clearBundle();
                        }
                      }}
                      title="Alle bündelbaren Treffer auswählen"
                    />
                  </th>
                  <SortableHead k="code" sort={sort} setSort={setSort} />
                  <SortableHead k="created_at" sort={sort} setSort={setSort} />
                  <SortableHead k="category_name" sort={sort} setSort={setSort} />
                  <SortableHead k="address" sort={sort} setSort={setSort} />
                  <SortableHead k="creator_name" sort={sort} setSort={setSort} />
                  <SortableHead k="priority" sort={sort} setSort={setSort} />
                  <SortableHead k="status" sort={sort} setSort={setSort} />
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Lade …</td></tr>
                )}
                {error && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-red-600">{(error as Error).message}</td></tr>
                )}
                {!isLoading && sorted.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                    {hasAnyFilter ? 'Keine Treffer mit diesen Filtern.' : 'Noch keine Schäden erfasst.'}
                  </td></tr>
                )}
                {sorted.map((d) => {
                  const checked = bundleIds.has(d.id);
                  const bundlable = isBundlable(d);
                  return (
                  <tr
                    key={d.id}
                    onClick={() => nav(`/dispo/damages/${d.id}`)}
                    onMouseEnter={() => setSelectedId(d.id)}
                    className={`cursor-pointer hover:bg-slate-50 ${
                      checked ? 'bg-blue-50/60' : selectedId === d.id ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    <td
                      className="px-3 py-2"
                      onClick={(e) => { e.stopPropagation(); if (bundlable) toggleBundle(d.id); }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!bundlable}
                        onChange={() => {}}
                        title={bundlable ? 'Für Auftrag auswählen' : 'Nur offene Schäden können gebündelt werden'}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{d.code}</td>
                    <td className="px-3 py-2 text-xs">{new Date(d.created_at).toLocaleString('de-DE')}</td>
                    <td className="px-3 py-2">{d.category_name ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[d.address_street, d.address_city].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">{d.creator_name ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${PRIO_BADGE[d.priority] ?? 'bg-slate-100'}`}>
                        {d.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[d.status] ?? 'bg-slate-100'}`}>
                        {d.status}
                      </span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Karte */}
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
            <FilterIcon className="h-3 w-3" />
            {filtered.length} Pin{filtered.length === 1 ? '' : 's'} sichtbar (synchron zur Liste)
          </div>
          <div className="h-[520px]">
            <DamagesMap
              center={mapCenter}
              items={sorted.filter((d) => d.gps_lat != null && d.gps_lng != null)}
              selectedId={selectedId}
              onPinClick={(id) => nav(`/dispo/damages/${id}`)}
              layers={layers}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function sortValue(d: DamageListItem, key: SortKey): string | number | null {
  switch (key) {
    case 'code': return d.code;
    case 'created_at': return d.created_at;
    case 'category_name': return d.category_name ?? '';
    case 'address': return [d.address_street, d.address_city].filter(Boolean).join(', ') || '';
    case 'creator_name': return d.creator_name ?? '';
    case 'priority': return PRIO_ORDER[d.priority] ?? -1;
    case 'status': return STATUS_ORDER[d.status] ?? -1;
  }
}

function SortableHead({
  k, sort, setSort,
}: {
  k: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  setSort: (s: { key: SortKey; dir: 'asc' | 'desc' }) => void;
}) {
  const active = sort.key === k;
  function handleClick() {
    if (active) setSort({ key: k, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    else setSort({ key: k, dir: 'desc' });
  }
  return (
    <th
      onClick={handleClick}
      className={`cursor-pointer select-none px-3 py-2 text-left hover:text-slate-800 ${
        active ? 'text-blue-600' : ''
      }`}
    >
      {SORT_LABELS[k]}{' '}
      {active ? (
        sort.dir === 'desc' ? <ChevronDown className="inline h-3 w-3" /> : <ChevronUp className="inline h-3 w-3" />
      ) : (
        <ChevronsUpDown className="inline h-3 w-3 text-slate-300" />
      )}
    </th>
  );
}

function CategoryPickerNode({
  node, selected, onToggle, depth = 0,
}: {
  node: CategoryNode;
  selected: Set<string>;
  onToggle: (id: string) => void;
  depth?: number;
}) {
  return (
    <div>
      <label
        className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50"
        style={{ paddingLeft: depth * 14 + 4 }}
      >
        <input
          type="checkbox"
          checked={selected.has(node.id)}
          onChange={() => onToggle(node.id)}
          className="h-3.5 w-3.5"
        />
        <span>{node.name}</span>
      </label>
      {node.children.map((c) => (
        <CategoryPickerNode key={c.id} node={c} selected={selected} onToggle={onToggle} depth={depth + 1} />
      ))}
    </div>
  );
}
