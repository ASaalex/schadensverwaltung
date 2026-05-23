import { useNavigate, Navigate } from 'react-router-dom';
import { WizardHeader } from './WizardHeader';
import { GeometryDrawer } from '@/components/map/GeometryDrawer';
import { NumberInput } from '@/components/forms/NumberInput';
import { useWizardStore } from '../wizardStore';
import { ArrowRight, Sliders, Shapes } from 'lucide-react';
import type { Priority, PropertyFieldDef } from '@/types/database';

const PRIO_LABELS: Record<Priority, string> = {
  niedrig: 'Niedrig',
  normal: 'Normal',
  hoch: 'Hoch',
  dringend: 'Dringend',
};

const PRIO_COLORS: Record<Priority, string> = {
  niedrig: 'bg-slate-600',
  normal: 'bg-blue-600',
  hoch: 'bg-orange-500',
  dringend: 'bg-red-600',
};

export function NewDetailsPage() {
  const nav = useNavigate();
  const category = useWizardStore((s) => s.category);
  const position = useWizardStore((s) => s.position);
  const geometry = useWizardStore((s) => s.geometry);
  const propertyValues = useWizardStore((s) => s.propertyValues);
  const priority = useWizardStore((s) => s.priority);
  const description = useWizardStore((s) => s.description);
  const setGeometry = useWizardStore((s) => s.setGeometry);
  const setPropertyValue = useWizardStore((s) => s.setPropertyValue);
  const setPriority = useWizardStore((s) => s.setPriority);
  const setDescription = useWizardStore((s) => s.setDescription);

  // Wenn Vorgänger-Schritte fehlen → zurückleiten
  if (!position) return <Navigate to="/erfasser/new/location" replace />;
  if (!category) return <Navigate to="/erfasser/new/category" replace />;

  // Lokale Konstanten ohne Null, damit TS-Narrowing in Closures erhalten bleibt
  const cat = category;
  const pos = position;
  const needsGeometry = cat.geometry_type === 'line' || cat.geometry_type === 'polygon';

  // Aktuelle Punktliste (für LineString und Polygon einheitlich)
  let currentPoints: number[][] = [];
  if (geometry?.type === 'LineString') currentPoints = geometry.coordinates as number[][];
  if (geometry?.type === 'Polygon') currentPoints = (geometry.coordinates as number[][][])[0] ?? [];

  function setPoints(points: number[][]) {
    if (points.length === 0) {
      setGeometry(null);
      return;
    }
    if (cat.geometry_type === 'line') {
      setGeometry({ type: 'LineString', coordinates: points });
    } else {
      setGeometry({ type: 'Polygon', coordinates: [points] });
    }
  }

  function canProceed(): boolean {
    if (needsGeometry) {
      if (cat.geometry_type === 'line' && currentPoints.length < 2) return false;
      if (cat.geometry_type === 'polygon' && currentPoints.length < 3) return false;
    }
    // Pflicht-Custom-Fields prüfen
    for (const field of cat.property_schema) {
      if (field.required) {
        const val = propertyValues[field.name];
        if (val === undefined || val === null || val === '') return false;
      }
    }
    return true;
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      <WizardHeader step={3} title="Bemerkung & Eigenschaften" back="/erfasser/new/category" />

      <div className="flex-1 overflow-y-auto">
        {/* Kontext-Box */}
        <div className="border-b bg-slate-50 px-4 py-2 text-xs">
          <div className="flex justify-between"><span className="text-slate-500">Kategorie</span><span className="font-medium">{category.path.join(' › ')}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Geometrie</span>
            <span className={`font-medium ${needsGeometry ? 'text-orange-600' : ''}`}>
              {cat.geometry_type === 'point' && 'Punkt (aus Schritt 1)'}
              {cat.geometry_type === 'line' && `Linie · ${currentPoints.length} Punkt(e)`}
              {cat.geometry_type === 'polygon' && `Fläche · ${currentPoints.length} Punkt(e)`}
            </span>
          </div>
        </div>

        {/* Geometrie zeichnen */}
        {needsGeometry && (
          <div className="px-4 pt-4">
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
              <Shapes className="h-4 w-4 text-orange-600" />
              {cat.geometry_type === 'polygon' ? 'Fläche zeichnen' : 'Linie zeichnen'}
              <span className="ml-auto text-xs font-normal text-slate-500">
                {currentPoints.length} Punkt(e)
                {cat.geometry_type === 'polygon' && currentPoints.length < 3 && ` · noch ${3 - currentPoints.length} nötig`}
                {cat.geometry_type === 'line' && currentPoints.length < 2 && ` · noch ${2 - currentPoints.length} nötig`}
              </span>
            </label>
            <div className="h-64 overflow-hidden rounded-lg border border-slate-200">
              <GeometryDrawer
                center={[pos.lat, pos.lng]}
                zoom={18}
                type={cat.geometry_type === 'polygon' ? 'polygon' : 'line'}
                points={currentPoints}
                onChange={setPoints}
              />
            </div>
          </div>
        )}

        {/* Custom Fields */}
        {category.property_schema.length > 0 && (
          <div className="px-4 pt-4">
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
              <Sliders className="h-4 w-4 text-blue-600" />
              Eigenschaften
              <span className="text-xs font-normal text-slate-400">(aus Kategorie)</span>
            </label>
            <div className="space-y-3">
              {category.property_schema.map((field) => (
                <PropertyInput
                  key={field.name}
                  field={field}
                  value={propertyValues[field.name]}
                  onChange={(v) => setPropertyValue(field.name, v)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Priorität */}
        <div className="px-4 pt-4">
          <label className="mb-2 block text-sm font-medium text-slate-700">Priorität</label>
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.keys(PRIO_LABELS) as Priority[]).map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={`rounded-md py-2 text-xs font-medium ${
                  priority === p ? `${PRIO_COLORS[p]} text-white` : 'bg-slate-100 text-slate-600'
                }`}
              >
                {PRIO_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Bemerkung */}
        <div className="px-4 py-4">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Bemerkung <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="Was ist passiert / aufgefallen?"
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-t bg-white px-4 py-3">
        <span className="text-xs text-slate-500">Nächster Schritt: Fotos (optional)</span>
        <button
          onClick={() => nav('/erfasser/new/photos')}
          disabled={!canProceed()}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Weiter <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function PropertyInput({
  field,
  value,
  onChange,
}: {
  field: PropertyFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = (
    <label className="mb-1 block text-xs text-slate-500">
      {field.label}
      {field.required && <span className="text-red-500"> *</span>}
    </label>
  );

  if (field.field_type === 'boolean') {
    return (
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4"
          id={`field-${field.name}`}
        />
        <label htmlFor={`field-${field.name}`} className="text-sm">
          {field.label}
          {field.required && <span className="text-red-500"> *</span>}
        </label>
      </div>
    );
  }

  if (field.field_type === 'select') {
    return (
      <div>
        {label}
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">— bitte wählen —</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>
    );
  }

  if (field.field_type === 'number' || field.field_type === 'decimal') {
    return (
      <div>
        {label}
        <NumberInput
          value={value as number | null}
          onChange={onChange}
          decimal={field.field_type === 'decimal'}
          unit={field.unit}
        />
      </div>
    );
  }

  if (field.field_type === 'date') {
    return (
      <div>
        {label}
        <input
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </div>
    );
  }

  // text
  return (
    <div>
      {label}
      <input
        type="text"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
    </div>
  );
}
