import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Modal } from '@/components/ui/Modal';
import { ADMIN_SIDEBAR } from './sidebar';
import { useCategoryTree } from '@/hooks/useCategoryTree';
import { useCompanies } from '@/hooks/useCompanies';
import { useAuth } from '@/auth/AuthContext';
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from '@/lib/adminActions';
import {
  Folder,
  Tag,
  MapPin,
  Minus,
  Hexagon,
  Plus,
  Edit3,
  Archive,
  ArchiveRestore,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import type { CategoryNode } from '@/lib/categories';
import type { GeometryType, Priority, PropertyFieldDef, FieldType } from '@/types/database';
import { useNetworkObjectTypes } from '@/hooks/useNetworkObjectTypes';

const GEOM_ICON = { point: MapPin, line: Minus, polygon: Hexagon } as const;
const GEOM_LABEL: Record<GeometryType, string> = {
  point: 'Punkt',
  line: 'Linie',
  polygon: 'Fläche',
};
const PRIO_VALUES: (Priority | '')[] = ['', 'niedrig', 'normal', 'hoch', 'dringend'];
const FIELD_TYPES: FieldType[] = ['text', 'number', 'decimal', 'select', 'boolean', 'date'];

interface FormState {
  parent_id: string | null;
  name: string;
  code: string;
  geometry_types: GeometryType[];
  default_priority: Priority | null;
  default_company_id: string | null;
  property_schema: PropertyFieldDef[];
  object_type_ids: string[];
  active: boolean;
}

export function AdminCategoriesPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [showInactive, setShowInactive] = useState(false);
  const { data: tree = [], isLoading, error } = useCategoryTree({ includeInactive: showInactive });
  const { data: companies = [] } = useCompanies();
  const { query: objTypeQ } = useNetworkObjectTypes();
  const objTypes = objTypeQ.data ?? [];

  // Edit-Modus
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(null));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function emptyForm(parentId: string | null): FormState {
    return {
      parent_id: parentId,
      name: '',
      code: '',
      geometry_types: ['point'],
      default_priority: null,
      default_company_id: null,
      property_schema: [],
      object_type_ids: [],
      active: true,
    };
  }

  function openCreate(parent: CategoryNode | null) {
    setEditingId(null);
    setForm(emptyForm(parent?.id ?? null));
    setSaveError(null);
    setModalOpen(true);
  }

  function openEdit(node: CategoryNode) {
    setEditingId(node.id);
    setForm({
      parent_id: node.parent_id,
      name: node.name,
      code: node.code ?? '',
      geometry_types: node.geometry_types.length > 0 ? node.geometry_types : [node.geometry_type ?? 'point'],
      default_priority: node.default_priority,
      default_company_id: node.default_company_id,
      property_schema: node.property_schema ?? [],
      object_type_ids: (node as unknown as { object_type_ids?: string[] }).object_type_ids ?? [],
      active: node.active,
    });
    setSaveError(null);
    setModalOpen(true);
  }

  function toggleGeometryType(g: GeometryType) {
    setForm((f) => {
      const present = f.geometry_types.includes(g);
      let next = present ? f.geometry_types.filter((t) => t !== g) : [...f.geometry_types, g];
      // mind. 1 muss aktiv bleiben
      if (next.length === 0) next = [g];
      // Stabile Reihenfolge: point, line, polygon
      const order: GeometryType[] = ['point', 'line', 'polygon'];
      next.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      return { ...f, geometry_types: next };
    });
  }

  async function handleSave() {
    setSaveError(null);
    if (!form.name.trim()) {
      setSaveError('Name ist Pflicht.');
      return;
    }
    if (!profile) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateCategory(editingId, {
          name: form.name,
          code: form.code,
          geometry_types: form.geometry_types,
          default_priority: form.default_priority,
          default_company_id: form.default_company_id,
          property_schema: form.property_schema,
          object_type_ids: form.object_type_ids,
          active: form.active,
        } as Parameters<typeof updateCategory>[1]);
      } else {
        await createCategory(profile.company_id, {
          parent_id: form.parent_id,
          name: form.name,
          code: form.code,
          geometry_types: form.geometry_types,
          default_priority: form.default_priority,
          default_company_id: form.default_company_id,
          property_schema: form.property_schema,
        });
      }
      await qc.invalidateQueries({ queryKey: ['category-tree'] });
      setModalOpen(false);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(node: CategoryNode) {
    try {
      if (node.active) {
        await deleteCategory(node.id); // = deaktiviert
      } else {
        await updateCategory(node.id, { active: true });
      }
      await qc.invalidateQueries({ queryKey: ['category-tree'] });
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // Custom-Field-Editor
  function addField() {
    const newField: PropertyFieldDef = {
      name: `field_${form.property_schema.length + 1}`,
      label: 'Neues Feld',
      field_type: 'text',
      required: false,
    };
    setForm((f) => ({ ...f, property_schema: [...f.property_schema, newField] }));
  }
  function removeField(idx: number) {
    setForm((f) => ({ ...f, property_schema: f.property_schema.filter((_, i) => i !== idx) }));
  }
  function updateField(idx: number, patch: Partial<PropertyFieldDef>) {
    setForm((f) => ({
      ...f,
      property_schema: f.property_schema.map((field, i) => (i === idx ? { ...field, ...patch } : field)),
    }));
  }

  // Tree kommt schon vorgefiltert vom Hook (showInactive bestimmt das Query)
  const filteredTree = tree;
  const total = countNodes(filteredTree);

  return (
    <AppShell title="Administration" subtitle="Schadenskatalog" accent="slate" sidebar={ADMIN_SIDEBAR}>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Schadenskatalog</h2>
          <p className="text-sm text-muted-foreground">
            {total} Einträge · mehrstufiger Baum mit Geometrie-Typ und Custom Fields
          </p>
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Inaktive zeigen
          </label>
          <button
            onClick={() => openCreate(null)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Neue Hauptkategorie
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(error as Error).message}
        </div>
      )}

      {isLoading && <div className="text-sm text-muted-foreground">Lade …</div>}

      {filteredTree && (
        <div className="rounded-xl border bg-white p-3">
          <ul>
            {filteredTree.map((n) => (
              <TreeRow key={n.id} node={n} depth={0} onEdit={openEdit} onAddChild={openCreate} onToggle={toggleActive} />
            ))}
          </ul>
        </div>
      )}

      {/* ============ EDIT/CREATE MODAL ============ */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Kategorie bearbeiten' : 'Neue Kategorie'}
        description={
          form.parent_id ? 'Unter-Kategorie eines vorhandenen Knotens' : 'Hauptkategorie auf Wurzel-Ebene'
        }
        size="lg"
      >
        <div className="space-y-3">
          {saveError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {saveError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                autoFocus
              />
            </Field>
            <Field label="Kurzcode (optional)">
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="z.B. STR-BEL-SCHL"
                className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
              />
            </Field>
          </div>

          <Field label="Erlaubte Geometrie-Typen">
            <div className="grid grid-cols-3 gap-2">
              {(['point', 'line', 'polygon'] as GeometryType[]).map((g) => {
                const Icon = GEOM_ICON[g];
                const active = form.geometry_types.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGeometryType(g)}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition ${
                      active ? 'border-blue-600 bg-blue-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${active ? 'text-blue-600' : 'text-slate-500'}`} />
                    <span className={`text-xs ${active ? 'font-medium text-blue-700' : ''}`}>
                      {GEOM_LABEL[g]}
                    </span>
                    {active && <span className="text-[10px] text-blue-600">✓ aktiv</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Mehrere wählbar — der Erfasser entscheidet beim Anlegen, welcher Typ verwendet wird.
              Mindestens einer muss aktiv sein.
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Standard-Priorität">
              <select
                value={form.default_priority ?? ''}
                onChange={(e) =>
                  setForm({ ...form, default_priority: (e.target.value || null) as Priority | null })
                }
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                {PRIO_VALUES.map((p) => (
                  <option key={p} value={p}>{p || '— keine —'}</option>
                ))}
              </select>
            </Field>
            <Field label="Standard-Firma">
              <select
                value={form.default_company_id ?? ''}
                onChange={(e) =>
                  setForm({ ...form, default_company_id: e.target.value || null })
                }
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">— keine —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Netz-Objekttypen verknüpfen */}
          {objTypes.length > 0 && (
            <div className="border-t pt-3">
              <label className="mb-2 block text-xs uppercase tracking-wider text-slate-500">
                Verknüpfte Objekttypen (für Objekt-Vorschlag beim Erfassen)
              </label>
              <div className="space-y-1">
                {objTypes.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                    <input type="checkbox"
                      checked={form.object_type_ids.includes(t.id)}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        object_type_ids: e.target.checked
                          ? [...f.object_type_ids, t.id]
                          : f.object_type_ids.filter((id) => id !== t.id),
                      }))}
                      className="h-4 w-4 rounded" />
                    <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: t.color }} />
                    <span>{t.name}</span>
                    <span className="text-xs text-muted-foreground">({t.geometry_type === 'point' ? 'Punkt' : t.geometry_type === 'line' ? 'Linie' : 'Fläche'})</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Custom-Fields */}
          <div className="border-t pt-3">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs uppercase tracking-wider text-slate-500">
                Eigenschaften (Custom Fields)
              </label>
              <button
                type="button"
                onClick={addField}
                className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                <Plus className="h-3 w-3" /> Feld
              </button>
            </div>
            {form.property_schema.length === 0 && (
              <div className="rounded border border-dashed border-slate-200 p-3 text-center text-xs text-muted-foreground">
                Keine zusätzlichen Felder. Klick "+ Feld" um eines hinzuzufügen.
              </div>
            )}
            <div className="space-y-2">
              {form.property_schema.map((f, idx) => (
                <PropertyFieldEditor
                  key={idx}
                  field={f}
                  onChange={(patch) => updateField(idx, patch)}
                  onRemove={() => removeField(idx)}
                />
              ))}
            </div>
          </div>

          {editingId && (
            <div className="flex items-center gap-2 border-t pt-3 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                id="cat-active"
                className="h-4 w-4"
              />
              <label htmlFor="cat-active">Aktiv (bei Erfassung wählbar)</label>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t pt-3">
            <button
              onClick={() => setModalOpen(false)}
              className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50"
              disabled={saving}
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? 'Speichern' : 'Anlegen'}
            </button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}

function TreeRow({
  node,
  depth,
  onEdit,
  onAddChild,
  onToggle,
}: {
  node: CategoryNode;
  depth: number;
  onEdit: (n: CategoryNode) => void;
  onAddChild: (parent: CategoryNode) => void;
  onToggle: (n: CategoryNode) => void;
}) {
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className={`group flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50 ${
          !node.active ? 'opacity-50' : ''
        }`}
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        {hasChildren ? (
          <Folder className="h-4 w-4 text-amber-500" />
        ) : (
          <Tag className="h-3.5 w-3.5 text-slate-400" />
        )}
        <span className="font-medium">{node.name}</span>
        {node.code && <span className="text-xs font-mono text-slate-400">{node.code}</span>}
        {!hasChildren && (
          <span className="ml-2 flex items-center gap-1 text-xs text-slate-500">
            {node.geometry_types.map((g) => {
              const Icon = GEOM_ICON[g];
              return <Icon key={g} className="h-3 w-3" />;
            })}
            {node.geometry_types.map((g) => GEOM_LABEL[g]).join(' / ')}
            {node.property_schema.length > 0 && ` · ${node.property_schema.length} Feld(er)`}
            {node.default_priority && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5">{node.default_priority}</span>
            )}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => onAddChild(node)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
            title="Unter-Kategorie hinzufügen"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onEdit(node)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
            title="Bearbeiten"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onToggle(node)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
            title={node.active ? 'Deaktivieren' : 'Aktivieren'}
          >
            {node.active ? (
              <Archive className="h-3.5 w-3.5 hover:text-red-600" />
            ) : (
              <ArchiveRestore className="h-3.5 w-3.5 hover:text-emerald-600" />
            )}
          </button>
        </div>
      </div>
      {hasChildren && (
        <ul>
          {node.children.map((c) => (
            <TreeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              onEdit={onEdit}
              onAddChild={onAddChild}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function PropertyFieldEditor({
  field,
  onChange,
  onRemove,
}: {
  field: PropertyFieldDef;
  onChange: (patch: Partial<PropertyFieldDef>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Anzeigename"
          className="flex-1 rounded border bg-white px-2 py-1 text-sm font-medium"
        />
        <button
          onClick={onRemove}
          className="ml-2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
          title="Feld entfernen"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input
          value={field.name}
          onChange={(e) => onChange({ name: e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() })}
          placeholder="technischer_name"
          className="rounded border px-2 py-1 font-mono text-xs"
          title="Technischer Name — wird im JSON gespeichert"
        />
        <select
          value={field.field_type}
          onChange={(e) => onChange({ field_type: e.target.value as FieldType })}
          className="rounded border px-2 py-1 text-xs"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === 'text' && 'Text'}
              {t === 'number' && 'Ganzzahl'}
              {t === 'decimal' && 'Dezimal'}
              {t === 'select' && 'Auswahl'}
              {t === 'boolean' && 'Ja/Nein'}
              {t === 'date' && 'Datum'}
            </option>
          ))}
        </select>
        {(field.field_type === 'number' || field.field_type === 'decimal') ? (
          <input
            value={field.unit ?? ''}
            onChange={(e) => onChange({ unit: e.target.value || undefined })}
            placeholder="Einheit (cm, m²…)"
            className="rounded border px-2 py-1 text-xs"
          />
        ) : (
          <div />
        )}
      </div>
      {field.field_type === 'select' && (
        <div className="mt-2">
          <input
            value={field.options?.join(', ') ?? ''}
            onChange={(e) =>
              onChange({
                options: e.target.value
                  .split(',')
                  .map((o) => o.trim())
                  .filter(Boolean),
              })
            }
            placeholder="Optionen, kommagetrennt (z.B. klein, mittel, groß)"
            className="w-full rounded border px-2 py-1 text-xs"
          />
        </div>
      )}
      <label className="mt-2 flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={!!field.required}
          onChange={(e) => onChange({ required: e.target.checked })}
          className="h-3.5 w-3.5"
        />
        Pflichtfeld
      </label>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function countNodes(nodes: CategoryNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}
