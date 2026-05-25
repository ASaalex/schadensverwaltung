import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type ActivityKind =
  | 'damage_created'
  | 'damage_status'
  | 'damage_priority'
  | 'damage_comment'
  | 'order_created'
  | 'order_status';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  created_at: string;
  damage_id?: string;
  damage_code?: string;
  order_id?: string;
  order_code?: string;
  user_name?: string | null;
  /** Kurze 1-Zeilen-Zusammenfassung (z.B. Status-Wechsel) */
  details?: string;
  /** Volltext: bei Nachricht der Chat-Text, bei neuer Schaden die Bemerkung */
  message?: string;
  /** Bei neuem Schaden: Kategorie-Pfad */
  category?: string | null;
}

/**
 * Aggregiert die letzten Aktivitäten aus damage_history, damage_comments,
 * order_history und order_comments für den Dashboard-Live-Feed.
 */
export function useDashboardActivity(limit = 30) {
  return useQuery({
    queryKey: ['dashboard-activity', limit],
    queryFn: async (): Promise<ActivityItem[]> => {
      const items: ActivityItem[] = [];

      // 1) damage_history (alle status/prio-Änderungen, neue Schäden)
      // Bei 'created' joinen wir zusätzlich Kategorie + Bemerkung damit der Feed Kontext zeigt
      const { data: hist } = await supabase
        .from('damage_history')
        .select(
          'id, event_type, payload, created_at, damage:damages!damage_id ( id, code, description, category:damage_categories!category_id ( name ) ), user:users!created_by ( full_name )',
        )
        .order('created_at', { ascending: false })
        .limit(limit);
      ((hist ?? []) as unknown as Array<{
        id: string;
        event_type: string;
        payload: Record<string, unknown>;
        created_at: string;
        damage: { id: string; code: string; description: string | null; category: { name: string } | null } | null;
        user: { full_name: string } | null;
      }>).forEach((h) => {
        if (!h.damage) return;
        if (h.event_type === 'created') {
          items.push({
            id: `dh-${h.id}`,
            kind: 'damage_created',
            created_at: h.created_at,
            damage_id: h.damage.id,
            damage_code: h.damage.code,
            user_name: h.user?.full_name ?? null,
            details: 'Neuer Schaden erfasst',
            category: h.damage.category?.name ?? null,
            message: h.damage.description ?? undefined,
          });
        } else if (h.event_type === 'status_changed') {
          items.push({
            id: `dh-${h.id}`,
            kind: 'damage_status',
            created_at: h.created_at,
            damage_id: h.damage.id,
            damage_code: h.damage.code,
            user_name: h.user?.full_name ?? null,
            details: `Status: ${h.payload.from} → ${h.payload.to}`,
          });
        } else if (h.event_type === 'priority_changed') {
          items.push({
            id: `dh-${h.id}`,
            kind: 'damage_priority',
            created_at: h.created_at,
            damage_id: h.damage.id,
            damage_code: h.damage.code,
            user_name: h.user?.full_name ?? null,
            details: `Priorität: ${h.payload.from} → ${h.payload.to}`,
          });
        }
      });

      // 2) damage_comments (neue Chat-Nachrichten zu Schäden)
      const { data: dComments } = await supabase
        .from('damage_comments')
        .select(
          'id, message, created_at, damage:damages!damage_id ( id, code ), user:users!user_id ( full_name )',
        )
        .order('created_at', { ascending: false })
        .limit(limit);
      ((dComments ?? []) as unknown as Array<{
        id: string;
        message: string;
        created_at: string;
        damage: { id: string; code: string } | null;
        user: { full_name: string } | null;
      }>).forEach((c) => {
        if (!c.damage) return;
        items.push({
          id: `dc-${c.id}`,
          kind: 'damage_comment',
          created_at: c.created_at,
          damage_id: c.damage.id,
          damage_code: c.damage.code,
          user_name: c.user?.full_name ?? null,
          message: c.message,
        });
      });

      // 3) order_history (neue Aufträge + Status-Änderungen)
      const { data: oHist } = await supabase
        .from('order_history')
        .select(
          'id, event_type, payload, created_at, order:orders!order_id ( id, code ), user:users!created_by ( full_name )',
        )
        .order('created_at', { ascending: false })
        .limit(limit);
      ((oHist ?? []) as unknown as Array<{
        id: string;
        event_type: string;
        payload: Record<string, unknown>;
        created_at: string;
        order: { id: string; code: string } | null;
        user: { full_name: string } | null;
      }>).forEach((h) => {
        if (!h.order) return;
        if (h.event_type === 'created') {
          items.push({
            id: `oh-${h.id}`,
            kind: 'order_created',
            created_at: h.created_at,
            order_id: h.order.id,
            order_code: h.order.code,
            user_name: h.user?.full_name ?? null,
            details: 'Neuer Auftrag angelegt',
          });
        } else if (h.event_type === 'status_changed') {
          items.push({
            id: `oh-${h.id}`,
            kind: 'order_status',
            created_at: h.created_at,
            order_id: h.order.id,
            order_code: h.order.code,
            user_name: h.user?.full_name ?? null,
            details: `Auftrag: ${h.payload.from} → ${h.payload.to}`,
          });
        }
      });

      // Sortieren + Limit
      items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return items.slice(0, limit);
    },
    // Live-Feeling: alle 30 Sekunden automatisch neuladen
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

interface TodayCounts {
  damagesToday: number;
  positionsToday: number;
}

export function useTodayCounts() {
  return useQuery({
    queryKey: ['today-counts'],
    queryFn: async (): Promise<TodayCounts> => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startIso = startOfDay.toISOString();
      const today = startOfDay.toISOString().slice(0, 10);

      const [dRes, pRes] = await Promise.all([
        supabase
          .from('damages')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', startIso),
        supabase
          .from('order_items')
          .select('id', { count: 'exact', head: true })
          .eq('planned_date', today),
      ]);

      return {
        damagesToday: dRes.count ?? 0,
        positionsToday: pRes.count ?? 0,
      };
    },
    refetchInterval: 60_000,
  });
}
