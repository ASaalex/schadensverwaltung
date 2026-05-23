import { supabase } from './supabase';

/**
 * Disposition-Aktionen für Aufträge.
 * Alle Helpers werfen bei Fehler einen Error mit deutschem Text.
 */

export async function sendOrder(orderId: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ status: 'versendet', sent_at: new Date().toISOString() } as never)
    .eq('id', orderId);
  if (error) throw new Error(`Versenden fehlgeschlagen: ${error.message}`);
}

export async function cancelOrder(orderId: string): Promise<void> {
  // 1) Schäden aus den Positionen zurück auf 'geprueft' setzen
  const { data: items, error: iErr } = await supabase
    .from('order_items')
    .select('damage_id')
    .eq('order_id', orderId);
  if (iErr) throw new Error(`Positionen lesen fehlgeschlagen: ${iErr.message}`);
  const damageIds = (items ?? []).map((i) => (i as { damage_id: string }).damage_id);
  if (damageIds.length > 0) {
    const { error: dErr } = await supabase
      .from('damages')
      .update({ status: 'geprueft' } as never)
      .in('id', damageIds);
    if (dErr) {
      // eslint-disable-next-line no-console
      console.warn('[cancelOrder] Schaden-Status-Reset fehlgeschlagen:', dErr.message);
    }
  }
  // 2) Auftrag stornieren
  const { error } = await supabase
    .from('orders')
    .update({ status: 'storniert' } as never)
    .eq('id', orderId);
  if (error) throw new Error(`Stornieren fehlgeschlagen: ${error.message}`);
}

export async function acceptOrder(orderId: string): Promise<void> {
  // Disposition akzeptiert den fertiggemeldeten Auftrag offiziell
  const { error } = await supabase
    .from('orders')
    .update({ status: 'abgeschlossen', completed_at: new Date().toISOString() } as never)
    .eq('id', orderId);
  if (error) throw new Error(`Abnehmen fehlgeschlagen: ${error.message}`);
}

export async function requestRework(orderId: string, reason?: string): Promise<void> {
  // Auftrag geht zurück in Bearbeitung
  const { error } = await supabase
    .from('orders')
    .update({ status: 'bearbeitung', fertiggemeldet_at: null } as never)
    .eq('id', orderId);
  if (error) throw new Error(`Nacharbeit anfordern fehlgeschlagen: ${error.message}`);
  // Kommentar mit der Begründung (optional) — mit user_id, damit Autor zugeordnet wird
  if (reason && reason.trim()) {
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from('order_comments').insert({
      order_id: orderId,
      user_id: userData.user?.id ?? null,
      message: `Nacharbeit angefordert: ${reason.trim()}`,
    } as never);
  }
}

/**
 * Firma-Aktionen
 */

export async function takeOrder(orderId: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ status: 'angenommen', accepted_at: new Date().toISOString() } as never)
    .eq('id', orderId);
  if (error) throw new Error(`Annehmen fehlgeschlagen: ${error.message}`);
}

/** Firma meldet alle Arbeiten fertig. Setzt Schäden auf 'erledigt'. */
export async function reportOrderFinished(orderId: string): Promise<void> {
  // 1) Alle erledigt-Positionen → damage.status = 'erledigt'
  const { data: items } = await supabase
    .from('order_items')
    .select('damage_id, status')
    .eq('order_id', orderId);
  const doneDamageIds = (items ?? [])
    .filter((i) => (i as { status: string }).status === 'erledigt')
    .map((i) => (i as { damage_id: string }).damage_id);
  if (doneDamageIds.length > 0) {
    await supabase
      .from('damages')
      .update({ status: 'erledigt' } as never)
      .in('id', doneDamageIds);
  }
  // 2) Auftrag auf fertiggemeldet
  const { error } = await supabase
    .from('orders')
    .update({ status: 'fertiggemeldet', fertiggemeldet_at: new Date().toISOString() } as never)
    .eq('id', orderId);
  if (error) throw new Error(`Fertigmeldung fehlgeschlagen: ${error.message}`);
}

export type PositionStatus = 'offen' | 'bearbeitung' | 'erledigt' | 'uebersprungen';

export async function setPositionStatus(
  positionId: string,
  status: PositionStatus,
  companyNotes?: string | null,
): Promise<void> {
  // Vorab: alte Position (für Notes-Diff) + Damage-Code + Order-ID holen
  const { data: existingRaw, error: existErr } = await supabase
    .from('order_items')
    .select(
      'order_id, damage_id, status, company_notes, damage:damages!damage_id ( code ), order:orders!order_id ( id, status )',
    )
    .eq('id', positionId)
    .single();
  if (existErr) throw new Error(`Position nicht gefunden: ${existErr.message}`);
  const existing = existingRaw as unknown as {
    order_id: string;
    damage_id: string;
    status: string;
    company_notes: string | null;
    damage: { code: string } | null;
    order: { id: string; status: string } | null;
  };

  const payload: Record<string, unknown> = {
    status,
    company_notes: companyNotes ?? null,
  };
  if (status === 'erledigt') payload.completed_at = new Date().toISOString();
  else payload.completed_at = null;

  const { error } = await supabase
    .from('order_items')
    .update(payload as never)
    .eq('id', positionId);
  if (error) throw new Error(`Status setzen fehlgeschlagen: ${error.message}`);

  // Schaden-Status synchronisieren — damit Disposition den Fortschritt sieht
  // und der History-Trigger einen status_changed-Event schreibt
  let newDamageStatus: string | null = null;
  if (status === 'bearbeitung') newDamageStatus = 'bearbeitung';
  else if (status === 'erledigt') newDamageStatus = 'erledigt';
  else if (status === 'uebersprungen') newDamageStatus = 'zugewiesen';
  // 'offen' nichts ändern — bleibt zugewiesen
  if (newDamageStatus) {
    await supabase
      .from('damages')
      .update({ status: newDamageStatus } as never)
      .eq('id', existing.damage_id);
  }

  // Auftrag-Status-Auto-Transition: erste 'bearbeitung'-Position hebt Order auf 'bearbeitung'
  if (status === 'bearbeitung' && existing.order &&
      (existing.order.status === 'versendet' || existing.order.status === 'angenommen')) {
    await supabase
      .from('orders')
      .update({ status: 'bearbeitung' } as never)
      .eq('id', existing.order_id);
  }

  // Bemerkungsänderung als Order-Kommentar loggen, damit Disposition es sieht
  if (companyNotes && companyNotes.trim() && companyNotes !== existing.company_notes) {
    // Auth-User holen, weil RLS unter Umständen user_id braucht
    const { data: userData } = await supabase.auth.getUser();
    const damageCode = existing.damage?.code ?? 'Schaden';
    await supabase.from('order_comments').insert({
      order_id: existing.order_id,
      user_id: userData.user?.id ?? null,
      message: `${damageCode}: ${companyNotes.trim()}`,
    } as never);
  }
}
