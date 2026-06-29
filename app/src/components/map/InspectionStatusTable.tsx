/**
 * Tabellen-Ansicht der Straßenkontrolle — sortierbar nach Fälligkeit,
 * farblich nach Status. Alternative zur Karten-Ansicht im Dashboard.
 */
import { useMemo, useState } from 'react';
import { useNetworkSegments } from '@/hooks/useNetworkSegments';
import { useNetworkObjects } from '@/hooks/useNetworkObjects';
import { useSegmentStatus, useObjectStatus, ASB_KLASSEN, type SegStatus } from '@/hooks/useInspections';
import { ChevronUp, ChevronDown } from 'lucide-react';

const STATUS_BADGE: Record<SegStatus, string> = {
  red: 'bg-red-100 text-red-700',
  yellow: 'bg-amber-100 text-amber-700',
  green: 'bg-emerald-100 text-emerald-700',
  none: 'bg-slate-100 text-slate-500',
};
const STATUS_RANK: Record<SegStatus, number> = { red: 0, yellow: 1, green: 2, none: 3 };

export function InspectionStatusTable() {
  const { data: segments = [] } = useNetworkSegments();
  const { data: statusMap = {} } = useSegmentStatus();
  const { query: objectsQ } = useNetworkObjects();
  const objects = objectsQ.data ?? [];
  const { data: objStatusMap = {} } = useObjectStatus();
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');

  const rows = useMemo(() => {
    const segRows = segments.map((s) => {
      const st = statusMap[s.id];
      return {
        id: s.id,
        kind: 'Straße' as const,
        name: s.name ?? `${s.from_node} → ${s.to_node}`,
        klasse: s.strassen_klasse_asb ? (ASB_KLASSEN[s.strassen_klasse_asb] ?? s.strassen_klasse_asb) : '—',
        status: (st?.status ?? 'red') as SegStatus,
        days: st?.days_until_due ?? null,
        last: st?.last_at ?? null,
      };
    });
    // Nur Objekte mit Kontrollpflicht (Status != 'none')
    const objRows = objects
      .map((o) => ({ o, st: objStatusMap[o.id] }))
      .filter((x) => x.st && x.st.status !== 'none')
      .map(({ o, st }) => ({
        id: o.id,
        kind: 'Objekt' as const,
        name: o.name || o.identifier || o.type_name || 'Objekt',
        klasse: o.type_name ?? '—',
        status: st!.status as SegStatus,
        days: st!.days_until_due ?? null,
        last: st!.last_at ?? null,
      }));
    const arr = [...segRows, ...objRows];
    // Sortierung: zuerst nach Status-Dringlichkeit, dann nach Resttagen
    arr.sort((a, b) => {
      const sr = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (sr !== 0) return dir === 'asc' ? sr : -sr;
      const ad = a.days ?? Infinity, bd = b.days ?? Infinity;
      return dir === 'asc' ? ad - bd : bd - ad;
    });
    return arr;
  }, [segments, statusMap, objects, objStatusMap, dir]);

  return (
    <div className="h-full overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Abschnitt / Objekt</th>
            <th className="px-3 py-2 text-left">Klasse / Typ</th>
            <th className="px-3 py-2 text-left">Letzte Kontrolle</th>
            <th className="cursor-pointer px-3 py-2 text-left" onClick={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
              Fälligkeit {dir === 'asc' ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Keine Einträge.</td></tr>
          )}
          {rows.map((r) => (
            <tr key={`${r.kind}-${r.id}`} className="hover:bg-slate-50">
              <td className="px-3 py-2 font-medium">
                {r.kind === 'Objekt' && (
                  <span className="mr-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">Objekt</span>
                )}
                {r.name}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{r.klasse}</td>
              <td className="px-3 py-2 text-xs">{r.last ? new Date(r.last).toLocaleDateString('de-DE') : '—'}</td>
              <td className="px-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[r.status]}`}>
                  {r.status === 'none' ? 'keine Kontrolle'
                    : r.days == null ? 'nie begangen'
                    : r.days < 0 ? `überfällig (${Math.abs(r.days)} T.)`
                    : `in ${r.days} T.`}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
