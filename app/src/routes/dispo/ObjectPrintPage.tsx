import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useNetworkObjects } from '@/hooks/useNetworkObjects';
import { useNetworkObjectTypes } from '@/hooks/useNetworkObjectTypes';
import { useObjectDocuments, isImage } from '@/hooks/useObjectDocuments';
import { usePrintConfig } from '@/hooks/usePrintConfig';
import { supabase } from '@/lib/supabase';
import { lineLength, formatLength, polygonArea, formatArea } from '@/lib/geoMeasure';
import { ArrowLeft, Printer, Box } from 'lucide-react';

const GEOM_LABEL: Record<string, string> = { point: 'Punkt', line: 'Linie', polygon: 'Fläche' };

interface HistoryDamage {
  id: string; code: string; status: string; priority: string;
  created_at: string; address_street: string | null; category_name: string | null;
}

export function DispoObjectPrintPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { query: objQ } = useNetworkObjects();
  const { query: typeQ } = useNetworkObjectTypes();
  const { data: printConfig } = usePrintConfig();
  const { query: docsQ, getUrl } = useObjectDocuments(id);
  const obj = objQ.data?.find((o) => o.id === id);
  const type = typeQ.data?.find((t) => t.id === obj?.object_type_id);

  const allDocs = docsQ.data ?? [];
  const images = allDocs.filter((d) => isImage(d.mime_type));
  const files = allDocs.filter((d) => !isImage(d.mime_type));

  // Signed-URLs für Bilder laden
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    (async () => {
      const entries: Record<string, string> = {};
      for (const img of images) {
        const u = await getUrl(img.storage_path);
        if (u) entries[img.id] = u;
      }
      if (active) setImgUrls(entries);
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  const { data: damages = [] } = useQuery({
    queryKey: ['object-history', id],
    queryFn: async (): Promise<HistoryDamage[]> => {
      const { data, error } = await supabase
        .from('damages')
        .select('id, code, status, priority, created_at, address_street, category:damage_categories!category_id ( name )')
        .eq('network_object_id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as Array<HistoryDamage & { category: { name: string } | null }>)
        .map((r) => ({ ...r, category_name: r.category?.name ?? null }));
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (obj) {
      const prev = document.title;
      document.title = `Objekt_${obj.name ?? obj.identifier ?? obj.id.slice(0, 8)}`;
      return () => { document.title = prev; };
    }
  }, [obj]);

  if (!obj) {
    return (
      <div className="p-8">
        <Link to="/dispo/objects" className="flex items-center gap-1 text-sm text-slate-500">
          <ArrowLeft className="h-4 w-4" /> Zurück
        </Link>
        <div className="mt-4 text-muted-foreground">Objekt nicht gefunden.</div>
      </div>
    );
  }

  const printDate = new Date().toLocaleDateString('de-DE');
  let measure: string | null = null;
  if (obj.geometry.type === 'LineString') measure = formatLength(lineLength(obj.geometry.coordinates as number[][]));
  else if (obj.geometry.type === 'Polygon') measure = formatArea(polygonArea((obj.geometry.coordinates as number[][][])[0]));
  const gt = obj.type_geometry_type ?? type?.geometry_type ?? 'point';
  const attrs = obj.attributes ?? {};
  const h = printConfig?.header;

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      {/* Toolbar (nur Bildschirm) */}
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 print:hidden">
        <button onClick={() => nav(`/dispo/objects/${obj.id}`)} className="flex items-center gap-1 text-sm text-slate-600">
          <ArrowLeft className="h-4 w-4" /> Zurück
        </button>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Printer className="h-4 w-4" /> Drucken
        </button>
      </div>

      {/* A4-Blatt */}
      <div className="mx-auto max-w-[210mm] bg-white p-[18mm] text-sm text-slate-800 shadow print:shadow-none">
        {/* Kopf */}
        <header className="flex items-start justify-between border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg" style={{ background: type?.color ? `${type.color}20` : '#eef2ff' }}>
              <Box className="h-6 w-6" style={{ color: type?.color ?? '#6366f1' }} />
            </div>
            <div>
              <div className="text-lg font-bold text-slate-900">{h?.company_name || 'Schadensverwaltung'}</div>
              {h?.company_subtitle && <div className="text-xs text-slate-500">{h.company_subtitle}</div>}
              {h?.company_address && <div className="text-xs text-slate-500">{h.company_address}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-slate-500">Objekt-Datenblatt</div>
            <div className="text-lg font-bold">{obj.name ?? obj.identifier ?? '—'}</div>
            <div className="mt-1 text-xs text-slate-500">gedruckt am {printDate}</div>
          </div>
        </header>

        {/* Stammdaten */}
        <section className="mt-5">
          <div className="mb-2 border-b pb-1 text-xs uppercase tracking-wider text-slate-500">Stammdaten</div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
            <PrintRow label="Bezeichnung" value={obj.name ?? '—'} />
            <PrintRow label="Kennung" value={obj.identifier ?? '—'} />
            <PrintRow label="Objekttyp" value={type?.name ?? '—'} />
            <PrintRow label="Geometrie" value={GEOM_LABEL[gt] ?? gt} />
            {measure && <PrintRow label={obj.geometry.type === 'LineString' ? 'Länge' : 'Fläche'} value={measure} />}
            <PrintRow label="Erstellt am" value={new Date(obj.created_at).toLocaleDateString('de-DE')} />
          </div>
        </section>

        {/* Zusatzfelder */}
        {Object.keys(attrs).length > 0 && (
          <section className="mt-5">
            <div className="mb-2 border-b pb-1 text-xs uppercase tracking-wider text-slate-500">Zusatzfelder</div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
              {Object.entries(attrs).map(([k, v]) => <PrintRow key={k} label={k} value={String(v)} />)}
            </div>
          </section>
        )}

        {/* Schadens-Historie */}
        <section className="mt-5">
          <div className="mb-2 border-b pb-1 text-xs uppercase tracking-wider text-slate-500">
            Schadens-Historie ({damages.length})
          </div>
          {damages.length === 0 ? (
            <div className="text-sm text-slate-500">Keine Schäden an diesem Objekt.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left text-slate-500">
                <tr className="border-b">
                  <th className="py-1.5">Code</th>
                  <th className="py-1.5">Kategorie</th>
                  <th className="py-1.5">Adresse</th>
                  <th className="py-1.5">Status</th>
                  <th className="py-1.5">Datum</th>
                </tr>
              </thead>
              <tbody>
                {damages.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100">
                    <td className="py-1.5 font-mono">{d.code}</td>
                    <td className="py-1.5">{d.category_name ?? '—'}</td>
                    <td className="py-1.5 text-slate-600">{d.address_street ?? '—'}</td>
                    <td className="py-1.5">{d.status}</td>
                    <td className="py-1.5">{new Date(d.created_at).toLocaleDateString('de-DE')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Bilder */}
        {images.length > 0 && (
          <section className="mt-5">
            <div className="mb-2 border-b pb-1 text-xs uppercase tracking-wider text-slate-500">
              Bilder ({images.length})
            </div>
            <div className="grid grid-cols-3 gap-2">
              {images.map((img) => (
                <div key={img.id} className="aspect-square overflow-hidden rounded border bg-slate-100">
                  {imgUrls[img.id] && (
                    <img src={imgUrls[img.id]} alt={img.file_name} className="h-full w-full object-cover" />
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Dokumente (Liste) */}
        {files.length > 0 && (
          <section className="mt-5">
            <div className="mb-2 border-b pb-1 text-xs uppercase tracking-wider text-slate-500">
              Hinterlegte Dokumente ({files.length})
            </div>
            <ul className="list-disc pl-5 text-xs text-slate-700">
              {files.map((doc) => <li key={doc.id}>{doc.file_name}</li>)}
            </ul>
          </section>
        )}

        <footer className="mt-8 flex justify-between border-t pt-3 text-xs text-slate-500">
          <span>{printConfig?.footer_text || 'Schadensverwaltung · vertraulich'}</span>
          <span>{obj.name ?? obj.identifier ?? obj.id.slice(0, 8)} · {printDate}</span>
        </footer>
      </div>
    </div>
  );
}

function PrintRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-slate-500">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
