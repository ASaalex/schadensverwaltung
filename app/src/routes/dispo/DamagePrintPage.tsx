import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDamageDetail } from '@/hooks/useDamageDetail';
import { LeafletMap } from '@/components/map/LeafletMap';
import { ArrowLeft, Printer, FileDown, Construction, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import type { PropertyFieldDef } from '@/types/database';

const STATUS_LABEL: Record<string, string> = {
  neu: 'Neu',
  geprueft: 'Geprüft',
  zugewiesen: 'Zugewiesen',
  bearbeitung: 'In Bearbeitung',
  erledigt: 'Erledigt',
  abgelehnt: 'Abgelehnt',
};
const PRIO_LABEL: Record<string, string> = {
  niedrig: 'Niedrig',
  normal: 'Normal',
  hoch: 'Hoch',
  dringend: 'Dringend',
};

const EVENT_LABEL: Record<string, string> = {
  created: 'Schaden erfasst',
  status_changed: 'Status geändert',
  priority_changed: 'Priorität geändert',
  category_changed: 'Kategorie geändert',
  address_resolved: 'Adresse aufgelöst',
  comment_added: 'Bemerkung hinzugefügt',
  photo_added: 'Foto hinzugefügt',
  geometry_edited: 'Geometrie geändert',
};

export function DispoDamagePrintPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { profile } = useAuth();
  const { data, isLoading, error } = useDamageDetail(id);

  // Page-Title für PDF-Dateiname setzen
  useEffect(() => {
    if (data?.damage.code) {
      const prev = document.title;
      document.title = `Schadensmeldung_${data.damage.code}`;
      return () => { document.title = prev; };
    }
  }, [data]);

  const printDate = new Date().toLocaleString('de-DE');
  const beforePhotos = data?.photos.filter((p) => p.photo_type === 'before') ?? [];
  const afterPhotos = data?.photos.filter((p) => p.photo_type === 'after') ?? [];
  const detailPhotos = data?.photos.filter((p) => p.photo_type === 'detail') ?? [];
  const firstPhoto = beforePhotos[0];
  // Restliche Fotos für Thumbnail-Strip (alle außer erstem)
  const otherPhotos = [...beforePhotos.slice(1), ...afterPhotos, ...detailPhotos];

  const geometryPolygon =
    (data?.damage.geometry as { type?: string; coordinates?: number[][][] } | null)?.type === 'Polygon'
      ? (data!.damage.geometry as { coordinates: number[][][] }).coordinates[0]
      : null;
  const geometryLine =
    (data?.damage.geometry as { type?: string; coordinates?: number[][] } | null)?.type === 'LineString'
      ? (data!.damage.geometry as { coordinates: number[][] }).coordinates
      : null;

  return (
    <>
      {/* Print-CSS */}
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          html, body { background: white !important; }
          body { margin: 0; }
          .no-print { display: none !important; }
          .print-page {
            box-shadow: none !important;
            margin: 0 !important;
          }
          /* Leaflet-Tiles brauchen darstellbar bleiben */
          .leaflet-tile-pane img { display: inline-block !important; }
          /* Vermeide page-breaks innerhalb von Karten/Fotos */
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
        }
        /* Bildschirm-Vorschau imitiert A4 mittels mm-Maßen */
        .print-page {
          width: 210mm;
          min-height: 297mm;
          padding: 18mm 18mm 14mm 18mm;
          background: white;
        }
      `}</style>

      {/* Toolbar — nur am Bildschirm */}
      <div className="no-print sticky top-0 z-50 flex items-center justify-between bg-slate-900 px-4 py-2.5 text-white">
        <button
          onClick={() => nav(`/dispo/damages/${id}`)}
          className="flex items-center gap-1 text-sm hover:text-blue-300"
        >
          <ArrowLeft className="h-4 w-4" /> Zurück zum Detail
        </button>
        <div className="text-xs text-slate-400">
          Druckansicht · Browser-"Drucken" liefert sauberes A4 oder PDF
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-700"
          >
            <Printer className="h-3.5 w-3.5" /> Drucken
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100"
            title="Im Druckdialog ‚Als PDF speichern' wählen"
          >
            <FileDown className="h-3.5 w-3.5" /> Als PDF
          </button>
        </div>
      </div>

      {isLoading && <div className="p-8 text-center text-sm text-muted-foreground">Lade …</div>}
      {error && (
        <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <div className="mx-auto my-6 shadow-lg print-page">
          {/* ============ KOPF ============ */}
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
              <div className="text-xs uppercase tracking-wider text-slate-500">Schadensmeldung</div>
              <div className="font-mono text-2xl font-bold">{data.damage.code}</div>
              <div className="mt-1 text-xs text-slate-500">gedruckt am {printDate}</div>
              {profile?.full_name && (
                <div className="text-xs text-slate-500">durch {profile.full_name}</div>
              )}
            </div>
          </header>

          {/* ============ STATUS-ZEILE ============ */}
          <div className="mt-5 grid grid-cols-4 gap-3 text-sm">
            <KV label="Status" value={STATUS_LABEL[data.damage.status] ?? data.damage.status} />
            <KV label="Priorität" value={PRIO_LABEL[data.damage.priority] ?? data.damage.priority} />
            <KV
              label="Erfasst am"
              value={new Date(data.damage.created_at).toLocaleString('de-DE')}
            />
            <KV label="Erfasst von" value={data.creatorName ?? '—'} />
          </div>

          {/* ============ KATEGORIE + ADRESSE ============ */}
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Kategorie</div>
              <div className="font-medium">{data.categoryPath.join(' › ') || '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Adresse</div>
              <div className="font-medium">
                {[data.damage.address_street, data.damage.address_house_number].filter(Boolean).join(' ') || '—'}
              </div>
              <div className="text-slate-600">
                {[data.damage.address_postal_code, data.damage.address_city].filter(Boolean).join(' ')}
              </div>
              {data.damage.gps_lat != null && data.damage.gps_lng != null && (
                <div className="mt-0.5 text-xs text-slate-500">
                  {data.damage.gps_lat.toFixed(5)}, {data.damage.gps_lng.toFixed(5)}
                  {data.damage.gps_accuracy_m != null && ` · ±${Math.round(data.damage.gps_accuracy_m)} m`}
                </div>
              )}
            </div>
          </div>

          {/* ============ FOTO + KARTE ============ */}
          <div className="avoid-break mt-5 grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-xs uppercase tracking-wider text-slate-500">Foto</div>
              <div className="h-48 overflow-hidden rounded-lg border bg-slate-100">
                {firstPhoto?.url ? (
                  <img src={firstPhoto.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-400">
                    <ImageIcon className="h-10 w-10" />
                  </div>
                )}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs uppercase tracking-wider text-slate-500">Position</div>
              <div className="h-48 overflow-hidden rounded-lg border">
                {data.damage.gps_lat != null && data.damage.gps_lng != null ? (
                  <LeafletMap
                    center={[data.damage.gps_lat, data.damage.gps_lng]}
                    zoom={17}
                    markerPosition={[data.damage.gps_lat, data.damage.gps_lng]}
                    polygon={geometryPolygon}
                    line={geometryLine}
                    zoomable={false}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Keine Position
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ============ EIGENSCHAFTEN ============ */}
          {data.category && data.category.property_schema.length > 0 && (
            <div className="avoid-break mt-5">
              <div className="mb-1 border-b pb-1 text-xs uppercase tracking-wider text-slate-500">
                Eigenschaften
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {data.category.property_schema.map((f: PropertyFieldDef) => {
                    const v = (data.damage.property_values as Record<string, unknown>)[f.name];
                    return (
                      <tr key={f.name}>
                        <td className="w-1/3 py-0.5 text-slate-500">{f.label}</td>
                        <td className="py-0.5 font-medium">{formatValue(v, f)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ============ BEMERKUNG ============ */}
          <div className="avoid-break mt-5">
            <div className="mb-1 border-b pb-1 text-xs uppercase tracking-wider text-slate-500">
              Bemerkung
            </div>
            <div className="whitespace-pre-wrap text-sm">
              {data.damage.description || <span className="text-slate-400">— keine —</span>}
            </div>
            {data.activeOrder?.company_notes && (
              <div className="mt-2 rounded border border-orange-200 bg-orange-50 p-2 text-sm">
                <div className="mb-0.5 text-xs font-medium text-orange-900">
                  Bemerkung der Firma · {data.activeOrder.code}
                </div>
                <div className="whitespace-pre-wrap text-orange-900">{data.activeOrder.company_notes}</div>
              </div>
            )}
          </div>

          {/* ============ WEITERE FOTOS ============ */}
          {otherPhotos.length > 0 && (
            <div className="avoid-break mt-5">
              <div className="mb-2 border-b pb-1 text-xs uppercase tracking-wider text-slate-500">
                Weitere Fotos ({otherPhotos.length})
              </div>
              <div className="grid grid-cols-4 gap-2">
                {otherPhotos.map((p) => (
                  <div
                    key={p.id}
                    className="relative aspect-square overflow-hidden rounded bg-slate-100"
                  >
                    {p.url ? (
                      <img src={p.url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-400">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                    )}
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 text-center text-[10px] text-white">
                      {p.photo_type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============ HISTORIE ============ */}
          {data.history.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 border-b pb-1 text-xs uppercase tracking-wider text-slate-500">
                Historie ({data.history.length})
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {data.history.map((h) => (
                    <tr key={h.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="w-40 py-1 text-slate-500">
                        {new Date(h.created_at).toLocaleString('de-DE')}
                      </td>
                      <td className="py-1">
                        {EVENT_LABEL[h.event_type] ?? h.event_type}
                        <PayloadHint payload={h.payload} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ============ FUSSZEILE ============ */}
          <footer className="mt-8 flex justify-between border-t pt-3 text-xs text-slate-500">
            <span>Schadensverwaltung Bauhof Erfurt · vertraulich</span>
            <span>{data.damage.code} · gedruckt {printDate}</span>
          </footer>
        </div>
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

function PayloadHint({ payload }: { payload: Record<string, unknown> }) {
  if (!payload || Object.keys(payload).length === 0) return null;
  const parts: string[] = [];
  if (payload.from && payload.to) parts.push(`${payload.from} → ${payload.to}`);
  else if (payload.status) parts.push(String(payload.status));
  else if (payload.street || payload.city)
    parts.push([payload.street, payload.city].filter(Boolean).join(', '));
  if (parts.length === 0) return null;
  return <span className="ml-1 text-slate-500">· {parts.join(' · ')}</span>;
}

function formatValue(v: unknown, f: PropertyFieldDef): string {
  if (v === null || v === undefined || v === '') return '—';
  if (f.field_type === 'boolean') return v ? 'Ja' : 'Nein';
  if (f.field_type === 'date') return new Date(String(v)).toLocaleDateString('de-DE');
  const base = String(v);
  return f.unit ? `${base} ${f.unit}` : base;
}
