import { Plus, X } from 'lucide-react';
import type { PropertyFieldDef, FieldType } from '@/types/database';

const FIELD_TYPES: FieldType[] = ['text', 'number', 'decimal', 'select', 'boolean', 'date'];
const FIELD_LABEL: Record<FieldType, string> = {
  text: 'Text', number: 'Ganzzahl', decimal: 'Dezimal', select: 'Auswahl', boolean: 'Ja/Nein', date: 'Datum',
};

export function PropertySchemaEditor({
  schema, onChange,
}: {
  schema: PropertyFieldDef[];
  onChange: (next: PropertyFieldDef[]) => void;
}) {
  function add() {
    onChange([...schema, { name: `feld_${schema.length + 1}`, label: '', field_type: 'text' }]);
  }
  function update(i: number, patch: Partial<PropertyFieldDef>) {
    onChange(schema.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function remove(i: number) {
    onChange(schema.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wider text-slate-500">Merkmale</label>
        <button type="button" onClick={add} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
          <Plus className="h-3 w-3" /> Merkmal
        </button>
      </div>
      {schema.length === 0 && (
        <div className="rounded border border-dashed border-slate-200 p-3 text-center text-xs text-muted-foreground">
          Keine Merkmale. „+ Merkmal" hinzufügen.
        </div>
      )}
      <div className="space-y-2">
        {schema.map((field, i) => (
          <div key={i} className="rounded-lg border bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <input value={field.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Anzeigename"
                className="flex-1 rounded border bg-white px-2 py-1 text-sm font-medium" />
              <label className="flex items-center gap-1 text-[11px] text-slate-500">
                <input type="checkbox" checked={!!field.required}
                  onChange={(e) => update(i, { required: e.target.checked })} />
                Pflicht
              </label>
              <button onClick={() => remove(i)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input value={field.name}
                onChange={(e) => update(i, { name: e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() })}
                placeholder="technischer_name"
                className="rounded border px-2 py-1 font-mono text-xs" />
              <select value={field.field_type}
                onChange={(e) => update(i, { field_type: e.target.value as FieldType })}
                className="rounded border px-2 py-1 text-xs">
                {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_LABEL[t]}</option>)}
              </select>
              {(field.field_type === 'number' || field.field_type === 'decimal') ? (
                <input value={field.unit ?? ''}
                  onChange={(e) => update(i, { unit: e.target.value || undefined })}
                  placeholder="Einheit (cm, m²…)"
                  className="rounded border px-2 py-1 text-xs" />
              ) : field.field_type === 'select' ? (
                <input value={(field.options ?? []).join(', ')}
                  onChange={(e) => update(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  placeholder="Option A, Option B"
                  className="rounded border px-2 py-1 text-xs" />
              ) : <div />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
