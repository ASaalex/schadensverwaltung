import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';

export interface NetworkObjectType {
  id: string;
  name: string;
  geometry_type: 'point' | 'line' | 'polygon';
  color: string;
  description: string | null;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = () => (supabase as any).from('network_object_types');

export function useNetworkObjectTypes() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['network-object-types', profile?.company_id],
    queryFn: async (): Promise<NetworkObjectType[]> => {
      const { data, error } = await tbl()
        .select('id, name, geometry_type, color, description, created_at')
        .eq('company_id', profile!.company_id)
        .order('name');
      if (error) throw error;
      return (data ?? []) as NetworkObjectType[];
    },
    enabled: !!profile?.company_id,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['network-object-types', profile?.company_id] });

  const saveMut = useMutation({
    mutationFn: async (t: Partial<NetworkObjectType> & { name: string; geometry_type: string }) => {
      const payload = { ...t, company_id: profile!.company_id };
      const { error } = t.id
        ? await tbl().update(payload).eq('id', t.id)
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
