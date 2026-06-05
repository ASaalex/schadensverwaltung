import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Modal } from '@/components/ui/Modal';
import { DISPO_SIDEBAR } from './sidebar';
import { useDamageDetail } from '@/hooks/useDamageDetail';
import { LeafletMap } from '@/components/map/LeafletMap';
import { deleteDamage } from '@/lib/deleteDamage';
import { DamageChat } from '@/components/chat/DamageChat';
import {
  ArrowLeft,
  Image as ImageIcon,
  Sliders,
  Plus,
  Tag,
  Edit3,
  Printer,
  PackagePlus,
  ArrowUp,
  MessageSquare,
  Shapes,
  Globe,
  Trash2,
  Loader2,
  Navigation,
  Ruler,
  Route,
  Box,
} from 'lucide-react';
import { formatStationAsb } from '@/lib/networkReferencing';
import { useNetworkObjects } from '@/hooks/useNetworkObjects';
import { useNetworkObjectTypes } from '@/hooks/useNetworkObjectTypes';
import { lineLength, polygonArea, formatLength, formatArea } from '@/lib/geoMeasure';
import type { LucideIcon } from 'lucide-react';
import type { DamageHistoryEvent } from '@/hooks/useDamageDetail';
import type { PropertyFieldDef } from '@/types/database';

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

const EVENT_META: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  created: { icon: Plus, color: '#3b82f6', label: 'Schaden erfasst' },
  status_changed: { icon: Edit3, color: '#f97316', label: 'Status geändert' },
  priority_changed: { icon: ArrowUp, color: '#f97316', label: 'Priorität geändert' },
  category_changed: { icon: Tag, color: '#6366f1', label: 'Kategorie geändert' },
  address_resolved: { icon: Globe, color: '#64748b', label: 'Adresse aufgelöst' },
  comment_added: { icon: MessageSquare, color: '#3b82f6', label: 'Bemerkung hinzugefügt' },
  photo_added: { icon: ImageIcon, color: '#3b82f6', label: 'Foto hinzugefügt' },
  geometry_edited: { icon: Shapes, color: '#3b82f6', label: 'Geometrie geändert' },
};

