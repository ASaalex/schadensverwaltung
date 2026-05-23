import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface PositionPhoto {
  id: string;
  url: string | undefined;
  photo_type: 'before' | 'after' | 'detail';
}

export interface OrderPosition {
  id: string;
  damage_id: string;
  sort_order: number;
  planned_date: string | null;
  planned_start_time: string | null;
  planned_end_time: string | null;
  status: string;
  company_notes: string | null;
  completed_at: string | null;
  // join
  damage_code: string;
  damage_status: string;
  damage_priority: string;
  damage_address: string;
  damage_category: string | null;
  damage_description: string | null;
  damage_lat: number | null;
  damage_lng: number | null;
  damage_geometry: unknown | null;
  photos: PositionPhoto[];
}

export interface OrderComment {
  id: string;
  message: string;
  created_at: string;
  user_name: string | null;
}

export interface OrderDetail {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: string;
  planned_start_date: string | null;
  planned_end_date: string | null;
  assigned_company_id: string;
  assigned_company_name: string | null;
  assigned_company_type: 'internal_bauhof' | 'external_company' | null;
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  fertiggemeldet_at: string | null;
  completed_at: string | null;
  positions: OrderPosition[];
  comments: OrderComment[];
}

export function useOrderDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['order-detail', id],
    enabled: !!id,
    queryFn: async (): Promise<OrderDetail> => {
      const { data: orderRaw, error: oErr } = await supabase
        .from('orders')
        .select(
          `
          *,
          assigned_company:companies!assigned_company_id ( name, type )
        `,
        )
        .eq('id', id!)
        .single();
      if (oErr) throw oErr;
      const order = orderRaw as unknown as {
        id: string;
        code: string;
        title: string;
        description: string | null;
        status: string;
        planned_start_date: string | null;
        planned_end_date: string | null;
        assigned_company_id: string;
        created_at: string;
        sent_at: string | null;
        accepted_at: string | null;
        fertiggemeldet_at: string | null;
        completed_at: string | null;
        assigned_company: { name: string; type: 'internal_bauhof' | 'external_company' } | null;
      };

      // Positionen mit Damage-Daten
      const { data: itemsRaw, error: iErr } = await supabase
        .from('order_items')
        .select(
          `
          *,
          damage:damages!damage_id (
            code, status, priority, gps_lat, gps_lng, geometry, description,
            address_street, address_house_number, address_postal_code, address_city,
            category:damage_categories!category_id ( name )
          )
        `,
        )
        .eq('order_id', id!)
        .order('sort_order');
      if (iErr) throw iErr;

      const items = (itemsRaw ?? []) as unknown as Array<{
        id: string;
        damage_id: string;
        sort_order: number;
        planned_date: string | null;
        planned_start_time: string | null;
        planned_end_time: string | null;
        status: string;
        company_notes: string | null;
        completed_at: string | null;
        damage: {
          code: string;
          status: string;
          priority: string;
          gps_lat: number | null;
          gps_lng: number | null;
          geometry: unknown | null;
          description: string | null;
          address_street: string | null;
          address_house_number: string | null;
          address_postal_code: string | null;
          address_city: string | null;
          category: { name: string } | null;
        } | null;
      }>;

      // Fotos für alle Schäden des Auftrags
      const damageIds = items.map((it) => it.damage_id);
      const photosByDamage = new Map<string, PositionPhoto[]>();
      if (damageIds.length > 0) {
        const { data: photoRows } = await supabase
          .from('damage_photos')
          .select('id, damage_id, storage_path, photo_type, created_at')
          .in('damage_id', damageIds)
          .order('created_at');
        const rows = (photoRows ?? []) as unknown as Array<{
          id: string;
          damage_id: string;
          storage_path: string;
          photo_type: 'before' | 'after' | 'detail';
        }>;
        // Signed URLs in parallel
        await Promise.all(
          rows.map(async (r) => {
            const { data: signed } = await supabase.storage
              .from('damage-photos')
              .createSignedUrl(r.storage_path, 3600);
            const photo: PositionPhoto = {
              id: r.id,
              photo_type: r.photo_type,
              url: signed?.signedUrl,
            };
            const list = photosByDamage.get(r.damage_id) ?? [];
            list.push(photo);
            photosByDamage.set(r.damage_id, list);
          }),
        );
      }

      const positions: OrderPosition[] = items.map((it) => ({
        id: it.id,
        damage_id: it.damage_id,
        sort_order: it.sort_order,
        planned_date: it.planned_date,
        planned_start_time: it.planned_start_time,
        planned_end_time: it.planned_end_time,
        status: it.status,
        company_notes: it.company_notes,
        completed_at: it.completed_at,
        damage_code: it.damage?.code ?? '',
        damage_status: it.damage?.status ?? '',
        damage_priority: it.damage?.priority ?? '',
        damage_address: [it.damage?.address_street, it.damage?.address_house_number]
          .filter(Boolean)
          .join(' '),
        damage_category: it.damage?.category?.name ?? null,
        damage_description: it.damage?.description ?? null,
        damage_lat: it.damage?.gps_lat ?? null,
        damage_lng: it.damage?.gps_lng ?? null,
        damage_geometry: it.damage?.geometry ?? null,
        photos: photosByDamage.get(it.damage_id) ?? [],
      }));

      // Auftrags-Kommentare laden
      const { data: commentsRaw } = await supabase
        .from('order_comments')
        .select('id, message, created_at, user:users!user_id ( full_name )')
        .eq('order_id', id!)
        .order('created_at', { ascending: false });
      const comments: OrderComment[] = ((commentsRaw ?? []) as unknown as Array<{
        id: string;
        message: string;
        created_at: string;
        user: { full_name: string } | null;
      }>).map((c) => ({
        id: c.id,
        message: c.message,
        created_at: c.created_at,
        user_name: c.user?.full_name ?? null,
      }));

      return {
        id: order.id,
        code: order.code,
        title: order.title,
        description: order.description,
        status: order.status,
        planned_start_date: order.planned_start_date,
        planned_end_date: order.planned_end_date,
        assigned_company_id: order.assigned_company_id,
        assigned_company_name: order.assigned_company?.name ?? null,
        assigned_company_type: order.assigned_company?.type ?? null,
        created_at: order.created_at,
        sent_at: order.sent_at,
        accepted_at: order.accepted_at,
        fertiggemeldet_at: order.fertiggemeldet_at,
        completed_at: order.completed_at,
        positions,
        comments,
      };
    },
  });
}
