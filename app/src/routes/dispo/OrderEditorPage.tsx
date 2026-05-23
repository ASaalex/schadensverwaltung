import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DISPO_SIDEBAR } from './sidebar';
import { useCompanies } from '@/hooks/useCompanies';
import { useDamageList, type DamageListItem } from '@/hooks/useDamageList';
import { useAuth } from '@/auth/AuthContext';
import { createOrder, type OrderDraft } from '@/lib/saveOrder';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, GripVertical, X, Plus, Send, Save, Loader2, AlertCircle, Search } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface PositionDraft {
  damage_id: string;
  planned_date: string | null;
  planned_start_time: string | null;
  planned_end_time: string | null;
}

const PRIO_BADGE: Record<string, string> = {
  niedrig: 'bg-slate-100 text-slate-600',
  normal: 'bg-blue-100 text-blue-700',
  hoch: 'bg-orange-100 text-orange-700',
  dringend: 'bg-red-100 text-red-700',
};

export function DispoOrderEditorPage() {
  const nav = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data: companies = [] } = useCompanies();
  const { data: allDamages = [], isLoading: damagesLoading } = useDamageList();

  // Initial-Auswahl aus Navigation-State (von DispoDamagesPage)
  const initialIds: string[] = (location.state as { damageIds?: string[] } | null)?.damageIds ?? [];
  const [positions, setPositions] = useState<PositionDraft[]>(() =>
    initialIds.map((id) => ({
      damage_id: id,
      planned_date: null,
      planned_start_time: null,
      planned_end_time: null,
    })),
  );

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [companyId, setCompanyId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Default-Firma = erste verfügbare; Default-Datum = morgen
  useEffect(() => {
    if (!companyId && companies.length > 0) setCompanyId(companies[0].id);
  }, [companies, companyId]);
  useEffect(() => {
    if (!startDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setStartDate(tomorrow.toISOString().slice(0, 10));
      setEndDate(tomorrow.toISOString().slice(0, 10));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default-Titel basierend auf Auswahl
  useEffect(() => {
    if (title || positions.length === 0) return;
    const damageObjs = allDamages.filter((d) => positions.some((p) => p.damage_id === d.id));
    if (damageObjs.length === 0) return;
    const categories = [...new Set(damageObjs.map((d) => d.category_name).filter(Boolean) as string[])];
    if (categories.length === 1) setTitle(categories[0]);
    else if (categories.length > 1) setTitle(categories[0] + ' u.a.');
  }, [positions, allDamages, title]);

  // Damage-Daten als Map für schnellen Lookup
  const damageMap = useMemo(
    () => new Map(allDamages.map((d) => [d.id, d])),
    [allDamages],
  );

  // Schäden, die bereits in einem aktiven (= nicht stornierten) Auftrag sind, ausschließen
  const [assignedDamageIds, setAssignedDamageIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let active = true;
    supabase
      .from('order_items')
      .select('damage_id, order:orders!order_id ( status )')
      .then(({ data, error }) => {
        if (error || !active) return;
        const rows = (data ?? []) as unknown as Array<{
          damage_id: string;
          order: { status: string } | null;
        }>;
        const ids = new Set<string>();
        for (const r of rows) {
          if (r.order && r.order.status !== 'storniert') {
            ids.add(r.damage_id);
          }
        }
        if (active) setAssignedDamageIds(ids);
      });
    return () => {
      active = false;
    };
  }, [allDamages]);

  // Verfügbare Schäden zum Hinzufügen
  const [showAddDamage, setShowAddDamage] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const availableDamages = useMemo(() => {
    const positionIds = new Set(positions.map((p) => p.damage_id));
    const q = addSearch.trim().toLowerCase();
    return allDamages
      .filter((d) => !positionIds.has(d.id))
      // nur offene Schäden (neu / geprüft), die nicht bereits in einem anderen Auftrag sind
      .filter((d) => d.status === 'neu' || d.status === 'geprueft')
      .filter((d) => !assignedDamageIds.has(d.id))
      .filter((d) => {
        if (!q) return true;
        return [d.code, d.description, d.category_name, d.address_street, d.address_city]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 50);
  }, [allDamages, positions, addSearch, assignedDamageIds]);

  // ============= DnD =============
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setPositions((items) => {
      const oldIndex = items.findIndex((i) => i.damage_id === active.id);
      const newIndex = items.findIndex((i) => i.damage_id === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  }

  function updatePosition(damageId: string, patch: Partial<PositionDraft>) {
    setPositions((items) =>
      items.map((i) => (i.damage_id === damageId ? { ...i, ...patch } : i)),
    );
  }

  function removePosition(damageId: string) {
    setPositions((items) => items.filter((i) => i.damage_id !== damageId));
  }

  function addDamage(d: DamageListItem) {
    setPositions((items) => [
      ...items,
      {
        damage_id: d.id,
        planned_date: null,
        planned_start_time: null,
        planned_end_time: null,
      },
    ]);
    setShowAddDamage(false);
    setAddSearch('');
  }

  // ============= Tagesplanung =============
  const isMultiDay = !!startDate && !!endDate && startDate !== endDate;
  const dayList: string[] = useMemo(() => {
    if (!startDate || !endDate) return [];
    const days: string[] = [];
    const cur = new Date(startDate);
    const end = new Date(endDate);
    while (cur <= end) {
      days.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }, [startDate, endDate]);

  // ============= Speichern =============
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(asStatus: 'entwurf' | 'versendet') {
    if (!profile) return;
    if (positions.length === 0) {
      setError('Mindestens eine Position erforderlich.');
      return;
    }
    if (!title.trim()) {
      setError('Bitte einen Titel angeben.');
      return;
    }
    if (!companyId) {
      setError('Bitte eine Firma auswählen.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const draft: OrderDraft = {
        title: title.trim(),
        description: description.trim() || null,
        assigned_company_id: companyId,
        planned_start_date: startDate || null,
        planned_end_date: endDate || null,
        status: asStatus,
        positions: positions.map((p, i) => ({
          damage_id: p.damage_id,
          sort_order: i + 1,
          planned_date: p.planned_date,
          planned_start_time: p.planned_start_time,
          planned_end_time: p.planned_end_time,
        })),
      };
      const saved = await createOrder(profile, draft);
      // Caches invalidieren
      qc.invalidateQueries({ queryKey: ['orders-list'] });
      qc.invalidateQueries({ queryKey: ['damage-list'] });
      nav(`/dispo/orders/${saved.id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <AppShell title="Disposition" subtitle="Neuer Auftrag" sidebar={DISPO_SIDEBAR}>
      <Link to="/dispo/orders" className="mb-3 flex items-center gap-1 text-sm text-slate-500">
        <ArrowLeft className="h-4 w-4" /> Zurück zur Liste
      </Link>

      <h2 className="mb-1 text-2xl font-semibold">Neuer Auftrag</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        {positions.length} Position(en) · Reihenfolge per Drag &amp; Drop
      </p>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LINKE SPALTE — Auftrag + Positionen */}
        <div className="space-y-4 lg:col-span-2">
          {/* Stammdaten */}
          <div className="space-y-3 rounded-xl border bg-white p-4">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Titel</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="z.B. Schlaglöcher Nordbezirk"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">
                  Ausführende Firma
                </label>
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.type === 'internal_bauhof' ? '(intern)' : '(extern)'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Zeitraum</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (!endDate || e.target.value > endDate) setEndDate(e.target.value);
                    }}
                    className="w-full rounded-lg border px-2 py-2 text-sm"
                  />
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border px-2 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">
                Beschreibung <span className="font-normal normal-case text-slate-400">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Positionen mit DnD */}
          <div className="overflow-hidden rounded-xl border bg-white">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="font-medium">Reihenfolge der Schäden</div>
              <button
                onClick={() => setShowAddDamage((s) => !s)}
                className="flex items-center gap-1 text-sm text-blue-600"
              >
                <Plus className="h-4 w-4" /> Schaden hinzufügen
              </button>
            </div>

            {/* Schadens-Auswahl */}
            {showAddDamage && (
              <div className="border-b bg-slate-50 p-3">
                <div className="relative mb-2">
                  <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    autoFocus
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    placeholder="Suche nach ID, Adresse, Kategorie …"
                    className="w-full rounded-lg border py-1.5 pl-7 pr-2 text-sm"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto rounded border bg-white">
                  {damagesLoading && <div className="p-3 text-sm text-muted-foreground">Lade …</div>}
                  {!damagesLoading && availableDamages.length === 0 && (
                    <div className="p-3 text-sm text-muted-foreground">Keine offenen Schäden gefunden.</div>
                  )}
                  {availableDamages.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => addDamage(d)}
                      className="block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50 last:border-b-0"
                    >
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{d.code}</span>
                        <span className={`rounded-full px-1.5 py-0.5 ${PRIO_BADGE[d.priority] ?? 'bg-slate-100'}`}>
                          {d.priority}
                        </span>
                      </div>
                      <div className="text-sm">{d.category_name ?? 'Kategorie?'}</div>
                      <div className="text-xs text-muted-foreground">
                        {[d.address_street, d.address_city].filter(Boolean).join(', ') || '—'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* DnD-Liste */}
            {positions.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Noch keine Positionen. Klick oben auf "Schaden hinzufügen".
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={positions.map((p) => p.damage_id)}
                  strategy={verticalListSortingStrategy}
                >
                  {positions.map((p, idx) => {
                    const dmg = damageMap.get(p.damage_id);
                    return (
                      <SortablePositionRow
                        key={p.damage_id}
                        damage={dmg}
                        position={p}
                        index={idx}
                        isMultiDay={isMultiDay}
                        dayList={dayList}
                        onUpdate={(patch) => updatePosition(p.damage_id, patch)}
                        onRemove={() => removePosition(p.damage_id)}
                      />
                    );
                  })}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        {/* RECHTE SPALTE — Zusammenfassung + Aktionen */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <div className="mb-2 font-medium">Zusammenfassung</div>
            <div className="space-y-1.5 text-sm">
              <Row label="Positionen" value={String(positions.length)} />
              <Row label="Tage" value={String(dayList.length || 1)} />
              <Row
                label="Firma"
                value={companies.find((c) => c.id === companyId)?.name ?? '—'}
              />
              <Row
                label="Start"
                value={startDate ? new Date(startDate).toLocaleDateString('de-DE') : '—'}
              />
              {isMultiDay && (
                <Row label="Ende" value={new Date(endDate).toLocaleDateString('de-DE')} />
              )}
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => handleSave('versendet')}
              disabled={saving || positions.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Versenden
            </button>
            <button
              onClick={() => handleSave('entwurf')}
              disabled={saving || positions.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-100 py-2.5 font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> Als Entwurf speichern
            </button>
          </div>
        </div>
      </div>
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

function SortablePositionRow({
  damage,
  position,
  index,
  isMultiDay,
  dayList,
  onUpdate,
  onRemove,
}: {
  damage: DamageListItem | undefined;
  position: PositionDraft;
  index: number;
  isMultiDay: boolean;
  dayList: string[];
  onUpdate: (patch: Partial<PositionDraft>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: position.damage_id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 border-b px-4 py-3 ${isDragging ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
        aria-label="Ziehen zum Sortieren"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{damage?.code ?? position.damage_id.slice(0, 8)}</span>
          {damage && (
            <span className={`rounded-full px-1.5 py-0.5 ${PRIO_BADGE[damage.priority] ?? 'bg-slate-100'}`}>
              {damage.priority}
            </span>
          )}
        </div>
        <div className="truncate text-sm font-medium">{damage?.category_name ?? '—'}</div>
        <div className="truncate text-xs text-muted-foreground">
          {[damage?.address_street, damage?.address_city].filter(Boolean).join(', ') || '—'}
        </div>
      </div>

      {isMultiDay && (
        <select
          value={position.planned_date ?? ''}
          onChange={(e) => onUpdate({ planned_date: e.target.value || null })}
          className="rounded border px-1.5 py-1 text-xs"
        >
          <option value="">— Tag —</option>
          {dayList.map((d) => (
            <option key={d} value={d}>
              {new Date(d).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
            </option>
          ))}
        </select>
      )}

      <input
        type="time"
        value={position.planned_start_time ?? ''}
        onChange={(e) => onUpdate({ planned_start_time: e.target.value || null })}
        className="w-24 rounded border px-1.5 py-1 text-xs"
        placeholder="Start"
      />
      <input
        type="time"
        value={position.planned_end_time ?? ''}
        onChange={(e) => onUpdate({ planned_end_time: e.target.value || null })}
        className="w-24 rounded border px-1.5 py-1 text-xs"
        placeholder="Ende"
      />

      <button onClick={onRemove} className="text-slate-400 hover:text-red-600" title="Position entfernen">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
