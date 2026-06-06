import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';
import type { DamageListItem } from './useDamageList';

export type DamageSortKey =
  | 'code' | 'created_at' | 'category_name' | 'address' | 'creator_name' | 'priority' | 'status';

export interface DamageFilters {
  search: string;
  status: string[];
  priority: string[];
  categoryIds: string[] | null;   // bereits um Nachfahren erweitert
  dateFrom: string;               // 'yyyy-mm-dd' oder ''
  dateTo: string;
  showCompleted: boolean;         // false = erledigt/abgelehnt ausblenden
}

export interface DamageBounds {
  minLng: number; minLat: number; maxLng: number; maxLat: number;
}

const VIEW = 'damages_list';
const COMPLETED = ['erledigt', 'abgelehnt'];

// Sortier-Key → DB-Spalte
const SORT_COLUMN: Record<DamageSortKey, string> = {
  code: 'code',
  created_at: 'created_at',
  category_name: 'category_name',
  address: 'address_street',
  creator_name: 'creator_name',
  priority: 'priority_rank',
  status: 'status_rank',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, f: DamageFilters, companyId: string) {
  q = q.eq('company_id', companyId);

  if (f.status.length > 0) {
    q = q.in('status', f.status);
  } else if (!f.showCompleted) {
    q = q.not('status', 'in', `(${COMPLETED.join(',')})`);
  }
  if (f.priority.length > 0) q = q.in('priority', f.priority);
  if (f.categoryIds && f.categoryIds.length > 0) q = q.in('category_id', f.categoryIds);
  if (f.dateFrom) q = q.gte('created_at', `${f.dateFrom}T00:00:00`);
  if (f.dateTo)   q = q.lte('created_at', `${f.dateTo}T23:59:59`);

  const term = f.search.trim().replace(/[,()%*]/g, ' ').trim();
  if (term.length >= 2) {
    const p = `%${term}%`;
    q = q.or(
      [
        `code.ilike.${p}`,
        `description.ilike.${p}`,
        `address_street.ilike.${p}`,
        `address_city.ilike.${p}`,
        `category_name.ilike.${p}`,
        `creator_name.ilike.${p}`,
      ].join(','),
    );
  }
  return q;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): DamageListItem {
  return {
    id: r.id, code: r.code, status: r.status, priority: r.priority,
    created_at: r.created_at, created_by: r.created_by, description: r.description,
    gps_lat: r.gps_lat, gps_lng: r.gps_lng, gps_accuracy_m: r.gps_accuracy_m, geometry: r.geometry,
    address_street: r.address_street, address_house_number: r.address_house_number,
    address_postal_code: r.address_postal_code, address_city: r.address_city,
    category_id: r.category_id, category_name: r.category_name ?? null,
    creator_name: r.creator_name ?? null,
  };
}

/** Paginierte, serverseitig gefilterte/sortierte Tabellen-Abfrage (mit Gesamtzahl) */
export function useDamagesQuery(
  filters: DamageFilters,
  sort: { key: DamageSortKey; dir: 'asc' | 'desc' },
  page: number,
  pageSize: number,
) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['damages-query', profile?.company_id, filters, sort, page, pageSize],
    enabled: !!profile?.company_id,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: async (): Promise<{ rows: DamageListItem[]; total: number }> => {
      let q = supabase.from(VIEW).select('*', { count: 'exact' });
      q = applyFilters(q, filters, profile!.company_id);
      q = q.order(SORT_COLUMN[sort.key], { ascending: sort.dir === 'asc', nullsFirst: false });
      // stabile Sekundärsortierung
      if (sort.key !== 'created_at') q = q.order('created_at', { ascending: false });
      q = q.range(page * pageSize, page * pageSize + pageSize - 1);

      const { data, error, count } = await q;
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { rows: ((data ?? []) as any[]).map(mapRow), total: count ?? 0 };
    },
  });
}

/** Lädt ALLE gefilterten Schäden (für Export) — seitenweise, gedeckelt */
export async function fetchAllDamages(
  filters: DamageFilters,
  companyId: string,
  sort: { key: DamageSortKey; dir: 'asc' | 'desc' },
  cap = 50_000,
): Promise<DamageListItem[]> {
  const PAGE = 1000;
  let all: DamageListItem[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from(VIEW).select('*');
    q = applyFilters(q, filters, companyId);
    q = q.order(SORT_COLUMN[sort.key], { ascending: sort.dir === 'asc', nullsFirst: false });
    q = q.range(from, from + PAGE - 1);
    const { data, error } = await q;
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((data ?? []) as any[]).map(mapRow);
    all = all.concat(rows);
    if (rows.length < PAGE || all.length >= cap) break;
    from += PAGE;
  }
  return all;
}

/** Karten-Abfrage: gefilterte Schäden im Viewport (BBox), gedeckelt */
export function useDamagesInBounds(
  filters: DamageFilters,
  bounds: DamageBounds | null,
  enabled: boolean,
  cap = 8000,
) {
  const { profile } = useAuth();
  const r = (n: number) => Math.round(n * 1000) / 1000;
  const rb = bounds ? { minLng: r(bounds.minLng), minLat: r(bounds.minLat), maxLng: r(bounds.maxLng), maxLat: r(bounds.maxLat) } : null;

  return useQuery({
    queryKey: ['damages-in-bounds', profile?.company_id, filters, rb, cap],
    enabled: !!profile?.company_id && !!rb && enabled,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: async (): Promise<{ items: DamageListItem[]; capped: boolean }> => {
      let q = supabase.from(VIEW).select(
        'id, code, status, priority, created_at, created_by, description, gps_lat, gps_lng, gps_accuracy_m, geometry, address_street, address_house_number, address_postal_code, address_city, category_id, category_name, creator_name',
      );
      q = applyFilters(q, filters, profile!.company_id);
      q = q.not('gps_lat', 'is', null).not('gps_lng', 'is', null)
        .gte('gps_lat', rb!.minLat).lte('gps_lat', rb!.maxLat)
        .gte('gps_lng', rb!.minLng).lte('gps_lng', rb!.maxLng)
        .limit(cap);

      const { data, error } = await q;
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = ((data ?? []) as any[]).map(mapRow);
      return { items, capped: items.length >= cap };
    },
  });
}
