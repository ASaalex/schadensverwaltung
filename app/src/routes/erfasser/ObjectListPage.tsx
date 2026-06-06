import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ErfasserObjectsMap } from '@/components/map/ErfasserObjectsMap';
import { Plus } from 'lucide-react';

export function ErfasserObjectListPage() {
  const nav = useNavigate();

  return (
    <AppShell accent="blue" title="Objekte" subtitle="Karte der Netz-Objekte">
      <div className="space-y-3 px-3 py-3">
        {/* Kopfzeile mit Neu-Button */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-slate-700">Objekte in der Nähe</h2>
          <Link
            to="/erfasser/objects/new"
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow active:scale-[0.98] transition"
          >
            <Plus className="h-4 w-4" /> Neu erfassen
          </Link>
        </div>

        {/* Karte (lädt Objekte viewport-basiert) */}
        <div className="relative overflow-hidden rounded-2xl border shadow-sm"
          style={{ height: 'calc(100dvh - 200px)', minHeight: 380 }}>
          <ErfasserObjectsMap onObjectClick={(id) => nav(`/dispo/objects/${id}`)} />
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          Objekte werden beim Reinzoomen für den sichtbaren Ausschnitt geladen.
        </p>
      </div>
    </AppShell>
  );
}
