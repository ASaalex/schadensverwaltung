import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { DISPO_SIDEBAR } from './sidebar';
import { useNetworkObject } from '@/hooks/useNetworkObjects';
import { useNetworkObjectTypes } from '@/hooks/useNetworkObjectTypes';
import { useObjectDocuments, isImage, type ObjectDocument } from '@/hooks/useObjectDocuments';
import { ObjectsMap } from '@/components/map/ObjectsMap';
import { supabase } from '@/lib/supabase';
import { lineLength, formatLength, polygonArea, formatArea } from '@/lib/geoMeasure';
import {
  ArrowLeft, Box, AlertTriangle, Printer, Upload, FileText,
  Trash2, Download, Loader2, MapPin, Minus, Hexagon, Camera, ImageIcon,
} from 'lucide-react';

const GEOM_ICON = { point: MapPin, line: Minus, polygon: Hexagon } as const;
const GEOM_LABEL: Record<string, string> = { point: 'Punkt', line: 'Linie', polygon: 'Fläche' };
const STATUS_BADGE: Record<string, string> = {
  neu: 'bg-blue-100 text-blue-800', geprueft: 'bg-indigo-100 text-indigo-800',
  zugewiesen: 'bg-violet-100 text-violet-800', bearbeitung: 'bg-amber-100 text-amber-800',
  erledigt: 'bg-emerald-100 text-emerald-800', abgelehnt: 'bg-slate-100 text-slate-600',
};

interface HistoryDamage {
  id: string; code: string; status: string; priority: string;
  created_at: string; address_street: string | null; category_name: string | null;
}

