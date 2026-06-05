import { useState, useEffect, useRef } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { ADMIN_SIDEBAR } from './sidebar';
import { useNetworkSegments, type RoadSegment } from '@/hooks/useNetworkSegments';
import { useAuth } from '@/auth/AuthContext';
import { supabase } from '@/lib/supabase';
import { NetworkMapEditor } from '@/components/map/NetworkMapEditor';
import { lineLength, formatLength } from '@/lib/geoMeasure';
import { formatStationAsb } from '@/lib/networkReferencing';
import { Plus, Pencil, Trash2, Save, X, MapPin, RotateCcw, Info } from 'lucide-react';

// ── ASB-Straßenklassen ────────────────────────────────────────────────────────

const ASB_KLASSEN: Record<string, string> = {
  A:    'Autobahn (A)',
  B:    'Bundesstraße (B)',
  L:    'Landesstraße (L)',
  K:    'Kreisstraße (K)',
  St:   'Stadtstraße (St)',
  Gem:  'Gemeindestraße (Gem)',
  GV:   'Gemeindeverbindungsweg (GV)',
  P:    'Privat-/Wirtschaftsweg (P)',
  Rad:  'Radweg',
  sonst:'Sonstige',
};

const ASB_FARBEN: Record<string, string> = {
  A:    'bg-red-100 text-red-700',
  B:    'bg-orange-100 text-orange-700',
  L:    'bg-yellow-100 text-yellow-700',
  K:    'bg-green-100 text-green-700',
  St:   'bg-sky-100 text-sky-700',
  Gem:  'bg-indigo-100 text-indigo-700',
  GV:   'bg-violet-100 text-violet-700',
  P:    'bg-stone-100 text-stone-600',
  Rad:  'bg-emerald-100 text-emerald-700',
  sonst:'bg-slate-100 text-slate-600',
};

const ASB_DOTS: Record<string, string> = {
  A:'bg-red-500', B:'bg-orange-500', L:'bg-yellow-500', K:'bg-green-500',
  St:'bg-sky-500', Gem:'bg-indigo-500', GV:'bg-violet-500',
  P:'bg-stone-500', Rad:'bg-emerald-500', sonst:'bg-slate-400',
};

// ── Form-State ────────────────────────────────────────────────────────────────

interface FormState {
  from_node:          string;
  to_node:            string;
  name:               string;
  strassen_klasse_asb:string;
  strassen_nummer:    string;
  abschnitts_nummer:  string;
  ast_nummer:         string;
  von_station:        string;
  length_m:           string;
  gueltig_von:        string;
  gueltig_bis:        string;
  geometry:           number[][] | null;
}

const TODAY = new Date().toISOString().slice(0, 10);

const EMPTY: FormState = {
  from_node: '', to_node: '', name: '',
  strassen_klasse_asb: 'K', strassen_nummer: '',
  abschnitts_nummer: '', ast_nummer: '0',
  von_station: '0', length_m: '',
  gueltig_von: TODAY, gueltig_bis: '',
  geometry: null,
};

const DEFAULT_CENTER: [number, number] = [50.9787, 11.0328];

// ── Komponente ────────────────────────────────────────────────────────────────

