import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { useOrderDetail } from '@/hooks/useOrderDetail';
import { fetchDamageDetail, type DamageDetail } from '@/hooks/useDamageDetail';
import { DamagePrintCard } from '@/components/print/DamagePrintCard';
import { ArrowLeft, Printer, FileDown, Construction, Loader2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';

const ORDER_STATUS_LABEL: Record<string, string> = {
  entwurf: 'Entwurf',
  versendet: 'Versendet',
  angenommen: 'Angenommen',
  bearbeitung: 'In Bearbeitung',
  fertiggemeldet: 'Fertiggemeldet',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
};
const POSITION_STATUS_LABEL: Record<string, string> = {
  offen: 'Offen',
  bearbeitung: 'In Arbeit',
  erledigt: 'Erledigt',
  uebersprungen: 'Übersprungen',
};

export function DispoOrderPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') === 'full' ? 'full' : 'order';
  const nav = useNavigate();
  const { profile } = useAuth();
  const { data: order, isLoading, error } = useOrderDetail(id);

  // Im "full"-Modus die Schadens-Details aller Positionen parallel laden
  const damageIds = mode === 'full' && order ? order.positions.map((p) => p.damage_id) : [];
  const damageQueries = useQueries({
    queries: damageIds.map((did) => ({
      queryKey: ['damage-detail', did],
      queryFn: () => fetchDamageDetail(did),
      enabled: mode === 'full',
    })),
  });
  const damagesLoading = damageQueries.some((q) => q.isLoading);
  const damageDetails = damageQueries
    .map((q) => q.data)
    .filter((d): d is DamageDetail => !!d);

  useEffect(() => {
    if (order?.code) {
      const prev = document.title;
      document.title = `Auftrag_${order.code}${mode === 'full' ? '_mit_Schaeden' : ''}`;
      return () => { document.title = prev; };
    }
  }, [order, mode]);

  const printDate = new Date().toLocaleString('de-DE');

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          html, body { background: white !important; }
          body { margin: 0; }
          .no-print { display: none !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; }
          .leaflet-tile-pane img { display: inline-block !important; }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
          .break-before-page { break-before: page; page-break-before: always; }
        }
        .print-page {
          width: 210mm;
          min-height: 297mm;
          padding: 18mm 18mm 14mm 18mm;
          background: white;
        }
      `}</style>

      <div className="no-print sticky top-0 z-50 flex items-center justify-between bg-slate-900 px-4 py-2.5 text-white">
        <button
          onClick={() => nav(`/dispo/orders/${id}`)}
          className="flex items-center gap-1 text-sm hover:text-blue-300"
        >
          <ArrowLeft className="h-4 w-4" /> Zurück zum Auftrag
        </button>
        <div className="text-xs text-slate-400">
          {mode === 'full' ? 'Auftrag inkl. Einzelschäden' : 'Nur Auftrag'} ·
          Browser-"Drucken" liefert A4 oder PDF
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            disabled={damagesLoading}
            className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {damagesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
            Drucken
          </button>
          <button
            onClick={() => window.print()}
            disabled={damagesLoading}
            className="flex items-center gap-1.5 rounded bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-50"
            title="Im Druckdialog ‚Als PDF speichern' wählen"
          >
            <FileDown className="h-3.5 w-3.5" /> Als PDF
          </button>
        </div>
      </div>

      {isLoading && <div className="p-8 text-center text-sm text-muted-foreground">Lade Auftrag …</div>}
      {error && (
        <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(error as Error).message}
        </div>
      )}

      {order && (
        <>
          {/* ============ A4-Seite: AUFTRAG ============ */}
          <div className="mx-auto my-6 shadow-lg print-page">
            <header className="flex items-start justify-between border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-blue-600">
                  <Construction className="h-7 w-7 text-white" />
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-900">Bauhof Erfurt</div>
                  <div className="text-xs text-slate-500">Stadt Erfurt · Schadensverwaltung</div>
                  <div className="text-xs text-slate-500">Fischmarkt 1, 99084 Erfurt</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wider text-slate-500">Auftrag</div>
                <div className="font-mono text-2xl font-bold">{order.code}</div>
                <div className="mt-1 text-xs text-slate-500">gedruckt am {printDate}</div>
                {profile?.full_name && (
                  <div className="text-xs text-slate-500">durch {profile.full_name}</div>
                )}
              </div>
            </header>

            <h1 className="mt-5 text-2xl font-semibold">{order.title}</h1>
            {order.description && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{order.description}</p>
            )}

            <div className="mt-5 grid grid-cols-4 gap-3 text-sm">
              <KV label="Status" value={ORDER_STATUS_LABEL[order.status] ?? order.status} />
              <KV
                label="Ausführende Firma"
                value={`${order.assigned_company_name ?? '—'}${order.assigned_company_type === 'internal_bauhof' ? ' (intern)' : ''}`}
              />
              <KV
                label="Zeitraum"
                value={
                  order.planned_start_date
                    ? new Date(order.planned_start_date).toLocaleDateString('de-DE') +
                      (order.planned_end_date && order.planned_end_date !== order.planned_start_date
                        ? ' – ' + new Date(order.planned_end_date).toLocaleDateString('de-DE')
                        : '')
                    : '—'
                }
              />
              <KV label="Angelegt" value={new Date(order.created_at).toLocaleDateString('de-DE')} />
            </div>

            {/* Positionen-Tabelle */}
            <div className="mt-6">
              <div className="mb-2 border-b pb-1 text-xs uppercase tracking-wider text-slate-500">
                Positionen ({order.positions.length})
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wider text-slate-500">
                    <th className="w-10 py-1.5 text-left">#</th>
                    <th className="py-1.5 text-left">Schaden</th>
                    <th className="py-1.5 text-left">Kategorie</th>
                    <th className="py-1.5 text-left">Adresse</th>
                    <th className="py-1.5 text-left">Termin</th>
                    <th className="py-1.5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {order.positions.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 align-top">
                      <td className="py-1.5">{p.sort_order}</td>
                      <td className="py-1.5 font-mono text-xs">{p.damage_code}</td>
                      <td className="py-1.5">{p.damage_category ?? '—'}</td>
                      <td className="py-1.5 text-slate-600">{p.damage_address || '—'}</td>
                      <td className="py-1.5 text-slate-600">
                        {p.planned_date && new Date(p.planned_date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                        {p.planned_start_time && (
                          <> · {p.planned_start_time}{p.planned_end_time ? ` – ${p.planned_end_time}` : ''}</>
                        )}
                        {!p.planned_date && !p.planned_start_time && '—'}
                      </td>
                      <td className="py-1.5">{POSITION_STATUS_LABEL[p.status] ?? p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Kommentare */}
            {order.comments.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 border-b pb-1 text-xs uppercase tracking-wider text-slate-500">
                  Kommentare
                </div>
                <div className="space-y-2 text-sm">
                  {order.comments.map((c) => (
                    <div key={c.id} className="rounded bg-slate-50 p-2">
                      <div className="text-xs text-slate-500">
                        {c.user_name ?? '—'} · {new Date(c.created_at).toLocaleString('de-DE')}
                      </div>
                      <div className="whitespace-pre-wrap">{c.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <footer className="mt-8 flex justify-between border-t pt-3 text-xs text-slate-500">
              <span>Schadensverwaltung Bauhof Erfurt · vertraulich</span>
              <span>{order.code} · {printDate}</span>
            </footer>
          </div>

          {/* ============ A4-Seiten: EINZELSCHÄDEN (nur im "full"-Modus) ============ */}
          {mode === 'full' && (
            <>
              {damagesLoading && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Lade Schadens-Details ({damageDetails.length} / {damageIds.length}) …
                </div>
              )}
              {order.positions.map((p) => {
                const detail = damageDetails.find((d) => d.damage.id === p.damage_id);
                if (!detail) return null;
                return (
                  <DamagePrintCard
                    key={p.damage_id}
                    data={detail}
                    printDate={printDate}
                    authorName={profile?.full_name ?? null}
                    standalone={false}
                  />
                );
              })}
            </>
          )}
        </>
      )}
    </>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
