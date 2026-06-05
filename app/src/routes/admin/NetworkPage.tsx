import { useState, useEffect, useRef } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { ADMIN_SIDEBAR } from './sidebar';
import { useNetworkNodes, type NetworkNode } from '@/hooks/useNetworkNodes';
import { useNetworkSegments, type RoadSegment } from '@/hooks/useNetworkSegments';
import { useNetworkAreas, AREA_TYPE_LABELS, AREA_TYPE_COLORS } from '@/hooks/useNetworkAreas';
import { useAuth } from '@/auth/AuthContext';
import { supabase } from '@/lib/supabase';
import { NetworkEditorMap } from '@/components/map/NetworkEditorMap';
import { GeometryDrawer } from '@/components/map/GeometryDrawer';
import { lineLength, formatLength, polygonArea, formatArea } from '@/lib/geoMeasure';
import { formatStationAsb } from '@/lib/networkReferencing';
import {
  Pencil, Trash2, Save, X, MapPin, Route,
  Network, CheckCircle2, Layers,
} from 'lucide-react';

// ── Konstanten ────────────────────────────────────────────────────────────────

const ASB_KLASSEN: Record<string, string> = {
  A: 'Autobahn (A)', B: 'Bundesstraße (B)', L: 'Landesstraße (L)',
  K: 'Kreisstraße (K)', St: 'Stadtstraße (St)', Gem: 'Gemeindestraße (Gem)',
  GV: 'Gemeindeverbindungsweg (GV)', P: 'Privat-/Wirtschaftsweg (P)',
  Rad: 'Radweg', sonst: 'Sonstige',
};

const ASB_FARBEN: Record<string, string> = {
  A: 'bg-red-100 text-red-700', B: 'bg-orange-100 text-orange-700',
  L: 'bg-yellow-100 text-yellow-700', K: 'bg-green-100 text-green-700',
  St: 'bg-sky-100 text-sky-700', Gem: 'bg-indigo-100 text-indigo-700',
  GV: 'bg-violet-100 text-violet-700', P: 'bg-stone-100 text-stone-600',
  Rad: 'bg-emerald-100 text-emerald-700', sonst: 'bg-slate-100 text-slate-600',
};

const TODAY = new Date().toISOString().slice(0, 10);
const DEFAULT_CENTER: [number, number] = [50.9787, 11.0328];

// ── Segment-Form ──────────────────────────────────────────────────────────────

interface SegForm {
  id?:                 string;
  name:                string;
  strassen_klasse_asb: string;
  strassen_nummer:     string;
  abschnitts_nummer:   string;
  ast_nummer:          string;
  von_station:         string;
  length_m:            string;
  gueltig_von:         string;
  gueltig_bis:         string;
}

const EMPTY_SEG: SegForm = {
  name: '', strassen_klasse_asb: 'K', strassen_nummer: '',
  abschnitts_nummer: '', ast_nummer: '0',
  von_station: '0', length_m: '',
  gueltig_von: TODAY, gueltig_bis: '',
};

// ── Hauptkomponente ───────────────────────────────────────────────────────────

type PageTab = 'knoten' | 'abschnitte' | 'flaechen';