export function AdminNetworkPage() {
  const qc      = useQueryClient();
  const { profile } = useAuth();
  const { data: segments = [], isLoading, error } = useNetworkSegments();

  const [editId,       setEditId]       = useState<string | null>(null);
  const [form,         setForm]         = useState<FormState>(EMPTY);
  const [deleteId,     setDeleteId]     = useState<string | null>(null);
  const [search,       setSearch]       = useState('');
  const [filterDate,   setFilterDate]   = useState(TODAY); // Gültig-am Filter
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  // Karten-Center
  const mapCenter: [number, number] = form.geometry?.length
    ? [form.geometry[0][1], form.geometry[0][0]]
    : DEFAULT_CENTER;

  // Länge + Bis-Station auto-berechnen
  useEffect(() => {
    if (form.geometry && form.geometry.length >= 2) {
      const m = Math.round(lineLength(form.geometry));
      setForm((f) => ({ ...f, length_m: String(m) }));
    }
  }, [form.geometry]);

  const bisStation = form.von_station && form.length_m
    ? parseFloat(form.von_station) + parseFloat(form.length_m)
    : null;

  function handleMapSegmentClick(id: string) {
    const seg = segments.find((s) => s.id === id);
    if (!seg) return;
    loadSeg(seg);
    // Zur Tabellenzeile scrollen
    setTimeout(() => {
      rowRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }

  function loadSeg(seg: RoadSegment) {
    setEditId(seg.id);
    setForm({
      from_node:           seg.from_node,
      to_node:             seg.to_node,
      name:                seg.name ?? '',
      strassen_klasse_asb: seg.strassen_klasse_asb ?? 'K',
      strassen_nummer:     seg.strassen_nummer ?? '',
      abschnitts_nummer:   seg.abschnitts_nummer ?? '',
      ast_nummer:          seg.ast_nummer ?? '0',
      von_station:         seg.von_station != null ? String(seg.von_station) : '0',
      length_m:            seg.length_m != null ? String(seg.length_m) : '',
      gueltig_von:         seg.gueltig_von ?? TODAY,
      gueltig_bis:         seg.gueltig_bis ?? '',
      geometry:            seg.geometry?.coordinates ?? null,
    });
  }

  function reset() { setEditId(null); setForm(EMPTY); }

  const saveMut = useMutation({
    mutationFn: async () => {
      const lenM   = form.length_m    ? parseFloat(form.length_m)    : null;
      const vonSt  = form.von_station ? parseFloat(form.von_station) : 0;
      const payload = {
        company_id:          profile!.company_id,
        from_node:           form.from_node.trim(),
        to_node:             form.to_node.trim(),
        name:                form.name.trim() || null,
        strassen_klasse_asb: form.strassen_klasse_asb || null,
        strassen_nummer:     form.strassen_nummer.trim() || null,
        abschnitts_nummer:   form.abschnitts_nummer.trim() || null,
        ast_nummer:          form.ast_nummer.trim() || '0',
        von_station:         vonSt,
        bis_station:         lenM != null ? vonSt + lenM : null,
        length_m:            lenM,
        geometry:            form.geometry?.length
          ? { type: 'LineString', coordinates: form.geometry }
          : null,
        gueltig_von:         form.gueltig_von || TODAY,
        gueltig_bis:         form.gueltig_bis || null,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tbl = (supabase as any).from('road_segments');
      const { error: e } = editId
        ? await tbl.update(payload).eq('id', editId)
        : await tbl.insert(payload);
      if (e) throw e;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['road-segments'] }); reset(); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e } = await (supabase as any).from('road_segments').delete().eq('id', id);
      if (e) throw e;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['road-segments'] });
      if (editId === deleteId) reset();
      setDeleteId(null);
    },
  });

  const canSave = !!form.from_node.trim() && !!form.to_node.trim();

  const geoStats = form.geometry?.length
    ? {
        points: form.geometry.length,
        length: formatLength(lineLength(form.geometry)),
        start:  form.geometry[0],
        end:    form.geometry[form.geometry.length - 1],
      }
    : null;

  const filtered = segments.filter((s) => {
    // Gültigkeitsfilter
    if (s.gueltig_von && s.gueltig_von > filterDate) return false;
    if (s.gueltig_bis && s.gueltig_bis < filterDate) return false;
    // Textsuche
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [s.from_node, s.to_node, s.name, s.strassen_nummer, s.abschnitts_nummer, s.strassen_klasse_asb]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  // ─ Render ─────────────────────────────────────────────────────────────────
  return (
    <AppShell title="Administration" subtitle="Straßennetz (ASB)" sidebar={ADMIN_SIDEBAR}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Straßennetz</h2>
          <p className="text-sm text-muted-foreground">
            {segments.length} Abschnitte nach ASB ·{' '}
            {editId ? 'Abschnitt bearbeiten' : 'Neuen Abschnitt anlegen'}
          </p>
        </div>
        {editId && (
          <button onClick={reset} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">
            <Plus className="h-4 w-4" /> Neuer Abschnitt
          </button>
        )}
      </div>

      {/* Split: Formular + Karte */}
      <div className="mb-4 flex gap-4" style={{ height: 560 }}>

        {/* ── Formular ── */}
        <div className="flex w-96 flex-shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <MapPin className="h-4 w-4 text-blue-500" />
            {editId ? 'Abschnitt bearbeiten' : 'Neuer ASB-Abschnitt'}
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>
              Linie auf der Karte zeichnen. Blaue Knoten-Marker → Snap auf bestehenden Netzknoten.
              Länge und Bis-Station werden automatisch berechnet.
            </span>
          </div>

          {/* Geo-Statistik */}
          {geoStats && (
            <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs">
              <div className="mb-1 font-medium text-slate-600">Bestandsachse</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-slate-500">
                <span>Stützpunkte:</span><span className="font-mono">{geoStats.points}</span>
                <span>Länge:</span><span className="font-mono text-emerald-600">{geoStats.length}</span>
                <span>Start (A):</span>
                <span className="font-mono text-[10px]">{geoStats.start[1].toFixed(6)}, {geoStats.start[0].toFixed(6)}</span>
                <span>Ende (B):</span>
                <span className="font-mono text-[10px]">{geoStats.end[1].toFixed(6)}, {geoStats.end[0].toFixed(6)}</span>
              </div>
            </div>
          )}

          <hr />

          {/* Netzknoten */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">A</span>
                Von Knoten *
              </label>
              <input value={form.from_node}
                onChange={(e) => setForm((f) => ({ ...f, from_node: e.target.value }))}
                placeholder="NK-Nummer"
                className="w-full rounded-lg border px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">B</span>
                Bis Knoten *
              </label>
              <input value={form.to_node}
                onChange={(e) => setForm((f) => ({ ...f, to_node: e.target.value }))}
                placeholder="NK-Nummer"
                className="w-full rounded-lg border px-2 py-1.5 text-sm" />
            </div>
          </div>

          {/* ASB: Klasse + Straßennummer */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Straßenklasse (ASB) *</label>
              <select value={form.strassen_klasse_asb}
                onChange={(e) => setForm((f) => ({ ...f, strassen_klasse_asb: e.target.value }))}
                className="w-full rounded-lg border px-2 py-1.5 text-sm">
                {Object.entries(ASB_KLASSEN).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Straßennummer</label>
              <input value={form.strassen_nummer}
                onChange={(e) => setForm((f) => ({ ...f, strassen_nummer: e.target.value }))}
                placeholder="z. B. K 12, L 1036"
                className="w-full rounded-lg border px-2 py-1.5 text-sm" />
            </div>
          </div>

          {/* Straßenname */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Straßenname</label>
            <input value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="z. B. Hauptstraße"
              className="w-full rounded-lg border px-2 py-1.5 text-sm" />
          </div>

          {/* ASB: Abschnitt + Ast */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Abschnittsnummer</label>
              <input value={form.abschnitts_nummer}
                onChange={(e) => setForm((f) => ({ ...f, abschnitts_nummer: e.target.value }))}
                placeholder="z. B. 100"
                className="w-full rounded-lg border px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Ast-Nummer</label>
              <input value={form.ast_nummer}
                onChange={(e) => setForm((f) => ({ ...f, ast_nummer: e.target.value }))}
                placeholder="0"
                className="w-full rounded-lg border px-2 py-1.5 text-sm" />
            </div>
          </div>

          {/* Stationierung */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Von-Station (m)</label>
              <input type="number" min="0" step="1" value={form.von_station}
                onChange={(e) => setForm((f) => ({ ...f, von_station: e.target.value }))}
                className="w-full rounded-lg border px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Bis-Station (m)
                {bisStation != null && <span className="ml-1 text-emerald-600">auto</span>}
              </label>
              <input type="number" readOnly
                value={bisStation != null ? bisStation : ''}
                placeholder="auto"
                className="w-full rounded-lg border bg-slate-50 px-2 py-1.5 text-sm text-slate-500" />
            </div>
          </div>

          {/* Länge */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Länge (m)
              {geoStats && <span className="ml-1 text-emerald-600">· auto aus Geometrie</span>}
            </label>
            <input type="number" min="0" step="1" value={form.length_m}
              onChange={(e) => setForm((f) => ({ ...f, length_m: e.target.value }))}
              placeholder="z. B. 350"
              className="w-full rounded-lg border px-2 py-1.5 text-sm" />
          </div>

          {/* ASB-Stationsformat-Preview */}
          {form.von_station && form.length_m && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              ASB-Stationierung:{' '}
              <span className="font-mono text-slate-700">
                {formatStationAsb(parseFloat(form.von_station))}
              </span>
              {' '}–{' '}
              <span className="font-mono text-slate-700">
                {formatStationAsb(parseFloat(form.von_station) + parseFloat(form.length_m))}
              </span>
              {' '}m
            </div>
          )}

          {/* Gültigkeitszeitraum */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Gültigkeitszeitraum</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-0.5 block text-[11px] text-slate-500">Gültig von</label>
                <input type="date" value={form.gueltig_von}
                  onChange={(e) => setForm((f) => ({ ...f, gueltig_von: e.target.value }))}
                  className="w-full rounded-lg border px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-0.5 block text-[11px] text-slate-500">Gültig bis (leer = unbegrenzt)</label>
                <input type="date" value={form.gueltig_bis}
                  onChange={(e) => setForm((f) => ({ ...f, gueltig_bis: e.target.value }))}
                  min={form.gueltig_von}
                  className="w-full rounded-lg border px-2 py-1.5 text-sm" />
              </div>
            </div>
          </div>

          {/* Linie löschen */}
          {form.geometry && (
            <button type="button"
              onClick={() => setForm((f) => ({ ...f, geometry: null }))}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700">
              <RotateCcw className="h-3 w-3" /> Linie löschen und neu zeichnen
            </button>
          )}

          <div className="flex-1" />

          {/* Save */}
          <div className="space-y-2">
            {saveMut.isError && (
              <p className="text-xs text-red-600">{(saveMut.error as Error).message}</p>
            )}
            <button onClick={() => saveMut.mutate()} disabled={!canSave || saveMut.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              <Save className="h-4 w-4" />
              {saveMut.isPending ? 'Speichern …' : editId ? 'Änderungen speichern' : 'Abschnitt anlegen'}
            </button>
            {editId && (
              <button onClick={reset}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
                <X className="h-4 w-4" /> Abbrechen
              </button>
            )}
          </div>
        </div>

        {/* ── Karte ── */}
        <div className="relative flex-1 overflow-hidden rounded-xl border">
          <NetworkMapEditor
            center={mapCenter} zoom={14}
            points={form.geometry ?? []}
            onChange={(pts) => setForm((f) => ({ ...f, geometry: pts.length > 0 ? pts : null }))}
            segments={filtered}
            onSegmentClick={handleMapSegmentClick}
            selectedSegmentId={editId}
            onNodeSnap={(name, _coords, isStart) => {
              if (isStart) setForm((f) => ({ ...f, from_node: f.from_node || name }));
              else         setForm((f) => ({ ...f, to_node: name }));
            }}
          />
        </div>
      </div>

      {/* Tabelle */}
      <div className="rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <h3 className="font-medium">
            Abschnitte ({filtered.length}
            {filtered.length !== segments.length && <span className="text-muted-foreground"> von {segments.length}</span>})
          </h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Gültig am</label>
              <input type="date" value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="rounded-lg border px-2 py-1.5 text-sm" />
              <button onClick={() => setFilterDate(TODAY)}
                className="text-xs text-blue-600 underline whitespace-nowrap">Heute</button>
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Suche …"
              className="rounded-lg border px-3 py-1.5 text-sm w-56" />
          </div>
        </div>

        {/* Legende */}
        <div className="flex flex-wrap gap-2 border-b px-4 py-2">
          {Object.entries(ASB_KLASSEN).map(([k]) => (
            <span key={k} className="flex items-center gap-1 text-xs">
              <span className={`h-2.5 w-2.5 rounded-full ${ASB_DOTS[k]}`} />
              <span className="text-muted-foreground">{k}</span>
            </span>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Klasse</th>
                <th className="px-3 py-2 text-left">Str.-Nr.</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Abschn./Ast</th>
                <th className="px-3 py-2 text-left">Von Knoten</th>
                <th className="px-3 py-2 text-left">Bis Knoten</th>
                <th className="px-3 py-2 text-right">Station von–bis</th>
                <th className="px-3 py-2 text-right">Länge</th>
                <th className="px-3 py-2 text-center">Geo.</th>
                <th className="px-3 py-2 text-left">Gültig von–bis</th>
                <th className="px-3 py-2 text-right">Akt.</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading && <tr><td colSpan={10} className="px-4 py-6 text-center text-muted-foreground">Lade …</td></tr>}
              {error    && <tr><td colSpan={10} className="px-4 py-6 text-center text-red-600">{(error as Error).message}</td></tr>}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  {search ? 'Keine Treffer.' : 'Noch keine Abschnitte angelegt.'}
                </td></tr>
              )}
              {filtered.map((seg) => (
                <tr key={seg.id}
                  ref={(el) => { if (el) rowRefs.current.set(seg.id, el); else rowRefs.current.delete(seg.id); }}
                  className={`cursor-pointer hover:bg-slate-50 ${editId === seg.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : ''}`}
                  onClick={() => loadSeg(seg)}>
                  <td className="px-3 py-2">
                    {seg.strassen_klasse_asb ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ASB_FARBEN[seg.strassen_klasse_asb] ?? 'bg-slate-100'}`}>
                        {seg.strassen_klasse_asb}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{seg.strassen_nummer ?? '—'}</td>
                  <td className="px-3 py-2">{seg.name ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {seg.abschnitts_nummer ?? '—'}
                    {seg.ast_nummer && seg.ast_nummer !== '0' && <span className="text-muted-foreground">/{seg.ast_nummer}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{seg.from_node}</td>
                  <td className="px-3 py-2 font-mono text-xs">{seg.to_node}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                    {seg.von_station != null
                      ? <>{formatStationAsb(seg.von_station)} – {seg.bis_station != null ? formatStationAsb(seg.bis_station) : '?'}</>
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {seg.length_m != null ? formatLength(seg.length_m) : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {seg.geometry
                      ? <span className="text-xs text-emerald-600">✓ {seg.geometry.coordinates.length}</span>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs tabular-nums">
                    <span className="text-slate-600">{seg.gueltig_von ?? '—'}</span>
                    {' '}–{' '}
                    <span className={seg.gueltig_bis ? 'text-slate-600' : 'text-emerald-600'}>
                      {seg.gueltig_bis ?? '∞'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => loadSeg(seg)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteId(seg.id)}
                        className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Löschen-Dialog */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold">Abschnitt löschen?</h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Der Abschnitt wird unwiderruflich gelöscht. Schäden verlieren die Netzreferenz.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">Abbrechen</button>
              <button onClick={() => deleteMut.mutate(deleteId)} disabled={deleteMut.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {deleteMut.isPending ? 'Lösche …' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