function formatBytes(n: number | null): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function DispoObjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const objQ = useNetworkObject(id);
  const { query: typeQ } = useNetworkObjectTypes();
  const obj = objQ.data ?? undefined;
  const type = typeQ.data?.find((t) => t.id === obj?.object_type_id);

  const { query: docsQ, uploadMut, deleteMut, getUrl } = useObjectDocuments(id);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const allDocs = docsQ.data ?? [];
  const images = allDocs.filter((d) => isImage(d.mime_type));
  const files = allDocs.filter((d) => !isImage(d.mime_type));

  const { data: damages = [], isLoading: damagesLoading } = useQuery({
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

  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    setUploadError(null);
    for (const file of Array.from(files)) {
      try {
        await uploadMut.mutateAsync(file);
      } catch (e) {
        setUploadError((e as Error).message);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function openDoc(doc: ObjectDocument) {
    const url = await getUrl(doc.storage_path);
    if (url) window.open(url, '_blank');
  }

  if (objQ.isLoading) {
    return (
      <AppShell title="Disposition" subtitle="Objekt" sidebar={DISPO_SIDEBAR}>
        <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Lade Objekt …
        </div>
      </AppShell>
    );
  }

  if (!obj) {
    return (
      <AppShell title="Disposition" subtitle="Objekt" sidebar={DISPO_SIDEBAR}>
        <Link to="/dispo/objects" className="mb-4 flex items-center gap-1 text-sm text-slate-500">
          <ArrowLeft className="h-4 w-4" /> Zurück
        </Link>
        <div className="rounded-xl border bg-white p-8 text-center text-muted-foreground">Objekt nicht gefunden.</div>
      </AppShell>
    );
  }

  const gt = (obj.type_geometry_type ?? type?.geometry_type ?? 'point') as keyof typeof GEOM_ICON;
  const Icon = GEOM_ICON[gt] ?? MapPin;
  const attrs = obj.attributes ?? {};

  // Geometrie-Maße
  let measure: string | null = null;
  if (obj.geometry.type === 'LineString') {
    measure = formatLength(lineLength(obj.geometry.coordinates as number[][]));
  } else if (obj.geometry.type === 'Polygon') {
    measure = formatArea(polygonArea((obj.geometry.coordinates as number[][][])[0]));
  }

  return (
    <AppShell title="Disposition" subtitle="Objekt-Detail" sidebar={DISPO_SIDEBAR}>
      <div className="mb-4 flex items-center justify-between">
        <Link to="/dispo/objects" className="flex items-center gap-1 text-sm text-slate-500">
          <ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht
        </Link>
        <button onClick={() => nav(`/dispo/objects/${obj.id}/print`)}
          className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50">
          <Printer className="h-4 w-4" /> Drucken
        </button>
      </div>

      {/* Kopf */}
      <div className="mb-4 flex items-start gap-4 rounded-xl border bg-white p-5">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: type?.color ? `${type.color}20` : '#f1f5f9' }}>
          <Box className="h-7 w-7" style={{ color: type?.color ?? '#6366f1' }} />
        </div>
        <div className="flex-1">
          <div className="text-xl font-semibold">{obj.name ?? obj.identifier ?? type?.name ?? 'Objekt'}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-sm text-muted-foreground">
            {type && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: type.color }} />{type.name}</span>}
            <span className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5" /> {GEOM_LABEL[gt]}</span>
            {obj.identifier && <span>· Kennung: <span className="font-mono">{obj.identifier}</span></span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-slate-700">{damages.length}</div>
          <div className="text-xs text-muted-foreground">Schäden gesamt</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Karte */}
        <div className="overflow-hidden rounded-xl border bg-white lg:col-span-2">
          <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Lage</div>
          <div className="h-[420px]">
            <ObjectsMap objects={[obj]} fitToId={obj.id} selectedId={obj.id} />
          </div>
        </div>

        {/* Parameter */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <div className="mb-2 text-sm font-semibold">Parameter</div>
            <dl className="space-y-1.5 text-sm">
              <Row label="Bezeichnung" value={obj.name ?? '—'} />
              <Row label="Kennung" value={obj.identifier ?? '—'} mono />
              <Row label="Typ" value={type?.name ?? '—'} />
              <Row label="Geometrie" value={GEOM_LABEL[gt]} />
              {measure && <Row label={obj.geometry.type === 'LineString' ? 'Länge' : 'Fläche'} value={measure} />}
              <Row label="Erstellt" value={new Date(obj.created_at).toLocaleString('de-DE')} />
            </dl>
            {/* Freie Attribute */}
            {Object.keys(attrs).length > 0 && (
              <>
                <div className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Zusatzfelder</div>
                <dl className="space-y-1.5 text-sm">
                  {Object.entries(attrs).map(([k, v]) => (
                    <Row key={k} label={k} value={String(v)} />
                  ))}
                </dl>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Schadens-Historie */}
      <div className="mt-4 rounded-xl border bg-white">
        <div className="flex items-center gap-2 border-b px-4 py-3 font-medium">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          Schadens-Historie ({damages.length})
        </div>
        {damagesLoading && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Lade …</div>}
        {!damagesLoading && damages.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">Noch keine Schäden an diesem Objekt.</div>
        )}
        <div className="divide-y">
          {damages.map((d) => (
            <button key={d.id} onClick={() => nav(`/dispo/damages/${d.id}`)}
              className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-slate-50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{d.code}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[d.status] ?? 'bg-slate-100'}`}>{d.status}</span>
                </div>
                <div className="mt-0.5 text-sm font-medium truncate">{d.category_name ?? '—'}</div>
                {d.address_street && <div className="text-xs text-muted-foreground">{d.address_street}</div>}
              </div>
              <div className="text-xs text-muted-foreground flex-shrink-0">{new Date(d.created_at).toLocaleDateString('de-DE')}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Bilder */}
      <div className="mt-4 rounded-xl border bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 font-medium">
            <ImageIcon className="h-4 w-4 text-emerald-500" /> Bilder ({images.length})
          </div>
          <div className="flex gap-2">
            <button onClick={() => photoRef.current?.click()} disabled={uploadMut.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {uploadMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              Bild hinzufügen
            </button>
          </div>
          <input ref={photoRef} type="file" accept="image/*" capture="environment" multiple className="hidden"
            onChange={(e) => handleFiles(e.target.files)} />
        </div>
        {images.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Noch keine Bilder. Tippe auf „Bild hinzufügen" (Kamera oder Galerie).
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4 md:grid-cols-6">
            {images.map((img) => (
              <ObjectThumbnail key={img.id} doc={img} getUrl={getUrl} onOpen={openDoc}
                onDelete={() => deleteMut.mutate(img)} deleting={deleteMut.isPending} />
            ))}
          </div>
        )}
      </div>

      {/* Dokumente */}
      <div className="mt-4 rounded-xl border bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 font-medium">
            <FileText className="h-4 w-4 text-blue-500" /> Dokumente ({files.length})
          </div>
          <button onClick={() => fileRef.current?.click()} disabled={uploadMut.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {uploadMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Hochladen
          </button>
          <input ref={fileRef} type="file" multiple className="hidden"
            onChange={(e) => handleFiles(e.target.files)} />
        </div>
        {uploadError && <div className="px-4 py-2 text-xs text-red-600">{uploadError}</div>}
        {docsQ.isLoading && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Lade …</div>}
        {!docsQ.isLoading && files.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Noch keine Dokumente. Lade Pläne oder PDFs hoch.
          </div>
        )}
        <div className="divide-y">
          {files.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
              <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" />
              <button onClick={() => openDoc(doc)} className="flex-1 min-w-0 text-left">
                <div className="text-sm font-medium truncate text-blue-700 hover:underline">{doc.file_name}</div>
                <div className="text-xs text-muted-foreground">
                  {formatBytes(doc.size_bytes)} · {new Date(doc.created_at).toLocaleDateString('de-DE')}
                </div>
              </button>
              <button onClick={() => openDoc(doc)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600" title="Öffnen / Herunterladen">
                <Download className="h-4 w-4" />
              </button>
              <button onClick={() => deleteMut.mutate(doc)} disabled={deleteMut.isPending}
                className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600" title="Löschen">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground flex-shrink-0">{label}</dt>
      <dd className={`text-right ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function ObjectThumbnail({
  doc, getUrl, onOpen, onDelete, deleting,
}: {
  doc: ObjectDocument;
  getUrl: (path: string) => Promise<string | null>;
  onOpen: (doc: ObjectDocument) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    getUrl(doc.storage_path).then((u) => { if (active) setUrl(u); });
    return () => { active = false; };
  // getUrl ist pro Render neu — bewusst nur an storage_path koppeln
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.storage_path]);
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border bg-slate-100">
      {url ? (
        <img src={url} alt={doc.file_name} onClick={() => onOpen(doc)}
          className="h-full w-full cursor-pointer object-cover transition group-hover:opacity-90" />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
        </div>
      )}
      <button onClick={onDelete} disabled={deleting}
        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100">
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