export function AdminNetworkPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { query: nodesQ, saveMut: nodeSave, deleteMut: nodeDel } = useNetworkNodes();
  const { data: segments = [], isLoading: segLoading, error: segError } = useNetworkSegments();
  const { query: areasQ, saveMut: areaSave, deleteMut: areaDel } = useNetworkAreas();
  const nodes: NetworkNode[] = nodesQ.data ?? [];

  const [tab, setTab] = useState<PageTab>('knoten');

  // ─ Flächen-State ─────────────────────────────────────────────────────────
  const areas = areasQ.data ?? [];
  const [areaForm, setAreaForm] = useState({
    id: '', name: '', area_type: 'park', gueltig_von: TODAY, gueltig_bis: '',
  });
  const [areaPoints, setAreaPoints] = useState<number[][]>([]); // [lng,lat][]
  const [deleteAreaId, setDeleteAreaId] = useState<string | null>(null);

  // ─ Knoten-State ──────────────────────────────────────────────────────────
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [nodeNameInput, setNodeNameInput] = useState('');
  const [pendingNodePos, setPendingNodePos] = useState<{ lat: number; lng: number } | null>(null);
  const nodeRowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  // ─ Abschnitt-State ───────────────────────────────────────────────────────
  const [fromNodeId, setFromNodeId] = useState<string | null>(null);
  const [toNodeId,   setToNodeId]   = useState<string | null>(null);
  const [intermediate, setIntermediate] = useState<number[][]>([]);
  const [segForm, setSegForm] = useState<SegForm>(EMPTY_SEG);
  const [editSegId, setEditSegId] = useState<string | null>(null);
  const [deleteSegId, setDeleteSegId] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState(TODAY);
  const [segSearch, setSegSearch] = useState('');
  const segRowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  // Karten-Center: bevorzuge Knoten-Mittelpunkt, sonst Default
  const mapCenter: [number, number] = (() => {
    if (selectedNode) return [selectedNode.lat, selectedNode.lng];
    const fromN = nodes.find((n) => n.id === fromNodeId);
    if (fromN) return [fromN.lat, fromN.lng];
    if (nodes.length > 0) return [nodes[0].lat, nodes[0].lng];
    return DEFAULT_CENTER;
  })();

  // Länge auto aus Geometrie + Von/Bis-Knoten
  useEffect(() => {
    if (!fromNodeId || !toNodeId) return;
    const fromN = nodes.find((n) => n.id === fromNodeId);
    const toN   = nodes.find((n) => n.id === toNodeId);
    if (!fromN || !toN) return;
    const pts = [
      [fromN.lng, fromN.lat],
      ...intermediate,
      [toN.lng, toN.lat],
    ];
    const m = Math.round(lineLength(pts));
    setSegForm((f) => ({ ...f, length_m: String(m) }));
  }, [fromNodeId, toNodeId, intermediate, nodes]);

  // ─ Knoten-Aktionen ───────────────────────────────────────────────────────

  function handleAddNodeOnMap(lat: number, lng: number) {
    setPendingNodePos({ lat, lng });
    setNodeNameInput('');
  }

  function confirmAddNode() {
    if (!nodeNameInput.trim() || !pendingNodePos) return;
    nodeSave.mutate({ name: nodeNameInput.trim(), ...pendingNodePos }, {
      onSuccess: () => { setPendingNodePos(null); setNodeNameInput(''); },
    });
  }

  function handleMoveNode(id: string, lat: number, lng: number) {
    nodeSave.mutate({ id, name: nodes.find((n) => n.id === id)!.name, lat, lng });
  }

  function handleSelectNode(node: NetworkNode | null) {
    setSelectedNode(node);
    if (node) {
      setNodeNameInput(node.name);
      setTimeout(() => nodeRowRefs.current.get(node.id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    }
  }

  function handleRenameNode() {
    if (!selectedNode || !nodeNameInput.trim()) return;
    nodeSave.mutate({ ...selectedNode, name: nodeNameInput.trim() });
  }

  // ─ Abschnitt-Aktionen ────────────────────────────────────────────────────

  function handleNodeClickForSegment(node: NetworkNode) {
    if (!fromNodeId) {
      setFromNodeId(node.id);
    } else if (node.id === fromNodeId) {
      // Von-Knoten nochmal klicken = abbrechen
      resetSegment();
    } else if (!toNodeId) {
      setToNodeId(node.id);
    }
  }

  function resetSegment() {
    setFromNodeId(null); setToNodeId(null);
    setIntermediate([]); setSegForm(EMPTY_SEG); setEditSegId(null);
  }

  function loadSegForEdit(seg: RoadSegment) {
    setEditSegId(seg.id);
    setFromNodeId(seg.from_node_id ?? null);
    setToNodeId(seg.to_node_id ?? null);
    // Geometry ohne Von/Bis-Knoten = nur Zwischenpunkte
    const coords = seg.geometry?.coordinates ?? [];
    const mid = coords.slice(1, coords.length - 1); // ohne ersten und letzten
    setIntermediate(mid);
    setSegForm({
      id: seg.id,
      name: seg.name ?? '',
      strassen_klasse_asb: seg.strassen_klasse_asb ?? 'K',
      strassen_nummer: seg.strassen_nummer ?? '',
      abschnitts_nummer: seg.abschnitts_nummer ?? '',
      ast_nummer: seg.ast_nummer ?? '0',
      von_station: seg.von_station != null ? String(seg.von_station) : '0',
      length_m: seg.length_m != null ? String(seg.length_m) : '',
      gueltig_von: seg.gueltig_von ?? TODAY,
      gueltig_bis: seg.gueltig_bis ?? '',
    });
    setTimeout(() => segRowRefs.current.get(seg.id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }

  const saveSegMut = useMutation({
    mutationFn: async () => {
      const fromN = nodes.find((n) => n.id === fromNodeId);
      const toN   = nodes.find((n) => n.id === toNodeId);
      if (!fromN || !toN) throw new Error('Von- und Bis-Knoten auswählen');

      const geomCoords = [
        [fromN.lng, fromN.lat],
        ...intermediate,
        [toN.lng, toN.lat],
      ];
      const lenM  = parseFloat(segForm.length_m) || lineLength(geomCoords);
      const vonSt = parseFloat(segForm.von_station) || 0;

      const payload = {
        company_id:          profile!.company_id,
        from_node_id:        fromN.id,
        to_node_id:          toN.id,
        from_node:           fromN.name,
        to_node:             toN.name,
        name:                segForm.name.trim() || null,
        strassen_klasse_asb: segForm.strassen_klasse_asb || null,
        strassen_nummer:     segForm.strassen_nummer.trim() || null,
        abschnitts_nummer:   segForm.abschnitts_nummer.trim() || null,
        ast_nummer:          segForm.ast_nummer.trim() || '0',
        von_station:         vonSt,
        bis_station:         vonSt + lenM,
        length_m:            Math.round(lenM),
        gueltig_von:         segForm.gueltig_von || TODAY,
        gueltig_bis:         segForm.gueltig_bis || null,
        geometry:            { type: 'LineString', coordinates: geomCoords },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tbl = (supabase as any).from('road_segments');
      const { error } = editSegId
        ? await tbl.update(payload).eq('id', editSegId)
        : await tbl.insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['road-segments'] });
      resetSegment();
    },
  });

  const deleteSegMut = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('road_segments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['road-segments'] });
      if (editSegId === deleteSegId) resetSegment();
      setDeleteSegId(null);
    },
  });

  // Gefilterte Segmente
  const filteredSegs = segments.filter((s) => {
    if (s.gueltig_von && s.gueltig_von > filterDate) return false;
    if (s.gueltig_bis && s.gueltig_bis < filterDate) return false;
    const q = segSearch.trim().toLowerCase();
    if (!q) return true;
    return [s.from_node, s.to_node, s.name, s.strassen_nummer, s.abschnitts_nummer, s.strassen_klasse_asb]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  const fromNode = nodes.find((n) => n.id === fromNodeId);
  const toNode   = nodes.find((n) => n.id === toNodeId);
  const bisStation = segForm.von_station && segForm.length_m
    ? parseFloat(segForm.von_station) + parseFloat(segForm.length_m)
    : null;

  const canSaveSeg = !!fromNodeId && !!toNodeId;

  // ─ Render ─────────────────────────────────────────────────────────────────
  return (
    <AppShell title="Administration" subtitle="Straßennetz (ASB)" sidebar={ADMIN_SIDEBAR}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Straßennetz</h2>
          <p className="text-sm text-muted-foreground">
            {nodes.length} Netzknoten · {segments.length} Abschnitte · {areas.length} Flächen
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl border bg-white p-1 w-fit">
        <button onClick={() => setTab('knoten')}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm transition ${tab === 'knoten' ? 'bg-blue-600 font-medium text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
          <Network className="h-4 w-4" /> Netzknoten ({nodes.length})
        </button>
        <button onClick={() => setTab('abschnitte')}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm transition ${tab === 'abschnitte' ? 'bg-blue-600 font-medium text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
          <Route className="h-4 w-4" /> Abschnitte ({segments.length})
        </button>
        <button onClick={() => setTab('flaechen')}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm transition ${tab === 'flaechen' ? 'bg-blue-600 font-medium text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
          <Layers className="h-4 w-4" /> Flächen ({areas.length})
        </button>
      </div>

      {/* ════════ TAB: KNOTEN ════════ */}
      {tab === 'knoten' && (
        <div className="flex gap-4" style={{ height: 560 }}>

          {/* Panel */}
          <div className="flex w-80 flex-shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <MapPin className="h-4 w-4 text-blue-500" /> Netzknoten
            </div>

            <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
              Aktiviere <b>„Knoten setzen"</b> in der Karte und klicke auf die gewünschte Position.
              Bestehende Knoten können gezogen werden.
            </div>

            {/* Pending Node — Name eingeben */}
            {pendingNodePos && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3">
                <div className="mb-2 text-xs font-semibold text-emerald-700">Neuer Knoten</div>
                <div className="text-xs text-emerald-600 mb-2">
                  Position: {pendingNodePos.lat.toFixed(6)}, {pendingNodePos.lng.toFixed(6)}
                </div>
                <input
                  autoFocus
                  value={nodeNameInput}
                  onChange={(e) => setNodeNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmAddNode()}
                  placeholder="Knotenname, z. B. NK-101"
                  className="w-full rounded-lg border px-2 py-1.5 text-sm mb-2"
                />
                <div className="flex gap-2">
                  <button onClick={confirmAddNode} disabled={!nodeNameInput.trim() || nodeSave.isPending}
                    className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Anlegen
                  </button>
                  <button onClick={() => setPendingNodePos(null)}
                    className="rounded-lg border px-2 py-1.5 text-xs hover:bg-slate-50">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Ausgewählter Knoten */}
            {selectedNode && !pendingNodePos && (
              <div className="rounded-lg border bg-slate-50 p-3">
                <div className="mb-2 text-xs font-semibold text-slate-600">Knoten bearbeiten</div>
                <input value={nodeNameInput}
                  onChange={(e) => setNodeNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRenameNode()}
                  className="w-full rounded-lg border px-2 py-1.5 text-sm mb-2"
                />
                <div className="flex gap-2">
                  <button onClick={handleRenameNode} disabled={!nodeNameInput.trim() || nodeSave.isPending}
                    className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    <Save className="h-3.5 w-3.5" /> Umbenennen
                  </button>
                  <button onClick={() => nodeDel.mutate(selectedNode.id, { onSuccess: () => setSelectedNode(null) })}
                    disabled={nodeDel.isPending}
                    className="rounded-lg border border-red-200 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => { setSelectedNode(null); setNodeNameInput(''); }}
                    className="rounded-lg border px-2 py-1.5 text-xs hover:bg-slate-50">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                  {selectedNode.lat.toFixed(6)}, {selectedNode.lng.toFixed(6)}
                </div>
              </div>
            )}

            <hr />

            {/* Knoten-Liste */}
            <div className="text-xs font-medium text-slate-500">{nodes.length} Knoten</div>
            <div className="flex-1 overflow-y-auto space-y-0.5">
              {nodes.length === 0 && (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  Noch keine Knoten. Karte: „Knoten setzen" aktivieren.
                </div>
              )}
              {nodes.map((n) => (
                <div key={n.id}
                  ref={(el) => { if (el) nodeRowRefs.current.set(n.id, el as unknown as HTMLTableRowElement); }}
                  onClick={() => handleSelectNode(n)}
                  className={`flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50 ${selectedNode?.id === n.id ? 'bg-blue-50 font-medium text-blue-700' : ''}`}>
                  <span className="font-mono">{n.name}</span>
                  <span className="text-slate-400">{n.lat.toFixed(4)}, {n.lng.toFixed(4)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Karte */}
          <div className="relative flex-1 overflow-hidden rounded-xl border">
            <NetworkEditorMap
              center={mapCenter} zoom={14} mode="nodes"
              nodes={nodes} segments={segments}
              onAddNode={handleAddNodeOnMap}
              onMoveNode={handleMoveNode}
              onSelectNode={handleSelectNode}
              selectedNodeId={selectedNode?.id}
              fromNodeId={null} toNodeId={null}
              onNodeClickForSegment={() => {}}
              intermediatePoints={[]}
              onIntermediateChange={() => {}}
            />
          </div>
        </div>
      )}

      {/* ════════ TAB: ABSCHNITTE ════════ */}
      {tab === 'abschnitte' && (
        <>
          <div className="mb-4 flex gap-4" style={{ height: 560 }}>

            {/* Panel */}
            <div className="flex w-96 flex-shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border bg-white p-4">

              {/* Von/Bis-Auswahl Status */}
              <div className="rounded-lg border bg-slate-50 p-3">
                <div className="mb-2 text-xs font-semibold text-slate-600">Knotenauswahl</div>
                <div className="space-y-1.5 text-xs">
                  <div className={`flex items-center gap-2 rounded px-2 py-1.5 ${fromNode ? 'bg-emerald-50 text-emerald-800' : 'text-slate-400'}`}>
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white flex-shrink-0">A</span>
                    {fromNode ? <span className="font-mono font-medium">{fromNode.name}</span> : <span>Von-Knoten anklicken …</span>}
                    {fromNode && <button onClick={resetSegment} className="ml-auto text-slate-400 hover:text-slate-600"><X className="h-3 w-3" /></button>}
                  </div>
                  <div className={`flex items-center gap-2 rounded px-2 py-1.5 ${toNode ? 'bg-red-50 text-red-800' : 'text-slate-400'}`}>
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white flex-shrink-0">B</span>
                    {toNode ? <span className="font-mono font-medium">{toNode.name}</span> : <span>Bis-Knoten anklicken …</span>}
                  </div>
                </div>
                {fromNode && toNode && (
                  <div className="mt-2 text-[11px] text-slate-500">
                    {intermediate.length > 0 ? `${intermediate.length} Zwischenpunkt${intermediate.length > 1 ? 'e' : ''}` : 'Gerade Linie'} ·{' '}
                    {segForm.length_m ? formatLength(parseFloat(segForm.length_m)) : '?'}
                  </div>
                )}
              </div>

              {canSaveSeg && (
                <>
                  {/* Straßenklasse + Nummer */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Straßenklasse *</label>
                      <select value={segForm.strassen_klasse_asb}
                        onChange={(e) => setSegForm((f) => ({ ...f, strassen_klasse_asb: e.target.value }))}
                        className="w-full rounded-lg border px-2 py-1.5 text-sm">
                        {Object.entries(ASB_KLASSEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Straßennummer</label>
                      <input value={segForm.strassen_nummer}
                        onChange={(e) => setSegForm((f) => ({ ...f, strassen_nummer: e.target.value }))}
                        placeholder="K 12, L 1036"
                        className="w-full rounded-lg border px-2 py-1.5 text-sm" />
                    </div>
                  </div>

                  {/* Straßenname */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Straßenname</label>
                    <input value={segForm.name}
                      onChange={(e) => setSegForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="z. B. Hauptstraße"
                      className="w-full rounded-lg border px-2 py-1.5 text-sm" />
                  </div>

                  {/* Abschnitt + Ast */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Abschnittsnr.</label>
                      <input value={segForm.abschnitts_nummer}
                        onChange={(e) => setSegForm((f) => ({ ...f, abschnitts_nummer: e.target.value }))}
                        placeholder="100"
                        className="w-full rounded-lg border px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Ast-Nr.</label>
                      <input value={segForm.ast_nummer}
                        onChange={(e) => setSegForm((f) => ({ ...f, ast_nummer: e.target.value }))}
                        placeholder="0"
                        className="w-full rounded-lg border px-2 py-1.5 text-sm" />
                    </div>
                  </div>

                  {/* Stationierung */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Von-Station (m)</label>
                      <input type="number" min="0" value={segForm.von_station}
                        onChange={(e) => setSegForm((f) => ({ ...f, von_station: e.target.value }))}
                        className="w-full rounded-lg border px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Länge (m) <span className="text-emerald-600">auto</span></label>
                      <input type="number" value={segForm.length_m}
                        onChange={(e) => setSegForm((f) => ({ ...f, length_m: e.target.value }))}
                        className="w-full rounded-lg border px-2 py-1.5 text-sm" />
                    </div>
                  </div>

                  {/* Stationsvorschau */}
                  {bisStation != null && (
                    <div className="rounded bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500">
                      ASB: <span className="font-mono text-slate-700">{formatStationAsb(parseFloat(segForm.von_station || '0'))}</span>
                      {' '}–{' '}
                      <span className="font-mono text-slate-700">{formatStationAsb(bisStation)}</span> m
                    </div>
                  )}

                  {/* Gültigkeit */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Gültig von</label>
                      <input type="date" value={segForm.gueltig_von}
                        onChange={(e) => setSegForm((f) => ({ ...f, gueltig_von: e.target.value }))}
                        className="w-full rounded-lg border px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Gültig bis (∞)</label>
                      <input type="date" value={segForm.gueltig_bis}
                        onChange={(e) => setSegForm((f) => ({ ...f, gueltig_bis: e.target.value }))}
                        min={segForm.gueltig_von}
                        className="w-full rounded-lg border px-2 py-1.5 text-sm" />
                    </div>
                  </div>

                  <div className="flex-1" />

                  {/* Save */}
                  <div className="space-y-2">
                    {saveSegMut.isError && (
                      <p className="text-xs text-red-600">{(saveSegMut.error as Error).message}</p>
                    )}
                    <button onClick={() => saveSegMut.mutate()} disabled={saveSegMut.isPending}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                      <Save className="h-4 w-4" />
                      {saveSegMut.isPending ? 'Speichern …' : editSegId ? 'Änderungen speichern' : 'Abschnitt anlegen'}
                    </button>
                    <button onClick={resetSegment}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
                      <X className="h-4 w-4" /> Abbrechen
                    </button>
                  </div>
                </>
              )}

              {!fromNode && (
                <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground text-center px-4">
                  Klicke in der Karte auf <b className="mx-1">Knoten A</b>, dann auf <b className="mx-1">Knoten B</b>, um einen Abschnitt zu zeichnen.
                </div>
              )}
            </div>

            {/* Karte */}
            <div className="relative flex-1 overflow-hidden rounded-xl border">
              <NetworkEditorMap
                center={mapCenter} zoom={14} mode="segments"
                nodes={nodes} segments={filteredSegs}
                onAddNode={() => {}}
                onMoveNode={() => {}}
                onSelectNode={() => {}}
                fromNodeId={fromNodeId} toNodeId={toNodeId}
                onNodeClickForSegment={handleNodeClickForSegment}
                intermediatePoints={intermediate}
                onIntermediateChange={setIntermediate}
                selectedSegmentId={editSegId}
                onSegmentClick={(id) => {
                  const seg = segments.find((s) => s.id === id);
                  if (seg) loadSegForEdit(seg);
                }}
              />
            </div>
          </div>

          {/* Abschnitte-Tabelle */}
          <div className="rounded-xl border bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <h3 className="font-medium">Abschnitte ({filteredSegs.length} von {segments.length})</h3>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">Gültig am</label>
                  <input type="date" value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="rounded-lg border px-2 py-1.5 text-sm" />
                  <button onClick={() => setFilterDate(TODAY)} className="text-xs text-blue-600 underline">Heute</button>
                </div>
                <input value={segSearch} onChange={(e) => setSegSearch(e.target.value)}
                  placeholder="Suche …" className="rounded-lg border px-3 py-1.5 text-sm w-52" />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Klasse</th>
                    <th className="px-3 py-2 text-left">Str.-Nr.</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Von Knoten</th>
                    <th className="px-3 py-2 text-left">Bis Knoten</th>
                    <th className="px-3 py-2 text-right">Station</th>
                    <th className="px-3 py-2 text-right">Länge</th>
                    <th className="px-3 py-2 text-left">Gültig</th>
                    <th className="px-3 py-2 text-right">Akt.</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {segLoading && <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">Lade …</td></tr>}
                  {segError && <tr><td colSpan={9} className="px-4 py-6 text-center text-red-600">{(segError as Error).message}</td></tr>}
                  {!segLoading && filteredSegs.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      {segSearch ? 'Keine Treffer.' : 'Noch keine Abschnitte. Oben Knoten A→B wählen.'}
                    </td></tr>
                  )}
                  {filteredSegs.map((seg) => (
                    <tr key={seg.id}
                      ref={(el) => { if (el) segRowRefs.current.set(seg.id, el); else segRowRefs.current.delete(seg.id); }}
                      className={`cursor-pointer hover:bg-slate-50 ${editSegId === seg.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : ''}`}
                      onClick={() => loadSegForEdit(seg)}>
                      <td className="px-3 py-2">
                        {seg.strassen_klasse_asb
                          ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ASB_FARBEN[seg.strassen_klasse_asb] ?? 'bg-slate-100'}`}>{seg.strassen_klasse_asb}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{seg.strassen_nummer ?? '—'}</td>
                      <td className="px-3 py-2">{seg.name ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2 font-mono text-xs text-emerald-700">{seg.from_node}</td>
                      <td className="px-3 py-2 font-mono text-xs text-red-700">{seg.to_node}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {seg.von_station != null ? formatStationAsb(seg.von_station) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{seg.length_m != null ? formatLength(seg.length_m) : '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="text-slate-500">{seg.gueltig_von ?? '—'}</span>
                        {' – '}
                        <span className={seg.gueltig_bis ? 'text-slate-500' : 'text-emerald-600'}>{seg.gueltig_bis ?? '∞'}</span>
                      </td>
                      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => loadSegForEdit(seg)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setDeleteSegId(seg.id)}
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
        </>
      )}

      {/* ════════ TAB: FLÄCHEN ════════ */}
      {tab === 'flaechen' && (
        <div className="flex gap-4" style={{ height: 560 }}>

          {/* Panel */}
          <div className="flex w-80 flex-shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Layers className="h-4 w-4 text-blue-500" /> Fläche anlegen / bearbeiten
            </div>

            <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
              Aktiviere <b>„Zeichnen"</b> in der Karte, umfahre die Fläche und fülle die Attribute aus.
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Name *</label>
              <input value={areaForm.name}
                onChange={(e) => setAreaForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="z. B. Stadtpark Erfurt"
                className="w-full rounded-lg border px-3 py-2 text-sm" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Flächentyp</label>
              <select value={areaForm.area_type}
                onChange={(e) => setAreaForm((f) => ({ ...f, area_type: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm">
                {Object.entries(AREA_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              {/* Farbvorschau */}
              <div className="mt-1.5 flex items-center gap-2 text-xs">
                <span className="h-3 w-3 rounded-sm border"
                  style={{ background: AREA_TYPE_COLORS[areaForm.area_type]?.fill, borderColor: AREA_TYPE_COLORS[areaForm.area_type]?.border }} />
                <span className="text-muted-foreground">Kartenfarbe</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Gültig von</label>
                <input type="date" value={areaForm.gueltig_von}
                  onChange={(e) => setAreaForm((f) => ({ ...f, gueltig_von: e.target.value }))}
                  className="w-full rounded-lg border px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Gültig bis (∞)</label>
                <input type="date" value={areaForm.gueltig_bis}
                  onChange={(e) => setAreaForm((f) => ({ ...f, gueltig_bis: e.target.value }))}
                  className="w-full rounded-lg border px-2 py-1.5 text-sm" />
              </div>
            </div>

            {/* Flächen-Statistik */}
            {areaPoints.length >= 3 && (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="font-medium mb-1">Gezeichnete Fläche</div>
                <div className="grid grid-cols-2 gap-x-2">
                  <span>Punkte:</span><span className="font-mono">{areaPoints.length}</span>
                  <span>Fläche:</span><span className="font-mono text-emerald-600">{formatArea(polygonArea(areaPoints))}</span>
                </div>
              </div>
            )}

            <div className="flex-1" />

            {areaSave.isError && (
              <p className="text-xs text-red-600">{(areaSave.error as Error).message}</p>
            )}
            <button
              onClick={() => {
                if (!areaForm.name.trim() || areaPoints.length < 3) return;
                const coords = [...areaPoints, areaPoints[0]]; // Ring schließen
                areaSave.mutate({
                  id: areaForm.id || undefined,
                  name: areaForm.name.trim(),
                  area_type: areaForm.area_type,
                  gueltig_von: areaForm.gueltig_von || TODAY,
                  gueltig_bis: areaForm.gueltig_bis || null,
                  geometry: { type: 'Polygon', coordinates: [coords] },
                }, {
                  onSuccess: () => {
                    setAreaForm({ id: '', name: '', area_type: 'park', gueltig_von: TODAY, gueltig_bis: '' });
                    setAreaPoints([]);
                  },
                });
              }}
              disabled={!areaForm.name.trim() || areaPoints.length < 3 || areaSave.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              <Save className="h-4 w-4" />
              {areaSave.isPending ? 'Speichern …' : areaForm.id ? 'Änderungen speichern' : 'Fläche anlegen'}
            </button>
            {areaForm.id && (
              <button onClick={() => { setAreaForm({ id: '', name: '', area_type: 'park', gueltig_von: TODAY, gueltig_bis: '' }); setAreaPoints([]); }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
                <X className="h-4 w-4" /> Abbrechen
              </button>
            )}

            <hr />

            {/* Flächen-Liste */}
            <div className="text-xs font-medium text-slate-500">{areas.length} Flächen</div>
            <div className="space-y-0.5 overflow-y-auto">
              {areasQ.isLoading && <div className="py-2 text-center text-xs text-muted-foreground">Lade …</div>}
              {areas.length === 0 && !areasQ.isLoading && (
                <div className="py-4 text-center text-xs text-muted-foreground">Noch keine Flächen.</div>
              )}
              {areas.map((a) => (
                <div key={a.id}
                  className={`flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50 ${areaForm.id === a.id ? 'bg-blue-50 text-blue-700' : ''}`}
                  onClick={() => {
                    setAreaForm({
                      id: a.id, name: a.name, area_type: a.area_type,
                      gueltig_von: a.gueltig_von ?? TODAY,
                      gueltig_bis: a.gueltig_bis ?? '',
                    });
                    // Innere Ring-Koordinaten ohne letzten Schlusspunkt
                    const coords = a.geometry.coordinates[0];
                    setAreaPoints(coords.slice(0, -1));
                  }}>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                      style={{ background: AREA_TYPE_COLORS[a.area_type]?.fill }} />
                    <span className="font-medium">{a.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">{AREA_TYPE_LABELS[a.area_type]}</span>
                    <button onClick={(e) => { e.stopPropagation(); setDeleteAreaId(a.id); }}
                      className="ml-1 rounded p-0.5 text-red-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Karte mit GeometryDrawer */}
          <div className="relative flex-1 overflow-hidden rounded-xl border">
            <GeometryDrawer
              center={mapCenter} zoom={15}
              type="polygon"
              points={areaPoints}
              onChange={setAreaPoints}
            />
          </div>
        </div>
      )}

      {/* Löschen-Dialog Fläche — z-[9999] damit er vor der Karte liegt */}
      {deleteAreaId && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 font-semibold">Fläche löschen?</h3>
            <p className="mb-6 text-sm text-muted-foreground">Die Fläche wird unwiderruflich gelöscht.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteAreaId(null)} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">Abbrechen</button>
              <button onClick={() => areaDel.mutate(deleteAreaId, { onSuccess: () => { setDeleteAreaId(null); if (areaForm.id === deleteAreaId) { setAreaForm({ id: '', name: '', area_type: 'park', gueltig_von: TODAY, gueltig_bis: '' }); setAreaPoints([]); } } })}
                disabled={areaDel.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {areaDel.isPending ? 'Lösche …' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Löschen-Dialog Segment — z-[9999] damit er vor der Karte liegt */}
      {deleteSegId && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 font-semibold">Abschnitt löschen?</h3>
            <p className="mb-6 text-sm text-muted-foreground">Schäden verlieren die Netzreferenz zu diesem Abschnitt.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteSegId(null)} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">Abbrechen</button>
              <button onClick={() => deleteSegMut.mutate(deleteSegId)} disabled={deleteSegMut.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {deleteSegMut.isPending ? 'Lösche …' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
