import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { WizardHeader } from './WizardHeader';
import { useWizardStore } from '../wizardStore';
import { useNetworkObjects, findNearbyObjects } from '@/hooks/useNetworkObjects';
import { MapPin, ChevronRight, SkipForward, Box } from 'lucide-react';

const GEOM_LABEL: Record<string, string> = { point: 'Punkt', line: 'Linie', polygon: 'Fläche' };

export function NewObjectPage() {
  const nav = useNavigate();
  const position        = useWizardStore((s) => s.position);
  const category        = useWizardStore((s) => s.category);
  const networkObjectId = useWizardStore((s) => s.networkObjectId);
  const setObjectId     = useWizardStore((s) => s.setNetworkObjectId);
  const { query } = useNetworkObjects();
  const allObjects = query.data ?? [];

  // Objekttypen aus der Kategorie lesen (gespeichert als string[] von UUIDs)
  const typeIds: string[] = useMemo(() => category?.object_type_ids ?? [], [category]);

  // Nahe Objekte suchen (50 m, passender Typ)
  const nearby = useMemo(() => {
    if (!position) return [];
    return findNearbyObjects(position.lat, position.lng, allObjects, typeIds, 50);
  }, [position, allObjects, typeIds]);

  function pick(id: string | null) {
    setObjectId(id);
    nav('/erfasser/new/details');
  }

  if (!position || !category) {
    nav('/erfasser/new/location', { replace: true });
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-24">
      <WizardHeader step={3} title="Objekt zuordnen" back="/erfasser/new/category" />

      <div className="mx-auto w-full max-w-lg px-4 py-4 space-y-4">

        {/* Info */}
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-start gap-3">
            <Box className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
            <div>
              <div className="font-medium text-sm">Objekt im Umkreis von 50 m</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {typeIds.length > 0
                  ? `Passende Objekttypen für „${category.name}" werden angezeigt.`
                  : 'Für diese Kategorie sind keine Objekttypen definiert.'}
              </div>
            </div>
          </div>
        </div>

        {/* Treffer */}
        {nearby.length > 0 ? (
          <div className="space-y-2">
            {nearby.map(({ object: o, distanceM }) => {
              const selected = o.id === networkObjectId;
              return (
                <button key={o.id}
                  onClick={() => pick(o.id)}
                  className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition ${selected ? 'border-blue-500 bg-blue-50' : 'bg-white hover:bg-slate-50'}`}>
                  <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: o.type_color ?? '#6366f1' }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {o.name ?? o.identifier ?? o.type_name ?? 'Objekt'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {o.type_name}{o.identifier && ` · ${o.identifier}`}
                      {' · '}{GEOM_LABEL[o.type_geometry_type ?? 'point']}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs font-medium text-blue-600">
                      {distanceM < 1 ? '<1 m' : `${Math.round(distanceM)} m`}
                    </span>
                    {selected && (
                      <span className="text-[10px] text-blue-600 font-medium">Gewählt</span>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border bg-white p-6 text-center text-sm text-muted-foreground">
            <MapPin className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            {typeIds.length > 0
              ? 'Keine passenden Objekte im Umkreis von 50 m gefunden.'
              : 'Keine Objekttypen für diese Kategorie definiert.'}
          </div>
        )}

        {/* Ohne Objekt weiter */}
        <button
          onClick={() => pick(null)}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed bg-white p-3 text-sm text-slate-500 hover:bg-slate-50">
          <SkipForward className="h-4 w-4" />
          Ohne Objektbezug erfassen
        </button>

        {/* Ausgewähltes Objekt anzeigen */}
        {networkObjectId && networkObjectId !== null && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
            Objekt ausgewählt. Weiter mit → Schritt 4 Details.
          </div>
        )}
      </div>

      {/* Weiter-Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-3">
        <button
          onClick={() => nav('/erfasser/new/details')}
          className="w-full max-w-lg mx-auto flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700">
          Weiter <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
