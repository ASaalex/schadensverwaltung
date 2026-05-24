import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Modal } from '@/components/ui/Modal';
import { DISPO_SIDEBAR } from './sidebar';
import { useOrderDetail } from '@/hooks/useOrderDetail';
import { sendOrder, cancelOrder, acceptOrder, requestRework } from '@/lib/orderActions';
import {
  ArrowLeft,
  Send,
  FileText,
  X,
  CheckCheck,
  RotateCcw,
  PackageCheck,
  Loader2,
  AlertCircle,
  MessageSquare,
  FileBarChart2,
  Files,
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
const POSITION_STATUS_BADGE: Record<string, string> = {
  offen: 'bg-slate-100 text-slate-600',
  bearbeitung: 'bg-amber-100 text-amber-800',
  erledigt: 'bg-emerald-100 text-emerald-800',
  uebersprungen: 'bg-slate-100 text-slate-500',
};
const PRIO_BADGE: Record<string, string> = {
  niedrig: 'bg-slate-100 text-slate-600',
  normal: 'bg-blue-100 text-blue-700',
  hoch: 'bg-orange-100 text-orange-700',
  dringend: 'bg-red-100 text-red-700',
};

export function DispoOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error } = useOrderDetail(id);

  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showReworkPrompt, setShowReworkPrompt] = useState(false);
  const [reworkReason, setReworkReason] = useState('');
  const [pdfChoiceOpen, setPdfChoiceOpen] = useState(false);

  async function runAction(label: string, fn: () => Promise<void>) {
    if (!id) return;
    setBusy(label);
    setActionError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['order-detail', id] });
      await qc.invalidateQueries({ queryKey: ['orders-list'] });
      await qc.invalidateQueries({ queryKey: ['damage-list'] });
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell title="Disposition" subtitle="Auftragsdetail" sidebar={DISPO_SIDEBAR}>
      <Link to="/dispo/orders" className="mb-3 flex items-center gap-1 text-sm text-slate-500">
        <ArrowLeft className="h-4 w-4" /> Zurück zur Liste
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
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[data.status] ?? 'bg-slate-100'}`}>
                  {STATUS_LABEL[data.status]}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-slate-700">
                  {data.assigned_company_name}
                  {data.assigned_company_type === 'internal_bauhof' ? ' (intern)' : ''}
                </span>
                {data.planned_start_date && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-slate-600">
                      {new Date(data.planned_start_date).toLocaleDateString('de-DE')}
                      {data.planned_end_date && data.planned_end_date !== data.planned_start_date &&
                        ' – ' + new Date(data.planned_end_date).toLocaleDateString('de-DE')}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setPdfChoiceOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                title="Druckansicht öffnen"
              >
                <FileText className="h-4 w-4" /> PDF
              </button>

              {data.status === 'entwurf' && (
                <button
                  onClick={() => runAction('send', () => sendOrder(id!))}
                  disabled={!!busy}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Versenden
                </button>
              )}
              {(data.status === 'versendet' || data.status === 'angenommen' || data.status === 'bearbeitung') && (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={!!busy}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <X className="h-4 w-4" /> Stornieren
                </button>
              )}
            </div>
          </div>

          {actionError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {actionError}
            </div>
          )}

          {/* Stornieren-Bestätigung */}
          {showCancelConfirm && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="mb-2 font-medium text-red-900">Auftrag wirklich stornieren?</div>
              <div className="mb-3 text-sm text-red-800">
                Alle {data.positions.length} Schäden gehen wieder zurück auf <strong>geprüft</strong> und können erneut zugewiesen werden.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowCancelConfirm(false);
                    runAction('cancel', () => cancelOrder(id!));
                  }}
                  disabled={!!busy}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                >
                  Ja, stornieren
                </button>
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {/* Abnahme-Block bei fertiggemeldet */}
          {data.status === 'fertiggemeldet' && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
                <PackageCheck className="h-5 w-5 text-amber-700" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-amber-900">Auftrag wurde als fertig gemeldet</div>
                <div className="mt-0.5 text-sm text-amber-800">
                  {data.fertiggemeldet_at &&
                    `Fertig gemeldet am ${new Date(data.fertiggemeldet_at).toLocaleString('de-DE')}. `}
                  Bei keiner Aktion erfolgt die Abnahme automatisch in 7 Tagen.
                </div>
                {!showReworkPrompt ? (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => runAction('accept', () => acceptOrder(id!))}
                      disabled={!!busy}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busy === 'accept' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                      Auftrag abnehmen
                    </button>
                    <button
                      onClick={() => setShowReworkPrompt(true)}
                      disabled={!!busy}
                      className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4" /> Nacharbeit anfordern
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={reworkReason}
                      onChange={(e) => setReworkReason(e.target.value)}
                      rows={2}
                      placeholder="Begründung für Nacharbeit (wird als Kommentar gespeichert)…"
                      className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowReworkPrompt(false);
                          runAction('rework', async () => {
                            await requestRework(id!, reworkReason);
                            setReworkReason('');
                          });
                        }}
                        disabled={!!busy}
                        className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
                      >
                        Nacharbeit anfordern
                      </button>
                      <button
                        onClick={() => { setShowReworkPrompt(false); setReworkReason(''); }}
                        className="rounded-lg border bg-white px-3 py-1.5 text-sm"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Beschreibung */}
          {data.description && (
            <div className="mb-4 rounded-xl border bg-white p-4">
              <div className="mb-1 text-sm font-medium">Beschreibung</div>
              <div className="text-sm text-slate-700">{data.description}</div>
            </div>
          )}

          {/* Kommunikation / Kommentare */}
          {data.comments.length > 0 && (
            <div className="mb-4 rounded-xl border bg-white p-4">
              <div className="mb-3 flex items-center gap-2 font-medium">
                <MessageSquare className="h-4 w-4 text-blue-600" />
                Kommentare &amp; Mitteilungen
                <span className="text-xs font-normal text-muted-foreground">
                  ({data.comments.length})
                </span>
              </div>
              <div className="space-y-2 text-sm">
                {data.comments.map((c) => (
                  <div key={c.id} className="rounded-lg bg-slate-50 p-3">
                    <div className="mb-0.5 text-xs text-muted-foreground">
                      {c.user_name ?? '—'} · {new Date(c.created_at).toLocaleString('de-DE')}
                    </div>
                    <div className="whitespace-pre-wrap text-slate-700">{c.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Positionen */}
          <div className="overflow-hidden rounded-xl border bg-white">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="font-medium">
                Positionen · {data.positions.length} gesamt ·{' '}
                {data.positions.filter((p) => p.status === 'erledigt').length} erledigt
              </div>
            </div>
            <div>
              {data.positions.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">Keine Positionen.</div>
              )}
              {data.positions.map((p) => (
                <div
                  key={p.id}
                  onClick={() => nav(`/dispo/damages/${p.damage_id}`)}
                  className="flex cursor-pointer items-center gap-3 border-b px-4 py-3 hover:bg-slate-50 last:border-b-0"
                >
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                    {p.sort_order}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{p.damage_code}</span>
                      <span className={`rounded-full px-1.5 py-0.5 ${PRIO_BADGE[p.damage_priority] ?? 'bg-slate-100'}`}>
                        {p.damage_priority}
                      </span>
                    </div>
                    <div className="text-sm font-medium">{p.damage_category ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.damage_address || '—'}
                      {p.planned_date && (
                        <> · {new Date(p.planned_date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}</>
                      )}
                      {p.planned_start_time && <> · {p.planned_start_time}{p.planned_end_time ? ` – ${p.planned_end_time}` : ''}</>}
                    </div>
                    {p.company_notes && (
                      <div className="mt-1 text-xs italic text-slate-600">
                        Firma: {p.company_notes}
                      </div>
                    )}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${POSITION_STATUS_BADGE[p.status] ?? 'bg-slate-100'}`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ============ PDF-AUSWAHL-MODAL ============ */}
      <Modal
        open={pdfChoiceOpen}
        onClose={() => setPdfChoiceOpen(false)}
        title="PDF-Ausgabe wählen"
        description="Welche Variante soll erzeugt werden?"
        size="md"
      >
        <div className="space-y-2">
          <button
            onClick={() => {
              setPdfChoiceOpen(false);
              nav(`/dispo/orders/${id}/print?mode=order`);
            }}
            className="flex w-full items-start gap-3 rounded-lg border border-slate-200 p-3 text-left hover:bg-blue-50 hover:border-blue-400"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <FileBarChart2 className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-slate-900">Nur Auftrag</div>
              <div className="text-xs text-slate-500">
                Eine A4-Seite mit Auftragskopf, Stammdaten und der Positionen-Tabelle.
                Schnell zum Ausdrucken oder als Übergabe-Beleg.
              </div>
            </div>
          </button>
          <button
            onClick={() => {
              setPdfChoiceOpen(false);
              nav(`/dispo/orders/${id}/print?mode=full`);
            }}
            className="flex w-full items-start gap-3 rounded-lg border border-slate-200 p-3 text-left hover:bg-blue-50 hover:border-blue-400"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
              <Files className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-slate-900">Auftrag mit Einzelschäden</div>
              <div className="text-xs text-slate-500">
                Auftrags-Übersicht + für jeden Schaden eine eigene A4-Druckansicht mit Fotos,
                Karte, Eigenschaften und Historie. Vollständige Akte für Archiv oder Firma.
              </div>
              {data && (
                <div className="mt-1 text-xs text-slate-400">
                  → {data.positions.length + 1} Seite{data.positions.length === 0 ? '' : 'n'} insgesamt
                </div>
              )}
            </div>
          </button>
        </div>
      </Modal>
    </AppShell>
  );
}
