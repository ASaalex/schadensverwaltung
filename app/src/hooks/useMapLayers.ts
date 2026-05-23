import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { MapLayer } from '@/types/database';

export function useMapLayers() {
  return useQuery({
    queryKey: ['map-layers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('map_layers')
        .select('*')
        .eq('enabled', true)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as unknown as MapLayer[];
    },
    staleTime: 60 * 60_000,
  });
}
