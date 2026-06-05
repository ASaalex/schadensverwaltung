import { LeafletMap } from '@/components/map/LeafletMap';
import { Construction, Image as ImageIcon } from 'lucide-react';
import type { DamageDetail } from '@/hooks/useDamageDetail';
import type { PropertyFieldDef } from '@/types/database';
import { lineLength, polygonArea, formatLength, formatArea } from '@/lib/geoMeasure';
import { formatStationAsb } from '@/lib/networkReferencing';

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

interface Props {
  data: DamageDetail;
  printDate?: string;
  authorName?: string | null;
  /** A4-Seite mit eigenem Briefkopf? Wenn false (z.B. innerhalb Auftrags-PDF):
   *  kleinerer Header ohne Logo, kompakteres Layout, eigene Page mit page-break */
  standalone?: boolean;
}

export function DamagePrintCard({ data, printDate, authorName, standalone = true }: Props) {
  const dt = printDate ?? new Date().toLocaleString('de-DE');
  const beforePhotos = data.photos.filter((p) => p.photo_type === 'before');
  const afterPhotos = data.photos.filter((p) => p.photo_type === 'after');
  const detailPhotos = data.photos.filter((p) => p.photo_type === 'detail');
  const firstPhoto = beforePhotos[0];
  const otherPhotos = [...beforePhotos.slice(1), ...afterPhotos, ...detailPhotos];

  const geometryPolygon =
    (data.damage.geometry as { type?: string; coordinates?: number[][][] } | null)?.type === 'Polygon'
      ? (data.damage.geometry as { coordinates: number[][][] }).coordinates[0]
      : null;
  const geometryLine =
    (data.damage.geometry as { type?: string; coordinates?: number[][] } | null)?.type === 'LineString'
      ? (data.damage.geometry as { coordinates: number[][] }).coordinates
      : null;

  const geometryMeasure = (() => {
    if (geometryLine && geometryLine.length >= 2) {
      return `Länge: ${formatLength(lineLength(geometryLine))} (${geometryLine.length} Punkte)`;
    }
    if (geometryPolygon && geometryPolygon.length >= 3) {
      return `Fläche: ${formatArea(polygonArea(geometryPolygon))} · Umfang: ${formatLength(lineLength([...geometryPolygon, geometryPolygon[0]]))}`;
    }
    return null;
  })();

  return (
    <div
      className={
        standalone
          ? 'mx-auto my-6 shadow-lg print-page'
          : 'print-page mx-auto break-before-page shadow-lg'
      }
    >
      {standalone ? (
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
            <div className="mt-1 text-xs text-slate-500">gedruckt am {dt}</div>
            {authorName && <div className="text-xs text-slate-500">durch {authorName}</div>}
          </div>
        </header>
      ) : (
        <div className="mb-4 flex items-center justify-between border-b pb-2">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">Schaden</div>
            <div className="font-mono text-lg font-bold">{data.damage.code}</div>
          </div>
          <div className="text-xs text-muted-foreground">
            {data.categoryPath.join(' › ') || '—'}
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-4 gap-3 text-sm">
        <KV label="Status" value={STATUS_LABEL[data.damage.status] ?? data.damage.status} />
        <KV label="Priorität" value={PRIO_LABEL[data.damage.priority] ?? data.damage.priority} />
        <KV label="Erfasst am" value={new Date(data.damage.created_at).toLocaleString('de-DE')} />
        <KV label="Erfasst von" value={data.creatorName ?? '—'} />
      </div>

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
          {geometryMeasure && (
            <div className="mt-0.5 text-xs font-medium text-orange-700">{geometryMeasure}</div>
          )}
        </div>
      </div>

      {/* ── ASB-Netzreferenz ── */}
      {data.netzSegment && (
        <div className="avoid-break mt-4 rounded border border-slate-300 bg-slate-50 p-3 text-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Netzreferenz (ASB)
          </div>
          <div className="grid grid-cols-4 gap-x-4 gap-y-1 text-xs">
            <div>
              <div className="text-slate-500">Von Netzknoten</div>
              <div className="font-mono font-semibold">{data.netzSegment.from_node}</div>
            </div>
            <div>
              <div className="text-slate-500">Nach Netzknoten</div>
              <div className="font-mono font-semibold">{data.netzSegment.to_node}</div>
            </div>
            <div>
              <div className="text-slate-500">Station</div>
              <div className="font-mono font-semibold">
                {data.damage.netz_station_m != null
                  ? `${formatStationAsb(data.damage.netz_station_m)} m`
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Lotabstand</div>
              <div className="font-mono font-semibold">
                {data.damage.netz_abstand_m != null
                  ? `${data.damage.netz_abstand_m.toFixed(1)} m`
                  : '—'}
              </div>
            </div>
          </div>
          {(data.netzSegment.strassen_klasse_asb || data.netzSegment.strassen_nummer || data.netzSegment.abschnitts_nummer) && (
            <div className="mt-1.5 text-[11px] text-slate-500">
              {[
                data.netzSegment.strassen_klasse_asb,
                data.netzSegment.strassen_nummer,
                data.netzSegment.abschnitts_nummer && `Abschn. ${data.netzSegment.abschnitts_nummer}${data.netzSegment.ast_nummer && data.netzSegment.ast_nummer !== '0' ? `/${data.netzSegment.ast_nummer}` : ''}`,
              ].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      )}

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

      {otherPhotos.length > 0 && (
        <div className="avoid-break mt-5">
          <div className="mb-2 border-b pb-1 text-xs uppercase tracking-wider text-slate-500">
            Weitere Fotos ({otherPhotos.length})
          </div>
          <div className="grid grid-cols-4 gap-2">
            {otherPhotos.map((p) => (
              <div key={p.id} className="relative aspect-square overflow-hidden rounded bg-slate-100">
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

      <footer className="mt-8 flex justify-between border-t pt-3 text-xs text-slate-500">
        <span>Schadensverwaltung Bauhof Erfurt · vertraulich</span>
        <span>{data.damage.code} · {dt}</span>
      </footer>
    </div>
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
