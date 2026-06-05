import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';

export interface NetworkNode {
  id: string;
  name: string;
  lng: number;
  lat: number;
  created_at: string;
  updated_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = () => (supabase as any).from('network_nodes');

export function useNetworkNodes() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['network-nodes', profile?.company_id],
    queryFn: async (): Promise<NetworkNode[]> => {
      const { data, error } = await tbl()
        .select('id, name, lng, lat, created_at, updated_at')
        .eq('company_id', profile!.company_id)
        .order('name');
      if (error) throw error;
      return (data ?? []) as NetworkNode[];
    },
    enabled: !!profile?.company_id,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['network-nodes', profile?.company_id] });

  const saveMut = useMutation({
    mutationFn: async (n: Partial<NetworkNode> & { name: string; lng: number; lat: number }) => {
      const payload = { ...n, company_id: profile!.company_id };
      const { error } = n.id
        ? await tbl().update(payload).eq('id', n.id)
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
