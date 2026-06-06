import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { useNetworkObjects } from '@/hooks/useNetworkObjects';
import { useNetworkObjectTypes } from '@/hooks/useNetworkObjectTypes';
import { Box, Plus, MapPin, Minus, Hexagon, ChevronRight, Loader2 } from 'lucide-react';

const GEOM_ICON = { point: MapPin, line: Minus, polygon: Hexagon } as const;
const GEOM_LABEL: Record<string, string> = { point: 'Punkt', line: 'Linie', polygon: 'Fläche' };

export function ErfasserObjectListPage() {
  const nav = useNavigate();
  const { query } = useNetworkObjects();
  const { query: typesQ } = useNetworkObjectTypes();
  const objects = query.data ?? [];
  const types = typesQ.data ?? [];

  return (
    <AppShell accent="blue" title="Objekte" subtitle="Erfasste Netz-Objekte">
      <div className="space-y-4 px-4 py-4">
        {/* Neu-Button */}
        <Link
          to="/erfasser/objects/new"
          className="flex w-full items-center gap-4 rounded-2xl bg-blue-600 px-4 py-4 text-white shadow-lg active:scale-[0.98] transition"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
            <Plus className="h-6 w-6" />
          </div>
          <div className="text-left">
            <div className="text-base font-semibold">Neues Objekt erfassen</div>
            <div className="text-xs text-blue-100">Laterne · Leitplanke · Spielplatz …</div>
          </div>
        </Link>

        {/* Liste */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-700">
              Alle Objekte {objects.length > 0 && `(${objects.length})`}
            </h2>
          </div>

          {query.isLoading && (
            <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Lade Objekte …
            </div>
          )}

          {query.isError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Fehler beim Laden: {(query.error as Error).message}
            </div>
          )}

          {!query.isLoading && objects.length === 0 && (
            <div className="rounded-xl border bg-white p-6 text-center text-sm text-muted-foreground">
              <Box className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              Noch keine Objekte erfasst. Tippe oben auf <em>Neues Objekt erfassen</em>.
            </div>
          )}

          <div className="space-y-2">
            {objects.map((o) => {
              const type = types.find((t) => t.id === o.object_type_id);
              const gt = (o.type_geometry_type ?? type?.geometry_type ?? 'point') as keyof typeof GEOM_ICON;
              const Icon = GEOM_ICON[gt] ?? MapPin;
              return (
                <button
                  key={o.id}
                  onClick={() => nav(`/dispo/objects/${o.id}/history`)}
                  className="flex w-full items-center gap-3 rounded-xl bg-white p-3 shadow-sm text-left active:scale-[0.98] transition hover:bg-slate-50"
                >
                  <span
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `${o.type_color ?? type?.color ?? '#6366f1'}22` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: o.type_color ?? type?.color ?? '#6366f1' }} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {o.name ?? o.identifier ?? o.type_name ?? type?.name ?? 'Objekt'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {o.type_name ?? type?.name}
                      {o.identifier && o.name && ` · ${o.identifier}`}
                      {' · '}{GEOM_LABEL[gt]}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-300 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
