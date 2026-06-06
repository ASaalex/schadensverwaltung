import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { DISPO_SIDEBAR } from './sidebar';
import { useNetworkObject } from '@/hooks/useNetworkObjects';
import { useNetworkObjectTypes } from '@/hooks/useNetworkObjectTypes';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Box, AlertTriangle } from 'lucide-react';

const STATUS_BADGE: Record<string, string> = {
  neu: 'bg-blue-100 text-blue-800', geprueft: 'bg-indigo-100 text-indigo-800',
  zugewiesen: 'bg-violet-100 text-violet-800', bearbeitung: 'bg-amber-100 text-amber-800',
  erledigt: 'bg-emerald-100 text-emerald-800', abgelehnt: 'bg-slate-100 text-slate-600',
};

interface HistoryDamage {
  id: string; code: string; status: string; priority: string;
  created_at: string;
  address_street: string | null;
  category_name: string | null;
}

export function ObjectHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const objQ  = useNetworkObject(id);
  const { query: typeQ } = useNetworkObjectTypes();

  const obj  = objQ.data ?? undefined;
  const type = typeQ.data?.find((t) => t.id === obj?.object_type_id);

  const { data: damages = [], isLoading } = useQuery({
    queryKey: ['object-history', id],
    queryFn: async (): Promise<HistoryDamage[]> => {
      const { data, error } = await supabase
        .from('damages')
        .select(`
          id, code, status, priority, created_at,
          address_street,
          category:damage_categories!category_id ( name )
        `)
        .eq('network_object_id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as Array<HistoryDamage & { category: { name: string } | null }>)
        .map((r) => ({ ...r, category_name: r.category?.name ?? null }));
    },
    enabled: !!id,
  });

  return (
    <AppShell title="Disposition" subtitle="Objekt-Historie" sidebar={DISPO_SIDEBAR}>
      <Link to="/dispo/damages" className="mb-4 flex items-center gap-1 text-sm text-slate-500">
        <ArrowLeft className="h-4 w-4" /> Zurück
      </Link>

      {/* Objekt-Info */}
      {obj && (
        <div className="mb-6 flex items-start gap-4 rounded-xl border bg-white p-5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: type?.color ? `${type.color}20` : '#f1f5f9' }}>
            <Box className="h-6 w-6" style={{ color: type?.color ?? '#6366f1' }} />
          </div>
          <div>
            <div className="text-lg font-semibold">
              {obj.name ?? obj.identifier ?? type?.name ?? 'Objekt'}
            </div>
            <div className="flex flex-wrap gap-2 mt-1 text-sm text-muted-foreground">
              {type && <span>{type.name}</span>}
              {obj.identifier && <span>· Kennung: {obj.identifier}</span>}
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-2xl font-bold text-slate-700">{damages.length}</div>
            <div className="text-xs text-muted-foreground">Schäden gesamt</div>
          </div>
        </div>
      )}

      {/* Schäden-Liste */}
      <div className="rounded-xl border bg-white">
        <div className="border-b px-4 py-3 font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          Schadens-Historie ({damages.length})
        </div>
        {isLoading && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Lade …</div>}
        {!isLoading && damages.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Noch keine Schäden an diesem Objekt.
          </div>
        )}
        <div className="divide-y">
          {damages.map((d) => (
            <button key={d.id}
              onClick={() => nav(`/dispo/damages/${d.id}`)}
              className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-slate-50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{d.code}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[d.status] ?? 'bg-slate-100'}`}>
                    {d.status}
                  </span>
                </div>
                <div className="mt-0.5 text-sm font-medium truncate">{d.category_name ?? '—'}</div>
                {d.address_street && (
                  <div className="text-xs text-muted-foreground">{d.address_street}</div>
                )}
              </div>
              <div className="text-xs text-muted-foreground flex-shrink-0">
                {new Date(d.created_at).toLocaleDateString('de-DE')}
              </div>
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
