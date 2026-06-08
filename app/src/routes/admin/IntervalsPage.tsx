import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ADMIN_SIDEBAR } from './sidebar';
import { useClassIntervals, ASB_KLASSEN } from '@/hooks/useInspections';
import { Save, CalendarClock, CheckCircle2 } from 'lucide-react';

const PRESETS = [
  { months: 1, label: 'Monatlich' },
  { months: 3, label: 'Vierteljährlich' },
  { months: 6, label: 'Halbjährlich' },
  { months: 12, label: 'Jährlich' },
  { months: 24, label: 'Alle 2 Jahre' },
  { months: 0, label: 'Keine Kontrolle' },
];

export function AdminIntervalsPage() {
  const { query, saveMut } = useClassIntervals();
  const [values, setValues] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (query.data) setValues(query.data); }, [query.data]);

  function setClass(cls: string, months: number) {
    setValues((v) => ({ ...v, [cls]: months }));
    setSaved(false);
  }

  function save() {
    const rows = Object.entries(ASB_KLASSEN).map(([cls]) => ({
      road_class: cls,
      interval_months: values[cls] ?? 12,
    }));
    saveMut.mutate(rows, { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2500); } });
  }

  return (
    <AppShell title="Administration" subtitle="Kontrollintervalle" sidebar={ADMIN_SIDEBAR}>
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <CalendarClock className="h-6 w-6 text-blue-500" /> Kontrollintervalle
        </h2>
        <p className="text-sm text-muted-foreground">
          Lege je Straßenklasse fest, in welchem Abstand die Abschnitte begangen/kontrolliert werden müssen.
          Daraus ergibt sich die Fälligkeits-Ampel im Dashboard.
        </p>
      </div>

      <div className="max-w-2xl overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Straßenklasse</th>
              <th className="px-4 py-2 text-left">Kontrollintervall</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {Object.entries(ASB_KLASSEN).map(([cls, label]) => (
              <tr key={cls} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium">{label}</td>
                <td className="px-4 py-2.5">
                  <select
                    value={values[cls] ?? 12}
                    onChange={(e) => setClass(cls, Number(e.target.value))}
                    className="rounded-lg border px-3 py-1.5 text-sm"
                  >
                    {PRESETS.map((p) => (
                      <option key={p.months} value={p.months}>{p.label}{p.months > 0 ? ` (${p.months} Mon.)` : ''}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={saveMut.isPending}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          <Save className="h-4 w-4" /> {saveMut.isPending ? 'Speichern …' : 'Speichern'}
        </button>
        {saved && <span className="flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Gespeichert</span>}
        {saveMut.isError && <span className="text-sm text-red-600">{(saveMut.error as Error).message}</span>}
      </div>
    </AppShell>
  );
}
