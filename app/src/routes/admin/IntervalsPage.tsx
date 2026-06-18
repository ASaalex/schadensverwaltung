import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ADMIN_SIDEBAR } from './sidebar';
import { useClassIntervals, useRoadClasses, ASB_KLASSEN } from '@/hooks/useInspections';
import { Save, CalendarClock, CheckCircle2, Plus, Trash2 } from 'lucide-react';

const PRESETS = [
  { days: 14, label: '2 Wochen' },
  { days: 28, label: '4 Wochen' },
  { days: 56, label: '8 Wochen' },
  { days: 90, label: 'Vierteljährlich (90 T.)' },
  { days: 182, label: 'Halbjährlich (182 T.)' },
  { days: 365, label: 'Jährlich (365 T.)' },
  { days: 730, label: 'Alle 2 Jahre' },
  { days: 0, label: 'Keine Kontrolle' },
];

export function AdminIntervalsPage() {
  const { query, saveMut } = useClassIntervals();
  const { query: classesQ, addMut, deleteMut } = useRoadClasses();
  const [values, setValues] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(false);
  const [newClass, setNewClass] = useState('');

  useEffect(() => { if (query.data) setValues(query.data); }, [query.data]);

  const customClasses = classesQ.data ?? [];
  // Kombinierte Liste: ASB-Standard + eigene Klassen
  const allClasses: { key: string; label: string; custom?: { id: string } }[] = [
    ...Object.entries(ASB_KLASSEN).map(([key, label]) => ({ key, label })),
    ...customClasses.map((c) => ({ key: c.key, label: c.label, custom: { id: c.id } })),
  ];

  function setClass(cls: string, days: number) {
    setValues((v) => ({ ...v, [cls]: days }));
    setSaved(false);
  }

  function save() {
    const rows = allClasses.map((c) => ({ road_class: c.key, interval_days: values[c.key] ?? 365 }));
    saveMut.mutate(rows, { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2500); } });
  }

  return (
    <AppShell title="Administration" subtitle="Kontrollintervalle" sidebar={ADMIN_SIDEBAR}>
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <CalendarClock className="h-6 w-6 text-blue-500" /> Straßenklassen &amp; Kontrollintervalle
        </h2>
        <p className="text-sm text-muted-foreground">
          Lege je Straßenklasse den Kontrollabstand fest (auch 2 oder 8 Wochen). Eigene Klassen kannst
          du unten ergänzen. Daraus ergibt sich die Fälligkeits-Ampel im Dashboard.
        </p>
      </div>

      <div className="max-w-2xl overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Straßenklasse</th>
              <th className="px-4 py-2 text-left">Kontrollintervall</th>
              <th className="w-10 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {allClasses.map((c) => (
              <tr key={c.key} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium">
                  {c.label}
                  {c.custom && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">eigene</span>}
                </td>
                <td className="px-4 py-2.5">
                  <select
                    value={values[c.key] ?? 365}
                    onChange={(e) => setClass(c.key, Number(e.target.value))}
                    className="rounded-lg border px-3 py-1.5 text-sm"
                  >
                    {/* aktuellen Wert anzeigen, falls nicht in Presets */}
                    {!PRESETS.some((p) => p.days === (values[c.key] ?? 365)) && (
                      <option value={values[c.key]}>{values[c.key]} Tage</option>
                    )}
                    {PRESETS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
                  </select>
                </td>
                <td className="px-2 py-2.5 text-right">
                  {c.custom && (
                    <button onClick={() => deleteMut.mutate(c.custom!.id)}
                      className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600" title="Eigene Klasse löschen">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Eigene Klasse hinzufügen */}
        <div className="flex items-center gap-2 border-t bg-slate-50 px-4 py-3">
          <input
            value={newClass}
            onChange={(e) => setNewClass(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newClass.trim()) { addMut.mutate(newClass.trim()); setNewClass(''); } }}
            placeholder="Eigene Straßenklasse (z. B. Wirtschaftsweg Nord)"
            className="flex-1 rounded-lg border px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => { if (newClass.trim()) { addMut.mutate(newClass.trim()); setNewClass(''); } }}
            disabled={!newClass.trim() || addMut.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" /> Klasse
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={saveMut.isPending}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          <Save className="h-4 w-4" /> {saveMut.isPending ? 'Speichern …' : 'Intervalle speichern'}
        </button>
        {saved && <span className="flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Gespeichert</span>}
        {saveMut.isError && <span className="text-sm text-red-600">{(saveMut.error as Error).message}</span>}
      </div>
    </AppShell>
  );
}
