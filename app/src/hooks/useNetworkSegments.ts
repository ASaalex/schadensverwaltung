import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface RoadSegment {
  id: string;
  from_node: string;
  to_node: string;
  name: string | null;
  length_m: number | null;
  road_class: string | null;
  geometry: { type: 'LineString'; coordinates: number[][] } | null;
  created_at: string;
  updated_at: string;
}

export function useNetworkSegments() {
  return useQuery({
    queryKey: ['road-segments'],
    queryFn: async (): Promise<RoadSegment[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('road_segments')
        .select('id, from_node, to_node, name, length_m, road_class, geometry, created_at, updated_at')
        .order('from_node');
      if (error) throw error;
      return (data ?? []) as RoadSegment[];
    },
  });
}