export function DispoDamageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error } = useDamageDetail(id);
  const { query: objQuery }     = useNetworkObjects();
  const { query: objTypeQuery } = useNetworkObjectTypes();
  const linkedObject = objQuery.data?.find((o) => o.id === data?.damage.network_object_id) ?? null;
  const linkedObjType = objTypeQuery.data?.find((t) => t.id === linkedObject?.object_type_id) ?? null;
  const canBundle =
    (data?.damage.status === 'neu' || data?.damage.status === 'geprueft') && !data?.activeOrder;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteDamage(id);
      await qc.invalidateQueries({ queryKey: ['damage-list'] });
      nav('/dispo/damages', { replace: true });
    } catch (e) {
      setDeleteError((e as Error).message);
      setDeleting(false);
    }
  }

  return (
    <AppShell title="Disposition" subtitle="Schadendetail" sidebar={DISPO_SIDEBAR}>
      <Link to="/dispo/damages" className="mb-3 flex items-center gap-1 text-sm text-slate-500">
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
              <div className="text-xs text-muted-foreground">{data.damage.code}</div>
              <h1 className="text-2xl font-semibold">
                {data.categoryPath[data.categoryPath.length - 1] ?? 'Schaden'}
                {data.damage.address_street && ` · ${data.damage.address_street}`}
                {data.damage.address_house_number && ` ${data.damage.address_house_number}`}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[data.damage.status] ?? 'bg-slate-100'}`}>
                  {data.damage.status}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${PRIO_BADGE[data.damage.priority] ?? 'bg-slate-100'}`}>
                  {data.damage.priority}
                </span>
                {data.categoryPath.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {data.categoryPath.join(' › ')}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                to={`/dispo/damages/${id}/print`}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
                title="Druckansicht öffnen"
              >
                <Printer className="h-4 w-4" /> Drucken
              </Link>
              <button
                onClick={() => id && nav('/dispo/orders/new', { state: { damageIds: [id] } })}
                disabled={!canBundle}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                title={canBundle ? 'Neuen Auftrag mit diesem Schaden erstellen' : 'Schaden bereits zugewiesen oder erledigt'}
              >
                <PackagePlus className="h-4 w-4" /> In Auftrag bündeln
              </button>
              <button
                onClick={() => { setDeleteError(null); setDeleteOpen(true); }}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                title="Schaden inkl. Fotos löschen"
              >
                <Trash2 className="h-4 w-4" /> Löschen
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* LINKE SPALTE (2/3) */}
            <div className="space-y-4 lg:col-span-2">
              {/* Fotos */}
              <div className="rounded-xl border bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium">
                    Fotos
                    <span className="text-xs font-normal text-muted-foreground">
                      {data.photos.length} insgesamt
                    </span>
                  </div>
                </div>
                {data.photos.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Keine Fotos vorhanden.</div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {data.photos.map((p) => (
                      <a
                        key={p.id}
                        href={p.url ?? '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="relative aspect-square overflow-hidden rounded-lg bg-slate-100 hover:opacity-90"
                      >
                        {p.url ? (
                          <img src={p.url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-slate-400">
                            <ImageIcon className="h-6 w-6" />
                          </div>
                        )}
                        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
                          {p.photo_type}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Eigenschaften */}
              {data.category && data.category.property_schema.length > 0 && (
                <div className="rounded-xl border bg-white p-4">
                  <div className="mb-3 flex items-center gap-2 font-medium">
                    <Sliders className="h-4 w-4 text-blue-600" />
                    Eigenschaften
                    <span className="text-xs font-normal text-muted-foreground">
                      aus Kategorie "{data.category.name}"
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    {data.category.property_schema.map((f: PropertyFieldDef) => {
                      const v = (data.damage.property_values as Record<string, unknown>)[f.name];
                      return (
                        <div key={f.name} className="flex justify-between border-b py-1 last:border-b-0">
                          <span className="text-muted-foreground">{f.label}</span>
                          <span className="font-medium">{formatValue(v, f)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bemerkung der Firma zur Position */}
              {data.activeOrder?.company_notes && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-sm font-medium text-orange-900">
                    Bemerkung der Firma zur Position
                    <span className="text-xs font-normal text-orange-700">
                      in {data.activeOrder.code} · Position-Status: {data.activeOrder.position_status}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-orange-900">
                    {data.activeOrder.company_notes}
                  </div>
                </div>
              )}

              {/* Chat zum Schaden */}
              {id && <DamageChat damageId={id} title="Chat zum Schaden" accent="blue" />}

              {/* Bemerkung vom Erfasser */}
              <div className="rounded-xl border bg-white p-4">
                <div className="mb-2 font-medium">Bemerkung (Erfasser)</div>
                <div className="text-sm text-slate-600">
                  {data.damage.description || <span className="text-muted-foreground">— keine —</span>}
                </div>
              </div>

              {/* Historie — Events + Kommentare zeitlich gemischt */}
              <div className="rounded-xl border bg-white p-4">
                <div className="mb-3 font-medium">Historie</div>
                <div className="space-y-3">
                  {(() => {
                    type TimelineItem = (
                      | { kind: 'event'; created_at: string; event: DamageHistoryEvent }
                      | { kind: 'comment'; created_at: string; comment: typeof data.comments[number] }
                    );
                    const items: TimelineItem[] = [
                      ...data.history.map((e) => ({ kind: 'event' as const, created_at: e.created_at, event: e })),
                      ...data.comments.map((c) => ({ kind: 'comment' as const, created_at: c.created_at, comment: c })),
                    ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

                    if (items.length === 0) {
                      return <div className="text-sm text-muted-foreground">Keine Events.</div>;
                    }

                    return items.map((item) => {
                      if (item.kind === 'event') {
                        const h = item.event;
                        const meta = EVENT_META[h.event_type] ?? {
                          icon: Plus,
                          color: '#64748b',
                          label: h.event_type,
                        };
                        const Icon = meta.icon;
                        return (
                          <div key={`e-${h.id}`} className="flex gap-3">
                            <div
                              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
                              style={{ background: meta.color + '20' }}
                            >
                              <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs text-muted-foreground">
                                {new Date(h.created_at).toLocaleString('de-DE')}
                              </div>
                              <div className="text-sm">
                                <span className="font-medium">{meta.label}</span>
                                <PayloadHint payload={h.payload} />
                              </div>
                            </div>
                          </div>
                        );
                      }
                      // Kommentar
                      const c = item.comment;
                      return (
                        <div key={`c-${c.id}`} className="flex gap-3">
                          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                            <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-muted-foreground">
                              {new Date(c.created_at).toLocaleString('de-DE')}
                              {c.user_name && ` · ${c.user_name}`}
                            </div>
                            <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-sm text-slate-700">
                              {c.message}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>

            {/* RECHTE SPALTE (1/3) */}
            <div className="space-y-4">
              {/* Karte */}
              <div className="overflow-hidden rounded-xl border bg-white">
                {data.damage.gps_lat != null && data.damage.gps_lng != null ? (
                  <div className="h-56">
                    <LeafletMap
                      center={[data.damage.gps_lat, data.damage.gps_lng]}
                      zoom={17}
                      markerPosition={[data.damage.gps_lat, data.damage.gps_lng]}
                      polygon={
                        (data.damage.geometry as { type?: string; coordinates?: number[][][] } | null)
                          ?.type === 'Polygon'
                          ? (data.damage.geometry as { coordinates: number[][][] }).coordinates[0]
                          : null
                      }
                      line={
                        (data.damage.geometry as { type?: string; coordinates?: number[][] } | null)
                          ?.type === 'LineString'
                          ? (data.damage.geometry as { coordinates: number[][] }).coordinates
                          : null
                      }
                    />
                  </div>
                ) : (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                    Keine Position
                  </div>
                )}
                <div className="p-3 text-sm">
                  {data.damage.address_street && (
                    <div className="font-medium">
                      {data.damage.address_street}
                      {data.damage.address_house_number && ` ${data.damage.address_house_number}`}
                    </div>
                  )}
                  {data.damage.address_city && (
                    <div className="text-muted-foreground">
                      {data.damage.address_postal_code} {data.damage.address_city}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {data.damage.gps_lat?.toFixed(5)}, {data.damage.gps_lng?.toFixed(5)}
                    {data.damage.gps_accuracy_m != null &&
                      ` · ±${Math.round(data.damage.gps_accuracy_m)} m`}
                  </div>

                  {/* Längen-/Flächen-Messung bei Linie/Polygon */}
                  {(() => {
                    const geom = data.damage.geometry as
                      | { type?: string; coordinates?: number[][] | number[][][] }
                      | null;
                    if (!geom) return null;
                    if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
                      const coords = geom.coordinates as number[][];
                      if (coords.length < 2) return null;
                      return (
                        <div className="mt-2 flex items-center gap-1.5 rounded bg-orange-50 px-2 py-1 text-xs text-orange-900">
                          <Ruler className="h-3 w-3 text-orange-600" />
                          <span className="font-medium">Länge:</span>
                          <span>{formatLength(lineLength(coords))}</span>
                          <span className="ml-auto text-[10px] text-slate-500">{coords.length} Punkte</span>
                        </div>
                      );
                    }
                    if (geom.type === 'Polygon' && Array.isArray(geom.coordinates)) {
                      const coords = (geom.coordinates as number[][][])[0];
                      if (!coords || coords.length < 3) return null;
                      return (
                        <div className="mt-2 rounded bg-orange-50 px-2 py-1 text-xs text-orange-900">
                          <div className="flex items-center gap-1.5">
                            <Ruler className="h-3 w-3 text-orange-600" />
                            <span className="font-medium">Fläche:</span>
                            <span>{formatArea(polygonArea(coords))}</span>
                            <span className="ml-auto text-[10px] text-slate-500">{coords.length} Punkte</span>
                          </div>
                          <div className="mt-0.5 pl-4 text-[11px]">
                            Umfang: {formatLength(lineLength([...coords, coords[0]]))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* ── ASB-Netzreferenz ── */}
                  {data.netzSegment ? (
                    <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-sky-700">
                        <Route className="h-3.5 w-3.5" /> Netzreferenz (ASB)
                      </div>
                      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                        <span className="text-sky-600">Von Netzknoten</span>
                        <span className="font-mono font-medium text-sky-900">{data.netzSegment.from_node}</span>
                        <span className="text-sky-600">Nach Netzknoten</span>
                        <span className="font-mono font-medium text-sky-900">{data.netzSegment.to_node}</span>
                        {data.damage.netz_station_m != null && (
                          <>
                            <span className="text-sky-600">Station</span>
                            <span className="font-mono font-medium text-sky-900">
                              {formatStationAsb(data.damage.netz_station_m)} m
                            </span>
                          </>
                        )}
                        {data.damage.netz_abstand_m != null && (
                          <>
                            <span className="text-sky-600">Lotabstand</span>
                            <span className="font-mono font-medium text-sky-900">
                              {data.damage.netz_abstand_m.toFixed(1)} m
                            </span>
                          </>
                        )}
                      </div>
                      {data.netzSegment.strassen_klasse_asb && (
                        <div className="mt-1.5 text-[11px] text-sky-600">
                          {data.netzSegment.strassen_klasse_asb}
                          {data.netzSegment.strassen_nummer && ` ${data.netzSegment.strassen_nummer}`}
                          {data.netzSegment.abschnitts_nummer && ` · Abschn. ${data.netzSegment.abschnitts_nummer}`}
                          {data.netzSegment.ast_nummer && data.netzSegment.ast_nummer !== '0' && `/${data.netzSegment.ast_nummer}`}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400">
                      <Route className="mb-0.5 inline h-3.5 w-3.5" /> Kein Netzbezug
                    </div>
                  )}

                  {/* ── Netz-Objekt ── */}
                  {linkedObject ? (
                    <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                          <Box className="h-3.5 w-3.5" /> Netz-Objekt
                        </div>
                        <Link to={`/dispo/objects/${linkedObject.id}/history`}
                          className="text-[11px] text-violet-600 underline hover:text-violet-800">
                          Objekt-Historie →
                        </Link>
                      </div>
                      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                        {linkedObjType && (
                          <>
                            <span className="text-violet-600">Typ</span>
                            <span className="flex items-center gap-1.5 font-medium text-violet-900">
                              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: linkedObjType.color }} />
                              {linkedObjType.name}
                            </span>
                          </>
                        )}
                        {linkedObject.name && (
                          <>
                            <span className="text-violet-600">Bezeichnung</span>
                            <span className="font-medium text-violet-900">{linkedObject.name}</span>
                          </>
                        )}
                        {linkedObject.identifier && (
                          <>
                            <span className="text-violet-600">Kennung</span>
                            <span className="font-mono font-medium text-violet-900">{linkedObject.identifier}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400">
                      <Box className="mb-0.5 inline h-3.5 w-3.5" /> Kein Objektbezug
                    </div>
                  )}

                  {/* Navi-Button */}
                  {data.damage.gps_lat != null && data.damage.gps_lng != null && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${data.damage.gps_lat},${data.damage.gps_lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      <Navigation className="h-4 w-4" /> In Navi öffnen
                    </a>
                  )}
                </div>
              </div>

              {/* Meta */}
              <div className="space-y-2 rounded-xl border bg-white p-4 text-sm">
                <Row label="Kategorie" value={data.categoryPath.join(' › ') || '—'} />
                <Row label="Geometrie-Typ" value={data.category?.geometry_type ?? '—'} />
                <Row label="Erfasst von" value={data.creatorName ?? '—'} />
                <Row label="Erfasst am" value={new Date(data.damage.created_at).toLocaleString('de-DE')} />
                <Row
                  label="Auftrag"
                  value={
                    data.activeOrder ? (
                      <Link
                        to={`/dispo/orders/${data.activeOrder.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {data.activeOrder.code}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({data.activeOrder.status})
                        </span>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">— noch keiner —</span>
                    )
                  }
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ============ LÖSCH-BESTÄTIGUNG ============ */}
      <Modal open={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)} title="Schaden löschen" size="md">
        <div className="space-y-3">
          {deleteError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {deleteError}
            </div>
          )}
          <p className="text-sm">
            Willst du <strong>{data?.damage.code}</strong> wirklich löschen?
          </p>
          <ul className="ml-4 list-disc text-sm text-slate-600">
            <li>Alle {data?.photos.length ?? 0} Foto(s) werden aus dem Storage entfernt</li>
            <li>Historie + Auftragspositionen (sofern Auftrag storniert/abgeschlossen) gehen mit</li>
            <li>Diese Aktion ist <strong>nicht rückgängig</strong> machbar</li>
          </ul>
          <p className="text-xs text-amber-700">
            Hinweis: Wenn der Schaden in einem aktiven Auftrag liegt, lässt sich der Schaden nicht
            löschen — storniere zuerst den Auftrag.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
              className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50"
            >
              Abbrechen
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Endgültig löschen
            </button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function PayloadHint({ payload }: { payload: Record<string, unknown> }) {
  if (!payload || Object.keys(payload).length === 0) return null;
  const parts: string[] = [];
  if (payload.from && payload.to) parts.push(`${payload.from} → ${payload.to}`);
  else if (payload.status) parts.push(String(payload.status));
  else if (payload.street || payload.city)
    parts.push([payload.street, payload.city].filter(Boolean).join(', '));
  if (parts.length === 0) return null;
  return <span className="ml-1 text-muted-foreground">· {parts.join(' · ')}</span>;
}

function formatValue(v: unknown, f: PropertyFieldDef): string {
  if (v === null || v === undefined || v === '') return '—';
  if (f.field_type === 'boolean') return v ? 'Ja' : 'Nein';
  if (f.field_type === 'date') return new Date(String(v)).toLocaleDateString('de-DE');
  const base = String(v);
  return f.unit ? `${base} ${f.unit}` : base;
}
