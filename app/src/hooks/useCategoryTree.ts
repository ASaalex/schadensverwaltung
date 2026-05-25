import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { buildCategoryTree } from '@/lib/categories';
import { cacheGet, cacheSet, CACHE_KEYS } from '@/lib/localCache';
import type { DamageCategory } from '@/types/database';

interface Options {
  /** Wenn true, werden auch inaktive Kategorien geladen (für Admin-Editor). */
  includeInactive?: boolean;
}

export function useCategoryTree(options?: Options) {
  const includeInactive = options?.includeInactive ?? false;
  const cacheKey = `${CACHE_KEYS.categories}:${includeInactive ? 'all' : 'active'}`;
  return useQuery({
    queryKey: ['category-tree', includeInactive ? 'all' : 'active'],
    // Initial-Wert aus Offline-Cache nutzen, damit die App auch ohne Netz Kategorien zeigt
    initialData: () => {
      const cached = cacheGet<DamageCategory[]>(cacheKey);
      return cached ? buildCategoryTree(cached) : undefined;
    },
    queryFn: async () => {
      let q = supabase.from('damage_categories').select('*').order('sort_order');
      if (!includeInactive) q = q.eq('active', true);
      const { data, error } = await q;
      if (error) {
        // Fallback: Cache, sonst rethrow
        const cached = cacheGet<DamageCategory[]>(cacheKey);
        if (cached) return buildCategoryTree(cached);
        throw error;
      }
      const list = (data ?? []) as unknown as DamageCategory[];
      cacheSet(cacheKey, list);
      return buildCategoryTree(list);
    },
    staleTime: 5 * 60_000,
  });
}
