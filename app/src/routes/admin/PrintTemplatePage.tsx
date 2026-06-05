import { useState, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ADMIN_SIDEBAR } from './sidebar';
import { usePrintConfig, useSavePrintConfig } from '@/hooks/usePrintConfig';
import { useCustomFieldsAdmin } from '@/hooks/useCustomFields';
import { mergePrintConfig, type PrintConfig } from '@/lib/printConfig';
import {
  Save, Plus, Pencil, Trash2, X, Eye, GripVertical,
  FileText, Building2, List,
} from 'lucide-react';

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text:    'Text',
  number:  'Zahl',
  date:    'Datum',
  select:  'Auswahl',
  boolean: 'Ja / Nein',
};
const ENTITY_LABELS: Record<string, string> = { order: 'Auftrag', damage: 'Schaden' };
const TABS = ['kopfzeile', 'schaden', 'auftrag', 'felder'] as const;
type Tab = typeof TABS[number];
const TAB_LABELS: Record<Tab, string> = {
  kopfzeile: 'Kopfzeile',
  schaden:   'Schaden-Druck',
  auftrag:   'Auftrags-Druck',
  felder:    'Zusatzfelder',
};

// ── Toggle-Row ────────────────────────────────────────────────────────────────

function Toggle({
  label, hint, checked, onChange,
}: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-lg border bg-white p-3 hover:bg-slate-50">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-200'}`}
        onClick={() => onChange(!checked)}
      >
        <div className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </div>
    </label>
  );
}

// ── Field-Modal ───────────────────────────────────────────────────────────────

interface FieldForm {
  id?: string;
  entity_type: 'order' | 'damage';
  field_name: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  field_options_raw: string; // kommagetrennt für select
  required: boolean;
  sort_order: number;
  active: boolean;
}

const EMPTY_FIELD: FieldForm = {
  entity_type: 'order', field_name: '', field_label: '',
  field_type: 'text', field_options_raw: '', required: false, sort_order: 0, active: true,
};

