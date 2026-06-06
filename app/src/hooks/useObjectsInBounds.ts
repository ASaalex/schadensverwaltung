import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';
import type { NetworkObject } from './useNetworkObjects';

export interface Bounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

const MAX_OBJECTS = 1500; // Sicherheits-Limit pro Viewport

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = () => (supabase as any).from('network_objects');

/** Rundet die Bounds, damit kleine Kartenbewegungen keinen Refetch auslösen */
function roundBounds(b: Bounds): Bounds {
  const r = (n: number) => Math.round(n * 1000) / 1000; // ~100 m Raster
  return { minLng: r(b.minLng), minLat: r(b.minLat), maxLng: r(b.maxLng), maxLat: r(b.maxLat) };
}

/**
 * Lädt nur Objekte, deren Bounding-Box den Viewport schneidet.
 * Overlap-Test: obj.min <= view.max  UND  obj.max >= view.min  (je Achse).
 */
export function useObjectsInBounds(bounds: Bounds | null, enabled: boolean) {
  const { profile } = useAuth();
  const rb = bounds ? roundBounds(bounds) : null;

  return useQuery({
    queryKey: ['objects-in-bounds', profile?.company_id, rb],
    enabled: !!profile?.company_id && !!rb && enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async (): Promise<NetworkObject[]> => {
      const { data, error } = await tbl()
        .select(`
          id, object_type_id, name, identifier, geometry, attributes, created_at, updated_at,
          object_type:network_object_types!object_type_id ( name, color, geometry_type )
        `)
        .eq('company_id', profile!.company_id)
        .lte('bbox_min_lng', rb!.maxLng)
        .gte('bbox_max_lng', rb!.minLng)
        .lte('bbox_min_lat', rb!.maxLat)
        .gte('bbox_max_lat', rb!.minLat)
        .limit(MAX_OBJECTS);
      if (error) throw error;
      return ((data ?? []) as unknown as Array<NetworkObject & {
        object_type: { name: string; color: string; geometry_type: string } | null;
      }>).map((r) => ({
        ...r,
        type_name:          r.object_type?.name,
        type_color:         r.object_type?.color,
        type_geometry_type: r.object_type?.geometry_type,
      }));
    },
  });
}
