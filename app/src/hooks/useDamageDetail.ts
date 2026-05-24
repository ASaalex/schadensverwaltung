import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Damage, PropertyFieldDef } from '@/types/database';

export interface DamagePhoto {
  id: string;
  damage_id: string;
  storage_path: string;
  photo_type: 'before' | 'after' | 'detail';
  taken_at: string | null;
  uploaded_by: string | null;
  created_at: string;
  /** Browser-URL (signed, ~1h gültig) */
  url?: string;
}

export interface DamageHistoryEvent {
  id: string;
  damage_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  user_name?: string | null;
}

export interface DamageCategoryFull {
  id: string;
  name: string;
  parent_id: string | null;
  geometry_type: 'point' | 'line' | 'polygon';
  property_schema: PropertyFieldDef[];
  default_priority: string | null;
}

export interface ActiveOrderInfo {
  id: string;
  code: string;
  title: string;
  status: string;
  /** Bemerkung der ausführenden Firma zu DIESEM Schaden (aus order_items.company_notes) */
  company_notes: string | null;
  position_status: string | null;
}

export interface RelatedComment {
  id: string;
  message: string;
  created_at: string;
  user_name: string | null;
}

export interface DamageDetail {
  damage: Damage;
  category: DamageCategoryFull | null;
  categoryPath: string[];
  photos: DamagePhoto[];
  history: DamageHistoryEvent[];
  comments: RelatedComment[];
  creatorName?: string | null;
  activeOrder: ActiveOrderInfo | null;
}

export async function fetchDamageDetail(id: string): Promise<DamageDetail> {
  return await fetchDetail(id);
}

async function fetchDetail(id: string): Promise<DamageDetail> {
  // 1) Schaden
  const { data: dRaw, error: dErr } = await supabase
    .from('damages')
    .select('*')
    .eq('id', id)
    .single();
  if (dErr) throw dErr;
  const damage = dRaw as unknown as Damage;

  // 2) Kategorien aller Ebenen für den Breadcrumb
  const { data: allCats } = await supabase
    .from('damage_categories')
    .select('id, name, parent_id, geometry_type, property_schema, default_priority');
  const cats = (allCats ?? []) as unknown as DamageCategoryFull[];
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const category = catMap.get(damage.category_id) ?? null;
  const categoryPath: string[] = [];
  let cur: DamageCategoryFull | null = category;
  while (cur) {
    categoryPath.unshift(cur.name);
    cur = cur.parent_id ? (catMap.get(cur.parent_id) ?? null) : null;
  }

  // 3) Fotos + Signed URLs
  const { data: photosRaw } = await supabase
    .from('damage_photos')
    .select('*')
    .eq('damage_id', id)
    .order('created_at');
  const photos = (photosRaw ?? []) as unknown as DamagePhoto[];
  await Promise.all(
    photos.map(async (p) => {
      const { data: signed } = await supabase.storage
        .from('damage-photos')
        .createSignedUrl(p.storage_path, 3600);
      p.url = signed?.signedUrl;
    }),
  );

  // 4) Historie
  const { data: histRaw } = await supabase
    .from('damage_history')
    .select('*')
    .eq('damage_id', id)
    .order('created_at', { ascending: false });
  const history = (histRaw ?? []) as unknown as DamageHistoryEvent[];

  // 5) Creator-Name (best effort)
  let creatorName: string | null | undefined;
  if (damage.created_by) {
    const { data: u } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', damage.created_by)
      .maybeSingle();
    creatorName = (u as { full_name?: string } | null)?.full_name ?? null;
  }

  // 6) Aktiver Auftrag (falls Schaden einem Auftrag zugewiesen ist)
  // Nimmt den jüngsten nicht-stornierten Auftrag, in dem der Schaden Position ist.
  const { data: orderItems } = await supabase
    .from('order_items')
    .select(
      `
      order_id, company_notes, status,
      order:orders!order_id ( id, code, title, status, created_at )
    `,
    )
    .eq('damage_id', id);
  const itemsWithOrders = (orderItems ?? []) as unknown as Array<{
    company_notes: string | null;
    status: string;
    order: { id: string; code: string; title: string; status: string; created_at: string } | null;
  }>;
  const activeItems = itemsWithOrders
    .filter((i) => !!i.order && i.order.status !== 'storniert')
    .sort((a, b) =>
      (a.order!.created_at < b.order!.created_at ? 1 : -1),
    );
  const activeOrder: ActiveOrderInfo | null = activeItems[0]
    ? {
        id: activeItems[0].order!.id,
        code: activeItems[0].order!.code,
        title: activeItems[0].order!.title,
        status: activeItems[0].order!.status,
        company_notes: activeItems[0].company_notes,
        position_status: activeItems[0].status,
      }
    : null;

  // 7) Schaden-Chat-Nachrichten (neuer Per-Damage-Chat)
  const { data: commentRows } = await supabase
    .from('damage_comments')
    .select('id, message, created_at, user:users!user_id ( full_name )')
    .eq('damage_id', id)
    .order('created_at', { ascending: false });
  const comments: RelatedComment[] = ((commentRows ?? []) as unknown as Array<{
    id: string;
    message: string;
    created_at: string;
    user: { full_name: string } | null;
  }>).map((r) => ({
    id: r.id,
    message: r.message,
    created_at: r.created_at,
    user_name: r.user?.full_name ?? null,
  }));

  return { damage, category, categoryPath, photos, history, comments, creatorName, activeOrder };
}

export function useDamageDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['damage-detail', id],
    queryFn: () => fetchDetail(id!),
    enabled: !!id,
  });
}
