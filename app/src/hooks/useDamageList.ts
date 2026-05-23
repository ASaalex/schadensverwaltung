import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface DamageListItem {
  id: string;
  code: string;
  status: string;
  priority: string;
  created_at: string;
  created_by: string | null;
  description: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy_m: number | null;
  geometry: unknown | null;
  address_street: string | null;
  address_house_number: string | null;
  address_postal_code: string | null;
  address_city: string | null;
  category_id: string;
  category_name: string | null;
  creator_name: string | null;
}

/** Liefert alle Schäden inkl. zugehöriger Kategorie-Namen + Erfasser-Name. */
export function useDamageList() {
  return useQuery({
    queryKey: ['damage-list'],
    queryFn: async (): Promise<DamageListItem[]> => {
      const { data, error } = await supabase
        .from('damages')
        .select(
          `
          id, code, status, priority, created_at, created_by,
          description, gps_lat, gps_lng, gps_accuracy_m, geometry,
          address_street, address_house_number, address_postal_code, address_city,
          category_id,
          category:damage_categories!category_id ( name ),
          creator:users!created_by ( full_name )
        `,
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      // supabase-js gibt joins als verschachtelte Objekte
      const rows = (data ?? []) as unknown as Array<
        Omit<DamageListItem, 'category_name' | 'creator_name'> & {
          category: { name: string } | null;
          creator: { full_name: string } | null;
        }
      >;
      return rows.map((r) => ({
        id: r.id,
        code: r.code,
        status: r.status,
        priority: r.priority,
        created_at: r.created_at,
        created_by: r.created_by,
        description: r.description,
        gps_lat: r.gps_lat,
        gps_lng: r.gps_lng,
        gps_accuracy_m: r.gps_accuracy_m,
        geometry: r.geometry,
        address_street: r.address_street,
        address_house_number: r.address_house_number,
        address_postal_code: r.address_postal_code,
        address_city: r.address_city,
        category_id: r.category_id,
        category_name: r.category?.name ?? null,
        creator_name: r.creator?.full_name ?? null,
      }));
    },
  });
}
