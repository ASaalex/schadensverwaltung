import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Company } from '@/types/database';

export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: async (): Promise<Company[]> => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('active', true)
        .order('type')
        .order('name');
      if (error) throw error;
      return (data ?? []) as unknown as Company[];
    },
    staleTime: 5 * 60_000,
  });
}
