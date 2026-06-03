import { useState, useEffect } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { ADMIN_SIDEBAR } from './sidebar';
import { useNetworkSegments, type RoadSegment } from '@/hooks/useNetworkSegments';
import { useAuth } from '@/auth/AuthContext';
import { supabase } from '@/lib/supabase';
import { NetworkMapEditor } from '@/components/map/NetworkMapEditor';
import { lineLength, formatLength } from '@/lib/geoMeasure';
import { Plus, Pencil, Trash2, Save, X, MapPin, RotateCcw, Info } from 'lucide-react';

const ROAD_CLASS_LABELS: Record<string, string> = {
  hauptstrasse:   'Hauptstraße',
  nebenstrasse:   'Nebenstraße',
  wirtschaftsweg: 'Wirtschaftsweg',
  radweg:         'Radweg',
  fussweg:        'Fußweg',
  sonstige:       'Sonstige',
};

const ROAD_CLASS_COLORS: Record<string, string> = {
  hauptstrasse:   'bg-red-100 text-red-700 border-red-200',
  nebenstrasse:   'bg-orange-100 text-orange-700 border-orange-200',
  wirtschaftsweg: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  radweg:         'bg-green-100 text-green-700 border-green-200',
  fussweg:        'bg-purple-100 text-purple-700 border-purple-200',
  sonstige:       'bg-slate-100 text-slate-600 border-slate-200',
};

const CLASS_DOT: Record<string, string> = {
  hauptstrasse:   'bg-red-500',
  nebenstrasse:   'bg-orange-500',
  wirtschaftsweg: 'bg-yellow-500',
  radweg:         'bg-green-500',
  fussweg:        'bg-purple-500',
  sonstige:       'bg-slate-400',
};

interface FormState {
  from_node: string;
  to_node: string;
  name: string;
  length_m: string;
  road_class: string;
  geometry: number[][] | null;
}

const EMPTY_FORM: FormState = {
  from_node: '',
  to_node: '',
  name: '',
  length_m: '',
  road_class: 'nebenstrasse',
  geometry: null,
};

const DEFAULT_CENTER: [number, number] = [50.9787, 11.0328];

