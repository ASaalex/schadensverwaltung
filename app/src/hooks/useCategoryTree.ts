import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { buildCategoryTree } from '@/lib/categories';
import type { DamageCategory } from '@/types/database';

interface Options {
  /** Wenn true, werden auch inaktive Kategorien geladen (für Admin-Editor). */
  includeInactive?: boolean;
}

export function useCategoryTree(options?: Options) {
  const includeInactive = options?.includeInactive ?? false;
  return useQuery({
    queryKey: ['category-tree', includeInactive ? 'all' : 'active'],
    queryFn: async () => {
      let q = supabase.from('damage_categories').select('*').order('sort_order');
      if (!includeInactive) q = q.eq('active', true);
      const { data, error } = await q;
      if (error) throw error;
      return buildCategoryTree((data ?? []) as unknown as DamageCategory[]);
    },
    staleTime: 5 * 60_000,
  });
}
