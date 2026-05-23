import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WizardHeader } from './WizardHeader';
import { useCategoryTree } from '@/hooks/useCategoryTree';
import { useWizardStore } from '../wizardStore';
import { ChevronRight, Check, MapPin, Minus, Hexagon, ArrowLeft } from 'lucide-react';
import type { CategoryNode } from '@/lib/categories';
import type { GeometryType } from '@/types/database';

const GEOM_ICON = { point: MapPin, line: Minus, polygon: Hexagon } as const;
const GEOM_LABEL: Record<GeometryType, string> = {
  point: 'Punkt',
  line: 'Linie',
  polygon: 'Fläche',
};
const GEOM_DESC: Record<GeometryType, string> = {
  point: 'Eine einzelne Stelle — die Position aus Schritt 1',
  line: 'Eine Strecke — Linie auf der Karte zeichnen',
  polygon: 'Ein Bereich — Fläche auf der Karte zeichnen',
};

export function NewCategoryPage() {
  const nav = useNavigate();
  const { data: tree, isLoading, error } = useCategoryTree();
  const setCategory = useWizardStore((s) => s.setCategory);
  const selectedId = useWizardStore((s) => s.category?.id ?? null);
  const [path, setPath] = useState<CategoryNode[]>([]);

  // Geometrie-Choice-Modus, wenn das gewählte Blatt mehrere Typen erlaubt
  const [pendingChoice, setPendingChoice] = useState<CategoryNode | null>(null);

  const currentList: CategoryNode[] = path.length === 0 ? tree ?? [] : path[path.length - 1].children;

  function handlePick(node: CategoryNode) {
    if (node.children.length > 0) {
      setPath([...path, node]);
      return;
    }
    // Blatt-Kategorie
    const types = node.geometry_types;
    if (types.length === 1) {
      // Direkt weiter, keine Wahl nötig
      finalize(node, types[0]);
    } else {
      setPendingChoice(node);
    }
  }

  function finalize(node: CategoryNode, geometryType: GeometryType) {
    setCategory({
      id: node.id,
      name: node.name,
      path: [...path.map((p) => p.name), node.name],
      geometry_types: node.geometry_types,
      geometry_type: geometryType,
      property_schema: node.property_schema,
      default_priority: node.default_priority,
    });
    nav('/erfasser/new/details');
  }

  function goBackInTree() {
    setPath(path.slice(0, -1));
  }

  // ============== Choice-Screen für Mehrfach-Geometrien ==============
  if (pendingChoice) {
    return (
      <div className="flex h-screen flex-col bg-white">
        <WizardHeader step={2} title="Geometrie wählen" back="/erfasser/new/category" />
        <div className="border-b bg-slate-50 px-4 py-2 text-xs text-slate-600">
          <button onClick={() => setPendingChoice(null)} className="flex items-center gap-1 text-blue-600">
            <ArrowLeft className="h-3 w-3" /> Kategorie ändern
          </button>
          <div className="mt-1 text-slate-500">
            Kategorie: <span className="font-medium text-slate-700">
              {[...path.map((p) => p.name), pendingChoice.name].join(' › ')}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="mb-3 text-sm font-medium text-slate-700">
            Wie möchtest du den Schaden erfassen?
          </div>
          <div className="space-y-2">
            {pendingChoice.geometry_types.map((g) => {
              const Icon = GEOM_ICON[g];
              return (
                <button
                  key={g}
                  onClick={() => finalize(pendingChoice, g)}
                  className="flex w-full items-start gap-3 rounded-lg border border-slate-200 p-3 text-left hover:bg-blue-50 hover:border-blue-400"
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">Als {GEOM_LABEL[g]}</div>
                    <div className="text-xs text-slate-500">{GEOM_DESC[g]}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ============== Normale Kategorie-Auswahl ==============
  return (
    <div className="flex h-screen flex-col bg-white">
      <WizardHeader step={2} title="Kategorie wählen" back="/erfasser/new/location" />

      <div className="border-b bg-slate-50 px-4 py-2 text-xs text-slate-600">
        {path.length === 0 ? (
          <span>Bitte wähle eine Hauptkategorie</span>
        ) : (
          <button onClick={goBackInTree} className="text-blue-600">
            ← {path.map((p) => p.name).join(' › ')}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading && <div className="text-sm text-muted-foreground">Lade Katalog …</div>}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Fehler beim Laden: {(error as Error).message}
          </div>
        )}
        {!isLoading && currentList.length === 0 && (
          <div className="text-sm text-muted-foreground">Keine Einträge.</div>
        )}
        <ul className="space-y-1">
          {currentList.map((node) => {
            const isLeaf = node.children.length === 0;
            return (
              <li key={node.id}>
                <button
                  onClick={() => handlePick(node)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-3 text-left text-sm hover:bg-slate-50 ${
                    selectedId === node.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
                  }`}
                >
                  <span className="flex flex-col">
                    <span className="font-medium text-slate-900">{node.name}</span>
                    {isLeaf && (
                      <span className="text-xs text-slate-500">
                        {node.geometry_types.length === 1
                          ? GEOM_LABEL[node.geometry_types[0]]
                          : node.geometry_types.map((g) => GEOM_LABEL[g]).join(' / ')}
                        {node.geometry_types.length > 1 && ' · wählbar'}
                        {node.property_schema.length > 0 && ` · ${node.property_schema.length} Eigenschaft(en)`}
                      </span>
                    )}
                  </span>
                  {isLeaf ? (
                    selectedId === node.id ? (
                      <Check className="h-4 w-4 text-blue-600" />
                    ) : null
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