export function AdminNetworkPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { data: segments = [], isLoading, error } = useNetworkSegments();

  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');

  // Karten-Center — springt zum ersten Punkt der aktuellen Geometrie
  const mapCenter: [number, number] =
    form.geometry?.length
      ? [form.geometry[0][1], form.geometry[0][0]]
      : DEFAULT_CENTER;

  // Länge automatisch aus Geometrie berechnen
  useEffect(() => {
    if (form.geometry && form.geometry.length >= 2) {
      const m = Math.round(lineLength(form.geometry));
      setForm((f) => ({ ...f, length_m: String(m) }));
    }
  }, [form.geometry]);

  function loadSegment(seg: RoadSegment) {
    setEditId(seg.id);
    setForm({
      from_node: seg.from_node,
      to_node: seg.to_node,
      name: seg.name ?? '',
      length_m: seg.length_m != null ? String(seg.length_m) : '',
      road_class: seg.road_class ?? 'nebenstrasse',
      geometry: seg.geometry?.coordinates ?? null,
    });
  }

  function resetForm() {
    setEditId(null);
    setForm(EMPTY_FORM);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        company_id: profile!.company_id,
        from_node: form.from_node.trim(),
        to_node: form.to_node.trim(),
        name: form.name.trim() || null,
        length_m: form.length_m ? parseFloat(form.length_m) : null,
        road_class: form.road_class || null,
        geometry: form.geometry?.length
          ? { type: 'LineString', coordinates: form.geometry }
          : null,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tbl = (supabase as any).from('road_segments');
      if (editId) {
        const { error } = await tbl.update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await tbl.insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['road-segments'] });
      resetForm();
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('road_segments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['road-segments'] });
      setDeleteId(null);
      if (editId === deleteId) resetForm();
    },
  });

  const canSave = form.from_node.trim() && form.to_node.trim();

  const geoStats = form.geometry?.length
    ? {
        points: form.geometry.length,
        length: formatLength(lineLength(form.geometry)),
        start: form.geometry[0],
        end: form.geometry[form.geometry.length - 1],
      }
    : null;

  const filtered = segments.filter((s) => {
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return [s.from_node, s.to_node, s.name, s.road_class]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  return (
    <AppShell title="Administration" subtitle="Straßennetz" sidebar={ADMIN_SIDEBAR}>
      {/* ===== Header ===== */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Straßennetz</h2>
          <p className="text-sm text-muted-foreground">
            {segments.length} Segment{segments.length !== 1 ? 'e' : ''} ·{' '}
            {editId ? 'Segment bearbeiten' : 'Neues Segment anlegen'}
          </p>
        </div>
        {editId && (
          <button
            onClick={resetForm}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" /> Neues Segment
          </button>
        )}
      </div>

      {/* ===== Split: Form-Panel + Karte ===== */}
      <div className="mb-4 flex gap-4" style={{ height: 540 }}>
        {/* ---- Form-Panel ---- */}
        <div className="flex w-80 flex-shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <MapPin className="h-4 w-4 text-blue-500" />
            {editId ? 'Segment bearbeiten' : 'Neues Segment'}
          </div>

          {/* Zeichenhinweis */}
          <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>
              Zeichne die Linie auf der Karte. Erster Punkt = <b>Von Knoten</b>, letzter Punkt = <b>Bis Knoten</b>.
              Länge wird automatisch berechnet.
            </span>
          </div>

          {/* Geo-Statistik */}
          {geoStats && (
            <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs">
              <div className="mb-1 font-medium text-slate-600">Gezeichnete Linie</div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-500">
                <span>Punkte:</span><span className="font-mono">{geoStats.points}</span>
                <span>Länge:</span><span className="font-mono text-emerald-600">{geoStats.length}</span>
                <span>Start:</span>
                <span className="font-mono">{geoStats.start[1].toFixed(5)}, {geoStats.start[0].toFixed(5)}</span>
                <span>Ende:</span>
                <span className="font-mono">{geoStats.end[1].toFixed(5)}, {geoStats.end[0].toFixed(5)}</span>
              </div>
            </div>
          )}

          <hr />

          {/* Von Knoten */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">A</span>
              Von Knoten *
            </label>
            <input
              value={form.from_node}
              onChange={(e) => setForm((f) => ({ ...f, from_node: e.target.value }))}
              placeholder="z. B. K-101 oder Hauptstr./Bahnhof"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>

          {/* Bis Knoten */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">B</span>
              Bis Knoten *
            </label>
            <input
              value={form.to_node}
              onChange={(e) => setForm((f) => ({ ...f, to_node: e.target.value }))}
              placeholder="z. B. K-102 oder Hauptstr./Marktplatz"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>

          {/* Straßenname */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Straßenname</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="z. B. Hauptstraße"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>

          {/* Klasse */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Straßenklasse</label>
            <select
              value={form.road_class}
              onChange={(e) => setForm((f) => ({ ...f, road_class: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            >
              {Object.entries(ROAD_CLASS_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>

          {/* Länge */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Länge (m)
              {geoStats && <span className="ml-1 text-emerald-600">· auto-berechnet</span>}
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.length_m}
              onChange={(e) => setForm((f) => ({ ...f, length_m: e.target.value }))}
              placeholder="z. B. 350"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>

          {/* Geometrie löschen */}
          {form.geometry && (
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, geometry: null }))}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700"
            >
              <RotateCcw className="h-3 w-3" /> Linie löschen und neu zeichnen
            </button>
          )}

          <div className="flex-1" />

          {/* Speichern */}
          <div className="space-y-2">
            {saveMut.isError && (
              <p className="text-xs text-red-600">{(saveMut.error as Error).message}</p>
            )}
            <button
              onClick={() => saveMut.mutate()}
              disabled={!canSave || saveMut.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saveMut.isPending ? 'Speichern …' : editId ? 'Änderungen speichern' : 'Segment anlegen'}
            </button>
            {editId && (
              <button
                onClick={resetForm}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm hover:bg-slate-50"
              >
                <X className="h-4 w-4" /> Abbrechen
              </button>
            )}
          </div>
        </div>

        {/* ---- Karte ---- */}
        <div className="relative flex-1 overflow-hidden rounded-xl border">
          <NetworkMapEditor
            center={mapCenter}
            zoom={14}
            points={form.geometry ?? []}
            onChange={(pts) => setForm((f) => ({ ...f, geometry: pts.length > 0 ? pts : null }))}
            segments={segments}
            onNodeSnap={(name, _coords, isStart) => {
              if (isStart) {
                setForm((f) => ({ ...f, from_node: f.from_node || name }));
              } else {
                setForm((f) => ({ ...f, to_node: name }));
              }
            }}
          />
        </div>
      </div>

      {/* ===== Segmente-Tabelle ===== */}
      <div className="rounded-xl border bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-medium">Alle Segmente ({segments.length})</h3>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Suche …"
            className="rounded-lg border px-3 py-1.5 text-sm"
          />
        </div>

        {/* Legende */}
        <div className="flex flex-wrap gap-2 border-b px-4 py-2">
          {Object.entries(ROAD_CLASS_LABELS).map(([k, label]) => (
            <span key={k} className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className={`h-2.5 w-2.5 rounded-full ${CLASS_DOT[k]}`} />
              {label}
            </span>
          ))}
        </div>

        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Von Knoten</th>
              <th className="px-4 py-2 text-left">Bis Knoten</th>
              <th className="px-4 py-2 text-left">Straßenname</th>
              <th className="px-4 py-2 text-left">Klasse</th>
              <th className="px-4 py-2 text-right">Länge</th>
              <th className="px-4 py-2 text-center">Geometrie</th>
              <th className="px-4 py-2 text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Lade …</td></tr>
            )}
            {error && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-red-600">{(error as Error).message}</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                {searchText ? 'Keine Treffer.' : 'Noch keine Segmente angelegt. Zeichne oben die erste Linie.'}
              </td></tr>
            )}
            {filtered.map((seg) => (
              <tr
                key={seg.id}
                className={`cursor-pointer hover:bg-slate-50 ${editId === seg.id ? 'bg-blue-50' : ''}`}
                onClick={() => loadSegment(seg)}
                title="Klicken zum Bearbeiten"
              >
                <td className="px-4 py-2 font-mono text-xs">{seg.from_node}</td>
                <td className="px-4 py-2 font-mono text-xs">{seg.to_node}</td>
                <td className="px-4 py-2">{seg.name ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-2">
                  {seg.road_class ? (
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${ROAD_CLASS_COLORS[seg.road_class] ?? 'bg-slate-100'}`}>
                      {ROAD_CLASS_LABELS[seg.road_class] ?? seg.road_class}
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {seg.length_m != null ? formatLength(seg.length_m) : '—'}
                </td>
                <td className="px-4 py-2 text-center">
                  {seg.geometry
                    ? <span className="text-xs text-emerald-600">✓ {seg.geometry.coordinates.length} Pkt.</span>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => loadSegment(seg)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Bearbeiten"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteId(seg.id)}
                      className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                      title="Löschen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== Löschen-Bestätigung ===== */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold">Segment löschen?</h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Das Segment wird unwiderruflich gelöscht. Zugeordnete Schäden bleiben erhalten.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
                Abbrechen
              </button>
              <button
                onClick={() => deleteMut.mutate(deleteId)}
                disabled={deleteMut.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMut.isPending ? 'Lösche …' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
