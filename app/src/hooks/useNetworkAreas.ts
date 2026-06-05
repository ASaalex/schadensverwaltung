import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';

export const AREA_TYPE_LABELS: Record<string, string> = {
  park:            'Park',
  spielplatz:      'Spielplatz',
  parkplatz:       'Parkplatz',
  verkehrsflaeche: 'Verkehrsfläche',
  gruenflaeche:    'Grünfläche',
  platz:           'Platz / Marktplatz',
  sonstige:        'Sonstige',
};

export const AREA_TYPE_COLORS: Record<string, { fill: string; border: string }> = {
  park:            { fill: '#16a34a', border: '#15803d' },
  spielplatz:      { fill: '#84cc16', border: '#65a30d' },
  parkplatz:       { fill: '#94a3b8', border: '#64748b' },
  verkehrsflaeche: { fill: '#f59e0b', border: '#d97706' },
  gruenflaeche:    { fill: '#10b981', border: '#059669' },
  platz:           { fill: '#6366f1', border: '#4f46e5' },
  sonstige:        { fill: '#64748b', border: '#475569' },
};

export interface NetworkArea {
  id: string;
  name: string;
  area_type: string;
  geometry: { type: 'Polygon'; coordinates: number[][][] };
  gueltig_von: string | null;
  gueltig_bis: string | null;
  created_at: string;
  updated_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = () => (supabase as any).from('network_areas');

export function useNetworkAreas() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['network-areas', profile?.company_id],
    queryFn: async (): Promise<NetworkArea[]> => {
      const { data, error } = await tbl()
        .select('id, name, area_type, geometry, gueltig_von, gueltig_bis, created_at, updated_at')
        .eq('company_id', profile!.company_id)
        .order('name');
      if (error) throw error;
      return (data ?? []) as NetworkArea[];
    },
    enabled: !!profile?.company_id,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['network-areas', profile?.company_id] });

  const saveMut = useMutation({
    mutationFn: async (a: Partial<NetworkArea> & { name: string; area_type: string; geometry: NetworkArea['geometry'] }) => {
      const payload = { ...a, company_id: profile!.company_id };
      const { error } = a.id
        ? await tbl().update(payload).eq('id', a.id)
        : await tbl().insert(payload);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await tbl().delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { query, saveMut, deleteMut };
}