function FieldModal({
  initial, onSave, onClose, isPending, error,
}: {
  initial: FieldForm;
  onSave: (f: FieldForm) => void;
  onClose: () => void;
  isPending: boolean;
  error?: string | null;
}) {
  const [f, setF] = useState(initial);

  function handleLabelChange(label: string) {
    setF((s) => ({
      ...s,
      field_label: label,
      field_name: s.id ? s.field_name : slugify(label),
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="font-semibold">{f.id ? 'Feld bearbeiten' : 'Neues Zusatzfeld'}</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400 hover:text-slate-600" /></button>
        </div>
        <div className="space-y-3 px-5 py-4">
          {/* Typ (Auftrag/Schaden) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Gehört zu</label>
            <div className="flex gap-2">
              {(['order', 'damage'] as const).map((et) => (
                <button key={et}
                  onClick={() => setF((s) => ({ ...s, entity_type: et }))}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${f.entity_type === et ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-slate-50'}`}>
                  {ENTITY_LABELS[et]}
                </button>
              ))}
            </div>
          </div>
          {/* Label */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Bezeichnung *</label>
            <input value={f.field_label} onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="z. B. Vergabe-Nr."
              className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          {/* Feldname */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Feldname (intern, unveränderlich nach Anlage)
            </label>
            <input value={f.field_name}
              onChange={(e) => setF((s) => ({ ...s, field_name: slugify(e.target.value) }))}
              disabled={!!f.id}
              placeholder="z. B. vergabenummer"
              className="w-full rounded-lg border px-3 py-2 font-mono text-sm disabled:bg-slate-50 disabled:text-slate-400" />
          </div>
          {/* Feldtyp */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Feldtyp</label>
            <select value={f.field_type}
              onChange={(e) => setF((s) => ({ ...s, field_type: e.target.value as FieldForm['field_type'] }))}
              className="w-full rounded-lg border px-3 py-2 text-sm">
              {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          {/* Optionen für select */}
          {f.field_type === 'select' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Optionen (kommagetrennt)
              </label>
              <input value={f.field_options_raw}
                onChange={(e) => setF((s) => ({ ...s, field_options_raw: e.target.value }))}
                placeholder="Option 1, Option 2, Option 3"
                className="w-full rounded-lg border px-3 py-2 text-sm" />
            </div>
          )}
          {/* Pflichtfeld + Reihenfolge */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.required}
                onChange={(e) => setF((s) => ({ ...s, required: e.target.checked }))}
                className="h-4 w-4" />
              Pflichtfeld
            </label>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Reihenfolge</label>
              <input type="number" min="0" value={f.sort_order}
                onChange={(e) => setF((s) => ({ ...s, sort_order: parseInt(e.target.value) || 0 }))}
                className="w-16 rounded-lg border px-2 py-1 text-sm" />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t px-5 py-4">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">Abbrechen</button>
          <button
            onClick={() => onSave(f)}
            disabled={!f.field_label.trim() || !f.field_name.trim() || isPending}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            <Save className="h-4 w-4" />
            {isPending ? 'Speichern …' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hauptseite ────────────────────────────────────────────────────────────────

export function AdminPrintTemplatePage() {
  const [activeTab, setActiveTab] = useState<Tab>('kopfzeile');
  const { data: savedConfig, isLoading } = usePrintConfig();
  const saveMut = useSavePrintConfig();
  const { query: cfQuery, saveMut: cfSave, deleteMut: cfDelete } = useCustomFieldsAdmin();

  const [cfg, setCfg] = useState<PrintConfig>(mergePrintConfig(null));
  const [fieldModal, setFieldModal] = useState<FieldForm | null>(null);
  const [deleteFieldId, setDeleteFieldId] = useState<string | null>(null);

  useEffect(() => {
    if (savedConfig) setCfg(savedConfig);
  }, [savedConfig]);

  function setHeader<K extends keyof PrintConfig['header']>(k: K, v: PrintConfig['header'][K]) {
    setCfg((c) => ({ ...c, header: { ...c.header, [k]: v } }));
  }
  function setDamage<K extends keyof PrintConfig['damage']>(k: K, v: boolean) {
    setCfg((c) => ({ ...c, damage: { ...c.damage, [k]: v } }));
  }
  function setOrder<K extends keyof PrintConfig['order']>(k: K, v: boolean) {
    setCfg((c) => ({ ...c, order: { ...c.order, [k]: v } }));
  }

  function handleSaveField(f: FieldForm) {
    cfSave.mutate({
      id:            f.id,
      entity_type:   f.entity_type,
      field_name:    f.field_name,
      field_label:   f.field_label,
      field_type:    f.field_type,
      field_options: f.field_type === 'select'
        ? f.field_options_raw.split(',').map((s) => s.trim()).filter(Boolean)
        : null,
      required:      f.required,
      sort_order:    f.sort_order,
      active:        f.active,
    }, { onSuccess: () => setFieldModal(null) });
  }

  const fields = cfQuery.data ?? [];

  if (isLoading) {
    return (
      <AppShell title="Administration" subtitle="Druckvorlagen" sidebar={ADMIN_SIDEBAR}>
        <div className="py-12 text-center text-sm text-muted-foreground">Lade Konfiguration …</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Administration" subtitle="Druckvorlagen" sidebar={ADMIN_SIDEBAR}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Druckvorlagen</h2>
          <p className="text-sm text-muted-foreground">
            Kopfzeile, Abschnitte und Zusatzfelder für Druck- und PDF-Ausgaben
          </p>
        </div>
        <a
          href="/dispo/damages"
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
          target="_blank"
        >
          <Eye className="h-4 w-4" /> Vorschau (Schaden öffnen → Drucken)
        </a>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl border bg-white p-1">
        {TABS.map((t) => {
          const icons: Record<Tab, React.ReactNode> = {
            kopfzeile: <Building2 className="h-3.5 w-3.5" />,
            schaden:   <FileText className="h-3.5 w-3.5" />,
            auftrag:   <FileText className="h-3.5 w-3.5" />,
            felder:    <List className="h-3.5 w-3.5" />,
          };
          return (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm transition ${activeTab === t ? 'bg-blue-600 font-medium text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {icons[t]} {TAB_LABELS[t]}
            </button>
          );
        })}
      </div>

      {/* ── Tab: Kopfzeile ── */}
      {activeTab === 'kopfzeile' && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-5">
            <h3 className="mb-4 font-semibold text-slate-700">Firmeninformationen</h3>
            <div className="grid grid-cols-2 gap-4">
              {([
                ['company_name',     'Firmenname',        'z. B. Bauhof Erfurt'],
                ['company_subtitle', 'Untertitel',        'z. B. Stadt Erfurt · Tiefbauamt'],
                ['company_address',  'Adresse',           'z. B. Fischmarkt 1, 99084 Erfurt'],
                ['company_phone',    'Telefon (optional)','z. B. 0361 655-0'],
              ] as const).map(([k, label, ph]) => (
                <div key={k}>
                  <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
                  <input value={cfg.header[k]}
                    onChange={(e) => setHeader(k, e.target.value)}
                    placeholder={ph}
                    className="w-full rounded-lg border px-3 py-2 text-sm" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5">
            <h3 className="mb-4 font-semibold text-slate-700">Dokumenten-Titel</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Titel Schadensdruck</label>
                <input value={cfg.header.damage_title}
                  onChange={(e) => setHeader('damage_title', e.target.value)}
                  placeholder="Schadensmeldung"
                  className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Titel Auftragsdruck</label>
                <input value={cfg.header.order_title}
                  onChange={(e) => setHeader('order_title', e.target.value)}
                  placeholder="Arbeitsauftrag"
                  className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5">
            <h3 className="mb-4 font-semibold text-slate-700">Fußzeile</h3>
            <input value={cfg.footer_text}
              onChange={(e) => setCfg((c) => ({ ...c, footer_text: e.target.value }))}
              placeholder="Schadensverwaltung · vertraulich"
              className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>

          <SaveButton onSave={() => saveMut.mutate(cfg)} isPending={saveMut.isPending} />
        </div>
      )}

      {/* ── Tab: Schaden-Druck ── */}
      {activeTab === 'schaden' && (
        <div className="space-y-3">
          <div className="rounded-xl border bg-white p-5">
            <h3 className="mb-3 font-semibold text-slate-700">Abschnitte im Schadensausdruck</h3>
            <div className="space-y-2">
              <Toggle label="Karte" hint="Miniaturkarte mit Schadensposition"
                checked={cfg.damage.show_map} onChange={(v) => setDamage('show_map', v)} />
              <Toggle label="Fotos" hint="Vor-/Nach-/Detailfotos"
                checked={cfg.damage.show_photos} onChange={(v) => setDamage('show_photos', v)} />
              <Toggle label="Netzreferenz (ASB)" hint="Von/Nach Netzknoten, Station, Lotabstand"
                checked={cfg.damage.show_network_ref} onChange={(v) => setDamage('show_network_ref', v)} />
              <Toggle label="Eigenschaften" hint="Schadenskatalog-Felder (Tiefe, Material …)"
                checked={cfg.damage.show_properties} onChange={(v) => setDamage('show_properties', v)} />
              <Toggle label="Bemerkung"
                checked={cfg.damage.show_description} onChange={(v) => setDamage('show_description', v)} />
              <Toggle label="Historie" hint="Statusverlauf des Schadens"
                checked={cfg.damage.show_history} onChange={(v) => setDamage('show_history', v)} />
            </div>
          </div>
          <SaveButton onSave={() => saveMut.mutate(cfg)} isPending={saveMut.isPending} />
        </div>
      )}

      {/* ── Tab: Auftrags-Druck ── */}
      {activeTab === 'auftrag' && (
        <div className="space-y-3">
          <div className="rounded-xl border bg-white p-5">
            <h3 className="mb-3 font-semibold text-slate-700">Abschnitte im Auftragsausdruck</h3>
            <div className="space-y-2">
              <Toggle label="Positionstabelle" hint="Liste aller Schadensposition"
                checked={cfg.order.show_positions} onChange={(v) => setOrder('show_positions', v)} />
              <Toggle label="Beschreibung / Bemerkung"
                checked={cfg.order.show_description} onChange={(v) => setOrder('show_description', v)} />
              <Toggle label="Abnahme-/Rückmeldungsbereich"
                checked={cfg.order.show_remarks} onChange={(v) => setOrder('show_remarks', v)} />
            </div>
          </div>
          <SaveButton onSave={() => saveMut.mutate(cfg)} isPending={saveMut.isPending} />
        </div>
      )}

      {/* ── Tab: Zusatzfelder ── */}
      {activeTab === 'felder' && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="font-semibold">Kundeneigene Felder ({fields.length})</h3>
                <p className="text-xs text-muted-foreground">
                  Auftrag-Felder erscheinen beim Anlegen/Bearbeiten von Aufträgen und im Ausdruck.
                </p>
              </div>
              <button onClick={() => setFieldModal({ ...EMPTY_FIELD, sort_order: fields.length })}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                <Plus className="h-4 w-4" /> Feld anlegen
              </button>
            </div>

            {cfQuery.isLoading && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">Lade …</div>
            )}
            {!cfQuery.isLoading && fields.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Noch keine Zusatzfelder angelegt.
              </div>
            )}

            {fields.length > 0 && (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left w-6"></th>
                    <th className="px-4 py-2 text-left">Bezeichnung</th>
                    <th className="px-4 py-2 text-left">Feldname</th>
                    <th className="px-4 py-2 text-left">Gehört zu</th>
                    <th className="px-4 py-2 text-left">Typ</th>
                    <th className="px-4 py-2 text-center">Pflicht</th>
                    <th className="px-4 py-2 text-center">Aktiv</th>
                    <th className="px-4 py-2 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {fields.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-300"><GripVertical className="h-4 w-4" /></td>
                      <td className="px-4 py-2 font-medium">{f.field_label}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">{f.field_name}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${f.entity_type === 'order' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}`}>
                          {ENTITY_LABELS[f.entity_type]}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{FIELD_TYPE_LABELS[f.field_type]}</td>
                      <td className="px-4 py-2 text-center">{f.required ? '✓' : '—'}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${f.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {f.active ? 'Aktiv' : 'Inaktiv'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setFieldModal({
                              id: f.id, entity_type: f.entity_type,
                              field_name: f.field_name, field_label: f.field_label,
                              field_type: f.field_type,
                              field_options_raw: (f.field_options ?? []).join(', '),
                              required: f.required, sort_order: f.sort_order, active: f.active,
                            })}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setDeleteFieldId(f.id)}
                            className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Feld-Modal */}
      {fieldModal && (
        <FieldModal
          initial={fieldModal}
          onSave={handleSaveField}
          onClose={() => setFieldModal(null)}
          isPending={cfSave.isPending}
          error={cfSave.isError ? (cfSave.error as Error).message : null}
        />
      )}

      {/* Löschen-Bestätigung */}
      {deleteFieldId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 font-semibold">Feld löschen?</h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Gespeicherte Werte in bestehenden Aufträgen/Schäden bleiben erhalten, werden aber nicht mehr angezeigt.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteFieldId(null)} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">Abbrechen</button>
              <button
                onClick={() => cfDelete.mutate(deleteFieldId, { onSuccess: () => setDeleteFieldId(null) })}
                disabled={cfDelete.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {cfDelete.isPending ? 'Lösche …' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function SaveButton({ onSave, isPending }: { onSave: () => void; isPending: boolean }) {
  return (
    <div className="flex justify-end">
      <button onClick={onSave} disabled={isPending}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        <Save className="h-4 w-4" />
        {isPending ? 'Speichern …' : 'Konfiguration speichern'}
      </button>
    </div>
  );
}
