import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { mergePrintConfig, type PrintConfig } from '@/lib/printConfig';
import { useAuth } from '@/auth/AuthContext';

export function usePrintConfig() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['print-config', profile?.company_id],
    queryFn: async (): Promise<PrintConfig> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('print_config')
        .select('config')
        .eq('company_id', profile!.company_id)
        .maybeSingle();
      if (error) throw error;
      return mergePrintConfig(data?.config ?? null);
    },
    enabled: !!profile?.company_id,
  });
}

export function useSavePrintConfig() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (config: PrintConfig) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tbl = (supabase as any).from('print_config');
      const { error } = await tbl.upsert(
        { company_id: profile!.company_id, config, updated_at: new Date().toISOString() },
        { onConflict: 'company_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['print-config', profile?.company_id] }),
  });
}
