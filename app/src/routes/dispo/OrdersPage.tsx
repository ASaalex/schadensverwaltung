import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DISPO_SIDEBAR } from './sidebar';
import { useOrdersList, type OrderListItem } from '@/hooks/useOrdersList';
import { useCompanies } from '@/hooks/useCompanies';
import {
  Plus,
  ClipboardList,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  X,
} from 'lucide-react';

const STATUS_BADGE: Record<string, string> = {
  entwurf: 'bg-slate-100 text-slate-600',
  versendet: 'bg-cyan-100 text-cyan-800',
  angenommen: 'bg-indigo-100 text-indigo-800',
  bearbeitung: 'bg-amber-100 text-amber-800',
  fertiggemeldet: 'bg-orange-100 text-orange-800',
  abgeschlossen: 'bg-emerald-100 text-emerald-800',
  storniert: 'bg-red-100 text-red-700',
};
const STATUS_LABEL: Record<string, string> = {
  entwurf: 'Entwurf',
  versendet: 'Versendet',
  angenommen: 'Angenommen',
  bearbeitung: 'In Bearbeitung',
  fertiggemeldet: 'Fertiggemeldet',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
};
const ALL_STATUS = Object.keys(STATUS_LABEL);
const STATUS_ORDER: Record<string, number> = {
  entwurf: 0, versendet: 1, angenommen: 2, bearbeitung: 3,
  fertiggemeldet: 4, abgeschlossen: 5, storniert: 6,
};

type SortKey = 'code' | 'title' | 'company' | 'start' | 'end' | 'positions' | 'status' | 'created';
const SORT_LABELS: Record<SortKey, string> = {
  code: 'ID',
  title: 'Titel',
  company: 'Firma',
  start: 'Start',
  end: 'Ende',
  positions: 'Positionen',
  status: 'Status',
  created: 'Angelegt',
};

function sortValue(o: OrderListItem, k: SortKey): string | number | null {
  switch (k) {
    case 'code': return o.code;
    case 'title': return o.title;
    case 'company': return o.assigned_company_name ?? '';
    case 'start': return o.planned_start_date ?? '';
    case 'end': return o.planned_end_date ?? '';
    case 'positions': return o.positions_count;
    case 'status': return STATUS_ORDER[o.status] ?? 99;
    case 'created': return o.created_at;
  }
}

