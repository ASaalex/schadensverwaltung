import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';
import { MapPin, ChevronRight, Box } from 'lucide-react';

interface MyDamage {
  id: string;
  code: string;
  status: string;
  priority: string;
  created_at: string;
  description: string | null;
  address_street: string | null;
  address_city: string | null;
}

export function ErfasserHomePage() {
  const { profile } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['erfasser', 'my-damages', profile?.id],
    queryFn: async () => {
      if (!profile) return [];
      const { data, error } = await supabase
        .from('damages')
        .select('id, code, status, priority, created_at, description, address_street, address_city')
        .eq('created_by', profile.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as MyDamage[];
    },
    enabled: !!profile,
  });

  return (
    <AppShell accent="blue" title="Schadensverwaltung" subtitle={`Hallo ${profile?.full_name ?? ''}`}>
      <div className="space-y-4 px-4 py-4">
        <Link
          to="/erfasser/new/location"
          className="flex w-full items-center gap-4 rounded-2xl bg-orange-500 px-4 py-5 text-white shadow-lg active:scale-[0.98] transition"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/20">
            <MapPin className="h-7 w-7" />
          </div>
          <div className="text-left">
            <div className="text-lg font-semibold">Neuer Schaden</div>
            <div className="text-sm text-orange-100">Position · Kategorie · Bemerkung · Fotos</div>
          </div>
        </Link>

        <Link
          to="/erfasser/objects/new"
          className="flex w-full items-center gap-4 rounded-2xl bg-blue-600 px-4 py-5 text-white shadow-lg active:scale-[0.98] transition"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/20">
            <Box className="h-7 w-7" />
          </div>
          <div className="text-left">
            <div className="text-lg font-semibold">Objekt erfassen</div>
            <div className="text-sm text-blue-100">Laterne · Leitplanke · Spielplatz …</div>
          </div>
        </Link>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-700">Meine letzten Erfassungen</h2>
            <Link to="/erfasser/list" className="text-xs text-blue-600">Alle ansehen</Link>
          </div>
          {isLoading && <div className="text-sm text-muted-foreground">Lade …</div>}
          {!isLoading && (data?.length ?? 0) === 0 && (
            <div className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">
              Noch keine Erfassungen. Tippe oben auf <em>Neuer Schaden</em>.
            </div>
          )}
          {data?.map((d) => (
            <div key={d.id} className="mb-2 flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">{d.code} · {new Date(d.created_at).toLocaleString('de-DE')}</div>
                <div className="truncate text-sm font-medium">{d.description || 'Ohne Bemerkung'}</div>
                <div className="truncate text-xs text-muted-foreground">{[d.address_street, d.address_city].filter(Boolean).join(', ') || '—'}</div>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400" />
            </div>
          ))}
        </div>
      </div>

    </AppShell>
  );
}
