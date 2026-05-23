import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { useOrdersList } from '@/hooks/useOrdersList';
import { Calendar, List, ClipboardList } from 'lucide-react';

const STATUS_BADGE: Record<string, string> = {
  versendet: 'bg-cyan-100 text-cyan-800',
  angenommen: 'bg-indigo-100 text-indigo-800',
  bearbeitung: 'bg-amber-100 text-amber-800',
  fertiggemeldet: 'bg-orange-100 text-orange-800',
  abgeschlossen: 'bg-emerald-100 text-emerald-800',
  storniert: 'bg-red-100 text-red-700',
};
const STATUS_LABEL: Record<string, string> = {
  versendet: 'Neu',
  angenommen: 'Angenommen',
  bearbeitung: 'In Bearbeitung',
  fertiggemeldet: 'Fertig gemeldet',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
};

export function FirmaOrdersPage() {
  const nav = useNavigate();
  const { data: orders = [], isLoading, error } = useOrdersList();

  // Entwürfe (status='entwurf') gehören die Disposition, sollen im Firmenportal
  // nicht erscheinen — auch nicht, wenn ein Admin/Disponent über den Rollen-
  // Switcher das Portal aufruft.
  const visible = orders.filter((o) => o.status !== 'entwurf');
  const active = visible.filter(
    (o) => o.status !== 'abgeschlossen' && o.status !== 'storniert',
  );
  const archived = visible.filter(
    (o) => o.status === 'abgeschlossen' || o.status === 'storniert',
  );

  return (
    <AppShell title="Firmenportal" subtitle="Meine Aufträge" accent="orange">
      <h2 className="mb-1 text-2xl font-semibold">Meine Aufträge</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        {active.length} aktiv{archived.length > 0 && ` · ${archived.length} archiviert`}
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(error as Error).message}
        </div>
      )}

      {isLoading && <div className="text-sm text-muted-foreground">Lade …</div>}

      {!isLoading && visible.length === 0 && (
        <div className="rounded-xl border bg-white p-8 text-center">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <div className="font-medium">Keine Aufträge</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Sobald die Disposition dir Aufträge zuweist, erscheinen sie hier.
          </p>
        </div>
      )}

      {/* Aktive Aufträge */}
      {active.length > 0 && (
        <div className="space-y-3">
          {active.map((o) => (
            <div
              key={o.id}
              onClick={() => nav(`/firma/orders/${o.id}`)}
              className={`relative cursor-pointer rounded-xl border bg-white p-4 hover:border-orange-300 hover:shadow ${
                o.status === 'versendet' ? 'border-orange-300' : ''
              }`}
            >
              {o.status === 'versendet' && (
                <span className="absolute right-3 top-3 rounded-full bg-orange-500 px-2 py-0.5 text-xs text-white">
                  Neu
                </span>
              )}
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                  <ClipboardList className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">{o.code}</div>
                  <div className="text-lg font-semibold">{o.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {o.planned_start_date ? new Date(o.planned_start_date).toLocaleDateString('de-DE') : '—'}
                      {o.planned_end_date && o.planned_end_date !== o.planned_start_date &&
                        ' – ' + new Date(o.planned_end_date).toLocaleDateString('de-DE')}
                    </span>
                    <span className="flex items-center gap-1">
                      <List className="h-3.5 w-3.5" />
                      {o.positions_count} Position{o.positions_count === 1 ? '' : 'en'}
                    </span>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[o.status] ?? 'bg-slate-100'}`}>
                  {STATUS_LABEL[o.status] ?? o.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Archiv */}
      {archived.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Archiv
          </h3>
          <div className="divide-y rounded-xl border bg-white">
            {archived.slice(0, 20).map((o) => (
              <div
                key={o.id}
                onClick={() => nav(`/firma/orders/${o.id}`)}
                className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm hover:bg-slate-50"
              >
                <div>
                  <div className="text-xs text-muted-foreground">{o.code}</div>
                  <div className="font-medium">{o.title}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {o.planned_end_date ? new Date(o.planned_end_date).toLocaleDateString('de-DE') : ''}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[o.status] ?? 'bg-slate-100'}`}>
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
