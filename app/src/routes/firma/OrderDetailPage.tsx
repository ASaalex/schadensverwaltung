import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { useOrderDetail, type OrderPosition } from '@/hooks/useOrderDetail';
import { takeOrder, reportOrderFinished } from '@/lib/orderActions';
import {
  ArrowLeft,
  CheckCheck,
  ChevronRight,
  Loader2,
  AlertCircle,
  Image as ImageIcon,
  Calendar,
  Send,
} from 'lucide-react';

const POSITION_STATUS_BADGE: Record<string, string> = {
  offen: 'bg-slate-100 text-slate-600',
  bearbeitung: 'bg-amber-100 text-amber-800',
  erledigt: 'bg-emerald-100 text-emerald-800',
  uebersprungen: 'bg-slate-100 text-slate-500',
};
const POSITION_STATUS_LABEL: Record<string, string> = {
  offen: 'Offen',
  bearbeitung: 'In Arbeit',
  erledigt: 'Erledigt',
  uebersprungen: 'Übersprungen',
};
const ORDER_STATUS_BADGE: Record<string, string> = {
  versendet: 'bg-cyan-100 text-cyan-800',
  angenommen: 'bg-indigo-100 text-indigo-800',
  bearbeitung: 'bg-amber-100 text-amber-800',
  fertiggemeldet: 'bg-orange-100 text-orange-800',
  abgeschlossen: 'bg-emerald-100 text-emerald-800',
  storniert: 'bg-red-100 text-red-700',
};
const ORDER_STATUS_LABEL: Record<string, string> = {
  versendet: 'Neu',
  angenommen: 'Angenommen',
  bearbeitung: 'In Bearbeitung',
  fertiggemeldet: 'Fertig gemeldet',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
};

export function FirmaOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error } = useOrderDetail(id);

  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function runAction(label: string, fn: () => Promise<void>) {
    if (!id) return;
    setBusy(label);
    setActionError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['order-detail', id] });
      await qc.invalidateQueries({ queryKey: ['orders-list'] });
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const done = data?.positions.filter((p) => p.status === 'erledigt' || p.status === 'uebersprungen').length ?? 0;
  const total = data?.positions.length ?? 0;
  const allDone = total > 0 && done === total;

  const canTake = data?.status === 'versendet';
  const canReport = data && ['versendet', 'angenommen', 'bearbeitung'].includes(data.status);
  const isReadonly = data && ['fertiggemeldet', 'abgeschlossen', 'storniert'].includes(data.status);

  return (
    <AppShell title="Firmenportal" subtitle="Auftrag" accent="orange">
      <Link to="/firma/orders" className="mb-3 flex items-center gap-1 text-sm text-slate-500">
        <ArrowLeft className="h-4 w-4" /> Zurück zu meinen Aufträgen
      </Link>

      {isLoading && <div className="text-sm text-muted-foreground">Lade …</div>}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <>
          {/* Header */}
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground">{data.code}</div>
              <h1 className="text-2xl font-semibold">{data.title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs ${ORDER_STATUS_BADGE[data.status] ?? 'bg-slate-100'}`}>
                  {ORDER_STATUS_LABEL[data.status] ?? data.status}
                </span>
                {data.planned_start_date && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(data.planned_start_date).toLocaleDateString('de-DE')}
                    {data.planned_end_date && data.planned_end_date !== data.planned_start_date &&
                      ' – ' + new Date(data.planned_end_date).toLocaleDateString('de-DE')}
                  </span>
                )}
              </div>
            </div>
            {canTake && (
              <button
                onClick={() => runAction('take', () => takeOrder(id!))}
                disabled={!!busy}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy === 'take' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                Auftrag annehmen
              </button>
            )}
          </div>

          {actionError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {actionError}
            </div>
          )}

          {data.description && (
            <div className="mb-4 rounded-xl border bg-white p-4">
              <div className="mb-1 text-sm font-medium">Beschreibung</div>
              <div className="text-sm text-slate-700">{data.description}</div>
            </div>
          )}

          {/* Positionen */}
          <div className="overflow-hidden rounded-xl border bg-white">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="font-medium">
                Arbeitsliste · {total} Position{total === 1 ? '' : 'en'} · {done} erledigt
              </div>
              <div className="text-xs text-muted-foreground">Reihenfolge vorgegeben</div>
            </div>
            {data.positions.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">Keine Positionen.</div>
            )}
            {data.positions.map((p) => {
              const clickable = !isReadonly;
              return (
                <div
                  key={p.id}
                  onClick={() => clickable && nav(`/firma/orders/${id}/positions/${p.id}`)}
                  className={`flex items-center gap-3 border-b px-4 py-3 last:border-b-0 ${
                    clickable ? 'cursor-pointer hover:bg-orange-50' : 'opacity-75'
                  }`}
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                    {p.sort_order}
                  </div>
                  <PhotoThumb position={p} />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-muted-foreground">{p.damage_code}</div>
                    <div className="text-sm font-medium">{p.damage_category ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.damage_address || '—'}
                      {p.planned_date && (
                        <> · {new Date(p.planned_date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}</>
                      )}
                      {p.planned_start_time && <> · {p.planned_start_time}{p.planned_end_time ? ` – ${p.planned_end_time}` : ''}</>}
                    </div>
                    {p.company_notes && (
                      <div className="mt-1 text-xs italic text-slate-600">{p.company_notes}</div>
                    )}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${POSITION_STATUS_BADGE[p.status] ?? 'bg-slate-100'}`}>
                    {POSITION_STATUS_LABEL[p.status] ?? p.status}
                  </span>
                  {clickable && <ChevronRight className="h-4 w-4 text-slate-400" />}
                </div>
              );
            })}
          </div>

          {/* Chats finden pro Schaden statt — siehe Position öffnen */}
          <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">
            💬 Die Kommunikation mit der Disposition erfolgt jetzt pro Schaden. Tippe auf eine
            Position oben, um den Chat zu öffnen.
          </div>

          {/* Fertig-melden-Button */}
          {canReport && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => runAction('report', () => reportOrderFinished(id!))}
                disabled={!!busy || !allDone}
                title={
                  !allDone
                    ? `Erst wenn alle ${total} Positionen erledigt oder übersprungen sind`
                    : 'Auftrag als fertig melden'
                }
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy === 'report' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Auftrag fertig melden
                {!allDone && total > 0 && ` (${total - done} offen)`}
              </button>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

function PhotoThumb({ position }: { position: OrderPosition }) {
  const before = position.photos.filter((p) => p.photo_type === 'before');
  const after = position.photos.filter((p) => p.photo_type === 'after');
  // Vor-Foto bevorzugt als Thumbnail; falls keins, dann Nach-Foto
  const first = before[0] ?? after[0];
  return (
    <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
      {first?.url ? (
        <img src={first.url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-slate-400">
          <ImageIcon className="h-4 w-4" />
        </div>
      )}
      {after.length > 0 && (
        <span className="absolute right-0 top-0 rounded-bl bg-emerald-600 px-1 text-[10px] font-medium text-white">
          ✓{after.length}
        </span>
      )}
    </div>
  );
}