export function DispoOrdersPage() {
  const nav = useNavigate();
  const { data: orders = [], isLoading, error } = useOrdersList();
  const { data: companies = [] } = useCompanies();

  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [companyFilter, setCompanyFilter] = useState<string>('');
  const [searchText, setSearchText] = useState('');

  // Datums-Filter — Zeitraum betrifft planned_start_date
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [dateField, setDateField] = useState<'planned_start_date' | 'created_at'>('planned_start_date');

  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'created', dir: 'desc' });

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : -Infinity;
    const toTs = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : Infinity;
    return orders.filter((o) => {
      if (statusFilter.size > 0 && !statusFilter.has(o.status)) return false;
      if (companyFilter && o.assigned_company_id !== companyFilter) return false;
      // Datums-Filter
      const dateStr = dateField === 'planned_start_date' ? o.planned_start_date : o.created_at;
      if (dateStr) {
        const ts = new Date(dateStr).getTime();
        if (ts < fromTs || ts > toTs) return false;
      } else if (dateFrom || dateTo) {
        return false; // Order ohne Datum bei aktivem Filter raus
      }
      if (q) {
        const hay = [o.code, o.title, o.assigned_company_name].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, companyFilter, searchText, dateFrom, dateTo, dateField]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const m = sort.dir === 'asc' ? 1 : -1;
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av === bv) return 0;
      if (av == null || av === '') return 1 * m;
      if (bv == null || bv === '') return -1 * m;
      return av > bv ? m : -m;
    });
    return arr;
  }, [filtered, sort]);

  function toggleStatus(s: string) {
    setStatusFilter((set) => {
      const next = new Set(set);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function setLastDays(n: number) {
    const today = new Date();
    today.setHours(23, 59, 59);
    const from = new Date(today);
    from.setDate(from.getDate() - n + 1);
    from.setHours(0, 0, 0);
    setDateFrom(from.toISOString().slice(0, 10));
    setDateTo(today.toISOString().slice(0, 10));
  }
  function setNextDays(n: number) {
    const today = new Date();
    today.setHours(0, 0, 0);
    const to = new Date(today);
    to.setDate(to.getDate() + n - 1);
    to.setHours(23, 59, 59);
    setDateFrom(today.toISOString().slice(0, 10));
    setDateTo(to.toISOString().slice(0, 10));
  }

  const hasAnyFilter =
    statusFilter.size > 0 || !!companyFilter || !!searchText || !!dateFrom || !!dateTo;

  function resetFilters() {
    setStatusFilter(new Set());
    setCompanyFilter('');
    setSearchText('');
    setDateFrom('');
    setDateTo('');
  }

  return (
    <AppShell title="Disposition" subtitle="Aufträge" sidebar={DISPO_SIDEBAR}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Aufträge</h2>
          <p className="text-sm text-muted-foreground">
            {filtered.length} von {orders.length}
            {hasAnyFilter && <span className="ml-1 text-blue-600">· gefiltert</span>}
          </p>
        </div>
        <Link
          to="/dispo/orders/new"
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> Neuer Auftrag
        </Link>
      </div>

      <div className="mb-3 rounded-xl border bg-white p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">
              Zeitraum{' '}
              <select
                value={dateField}
                onChange={(e) => setDateField(e.target.value as 'planned_start_date' | 'created_at')}
                className="ml-1 rounded border px-1 py-0.5 text-xs"
              >
                <option value="planned_start_date">geplant</option>
                <option value="created_at">angelegt</option>
              </select>
            </label>
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
              <button onClick={() => setLastDays(7)} className="rounded-md border px-2 py-1.5 text-xs hover:bg-slate-50">letzte 7 T.</button>
              <button onClick={() => setLastDays(30)} className="rounded-md border px-2 py-1.5 text-xs hover:bg-slate-50">letzte 30 T.</button>
              <button onClick={() => setNextDays(7)} className="rounded-md border px-2 py-1.5 text-xs hover:bg-slate-50">nächste 7 T.</button>
              <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="rounded-md border px-2 py-1.5 text-xs hover:bg-slate-50">Alle</button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Status</label>
            <div className="flex flex-wrap gap-1">
              {ALL_STATUS.map((s) => {
                const active = statusFilter.has(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleStatus(s)}
                    className={`rounded-full px-2 py-1 text-xs ${
                      active ? STATUS_BADGE[s] + ' font-medium' : 'bg-white border text-slate-600'
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Firma</label>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="rounded-lg border px-2 py-1.5 text-sm"
            >
              <option value="">Alle</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-xs text-slate-500">Suche</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="ID, Titel, Firma …"
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

      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <SortableHead k="code" sort={sort} setSort={setSort} />
              <SortableHead k="title" sort={sort} setSort={setSort} />
              <SortableHead k="company" sort={sort} setSort={setSort} />
              <SortableHead k="start" sort={sort} setSort={setSort} />
              <SortableHead k="end" sort={sort} setSort={setSort} />
              <SortableHead k="positions" sort={sort} setSort={setSort} />
              <SortableHead k="status" sort={sort} setSort={setSort} />
              <SortableHead k="created" sort={sort} setSort={setSort} />
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
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  <ClipboardList className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                  {orders.length === 0
                    ? 'Noch keine Aufträge. Geh in die Schäden-Liste, markiere welche und klick auf "Zu Auftrag bündeln" — oder oben rechts "Neuer Auftrag".'
                    : 'Keine Treffer mit diesen Filtern.'}
                </td>
              </tr>
            )}
            {sorted.map((o) => (
              <tr
                key={o.id}
                onClick={() => nav(`/dispo/orders/${o.id}`)}
                className="cursor-pointer hover:bg-slate-50"
              >
                <td className="px-4 py-3 font-mono text-xs">{o.code}</td>
                <td className="px-4 py-3 font-medium">{o.title}</td>
                <td className="px-4 py-3">{o.assigned_company_name ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {o.planned_start_date ? new Date(o.planned_start_date).toLocaleDateString('de-DE') : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {o.planned_end_date ? new Date(o.planned_end_date).toLocaleDateString('de-DE') : '—'}
                </td>
                <td className="px-4 py-3">{o.positions_count}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[o.status] ?? 'bg-slate-100'}`}>
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleDateString('de-DE')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function SortableHead({
  k,
  sort,
  setSort,
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
      className={`cursor-pointer select-none px-4 py-2.5 text-left hover:text-slate-800 ${active ? 'text-blue-600' : ''}`}
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
