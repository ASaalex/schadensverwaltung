import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';
import { ArrowLeft } from 'lucide-react';

interface Row {
  id: string;
  code: string;
  status: string;
  priority: string;
  created_at: string;
  description: string | null;
  address_street: string | null;
  address_city: string | null;
}

export function ErfasserListPage() {
  const { profile } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['erfasser', 'list', profile?.id],
    queryFn: async () => {
      if (!profile) return [];
      const { data, error } = await supabase
        .from('damages')
        .select('id, code, status, priority, created_at, description, address_street, address_city')
        .eq('created_by', profile.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
    enabled: !!profile,
  });

  return (
    <AppShell accent="blue" title="Meine Erfassungen">
      <div className="px-4 py-4">
        <Link to="/erfasser" className="mb-3 flex items-center gap-1 text-sm text-slate-600">
          <ArrowLeft className="h-4 w-4" /> Zurück
        </Link>
        {isLoading && <div className="text-sm text-muted-foreground">Lade …</div>}
        {data?.length === 0 && (
          <div className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Noch keine Erfassungen.</div>
        )}
        {data?.map((d) => (
          <div key={d.id} className="mb-2 rounded-xl bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{d.code}</span>
              <span>{new Date(d.created_at).toLocaleString('de-DE')}</span>
            </div>
            <div className="text-sm font-medium">{d.description || 'Ohne Bemerkung'}</div>
            <div className="text-xs text-muted-foreground">
              {[d.address_street, d.address_city].filter(Boolean).join(', ') || '—'}
            </div>
            <div className="mt-1 flex gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2 py-0.5">{d.status}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5">{d.priority}</span>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
