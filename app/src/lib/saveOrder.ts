import { supabase } from './supabase';
import type { UserProfile } from '@/types/database';

export interface OrderDraft {
  title: string;
  description: string | null;
  assigned_company_id: string;
  planned_start_date: string | null;
  planned_end_date: string | null;
  status: 'entwurf' | 'versendet';
  custom_values?: Record<string, string>;
  positions: Array<{
    damage_id: string;
    sort_order: number;
    planned_date: string | null;
    planned_start_time: string | null;
    planned_end_time: string | null;
  }>;
}

export interface SavedOrder {
  id: string;
  code: string;
}

/**
 * Erstellt einen Auftrag inkl. Positionen.
 *  - INSERT orders (Code via DB-Default next_code('AUF'))
 *  - INSERT order_items für jede Position
 *  - Schäden bekommen Status `zugewiesen`
 *  - Wenn draft.status='versendet': sent_at automatisch
 */
export async function createOrder(profile: UserProfile, draft: OrderDraft): Promise<SavedOrder> {
  const orderPayload = {
    company_id: profile.company_id,
    title: draft.title,
    description: draft.description,
    assigned_company_id: draft.assigned_company_id,
    planned_start_date: draft.planned_start_date,
    planned_end_date: draft.planned_end_date,
    status: draft.status,
    sent_at: draft.status === 'versendet' ? new Date().toISOString() : null,
    created_by: profile.id,
    custom_values: draft.custom_values ?? {},
  };

  const { data: orderRaw, error: oErr } = await supabase
    .from('orders')
    .insert(orderPayload as never)
    .select('id, code')
    .single();
  if (oErr) throw new Error(`Auftrag konnte nicht angelegt werden: ${oErr.message}`);
  const order = orderRaw as unknown as SavedOrder;

  // Positionen einfügen
  if (draft.positions.length > 0) {
    const itemsPayload = draft.positions.map((p) => ({
      order_id: order.id,
      damage_id: p.damage_id,
      sort_order: p.sort_order,
      planned_date: p.planned_date,
      planned_start_time: p.planned_start_time,
      planned_end_time: p.planned_end_time,
      status: 'offen' as const,
    }));
    const { error: iErr } = await supabase.from('order_items').insert(itemsPayload as never);
    if (iErr) throw new Error(`Positionen konnten nicht gespeichert werden: ${iErr.message}`);

    // Schäden auf "zugewiesen" setzen
    const damageIds = draft.positions.map((p) => p.damage_id);
    const { error: uErr } = await supabase
      .from('damages')
      .update({ status: 'zugewiesen' } as never)
      .in('id', damageIds);
    if (uErr) {
      // eslint-disable-next-line no-console
      console.warn('[saveOrder] Schaden-Status-Update fehlgeschlagen:', uErr.message);
    }
  }

  return order;
}
