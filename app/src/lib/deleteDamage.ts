import { supabase } from './supabase';

/**
 * Löscht einen Schaden vollständig:
 *  1) Prüfung: nicht in aktivem Auftrag (versendet/angenommen/bearbeitung/fertiggemeldet)
 *  2) Foto-Dateien aus Storage entfernen
 *  3) damage_photos-Rows löschen (über CASCADE via damages, aber explizit safer)
 *  4) order_items aus stornierten/abgeschlossenen Aufträgen entfernen
 *  5) damages-Row löschen — Trigger schreibt 'deleted'-Event in damage_history NICHT mehr,
 *     da Zeile weg ist; das ist auch OK weil der ganze Schaden ja weg ist.
 */
export async function deleteDamage(damageId: string): Promise<void> {
  // 1) Prüfen, ob in aktivem Auftrag
  const { data: itemsRaw, error: itemsErr } = await supabase
    .from('order_items')
    .select('id, order:orders!order_id ( id, status )')
    .eq('damage_id', damageId);
  if (itemsErr) {
    throw new Error(`Auftragspositionen prüfen fehlgeschlagen: ${itemsErr.message}`);
  }
  const items = (itemsRaw ?? []) as unknown as Array<{
    id: string;
    order: { id: string; status: string } | null;
  }>;
  const blockingItems = items.filter((i) => {
    if (!i.order) return false;
    const s = i.order.status;
    return s !== 'storniert' && s !== 'abgeschlossen';
  });
  if (blockingItems.length > 0) {
    throw new Error(
      `Schaden ist Teil von ${blockingItems.length} aktiven Auftrag/Aufträgen und kann nicht gelöscht werden. ` +
        'Stornier den/die Aufträge zuerst.',
    );
  }

  // 2) Foto-Dateien aus Storage entfernen
  const { data: photoRows, error: phErr } = await supabase
    .from('damage_photos')
    .select('storage_path')
    .eq('damage_id', damageId);
  if (phErr) {
    throw new Error(`Foto-Liste laden fehlgeschlagen: ${phErr.message}`);
  }
  const paths = ((photoRows ?? []) as Array<{ storage_path: string }>).map((p) => p.storage_path);
  if (paths.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[deleteDamage] Lösche ${paths.length} Storage-Datei(en):`, paths);
    const { error: stErr } = await supabase.storage.from('damage-photos').remove(paths);
    if (stErr) {
      // eslint-disable-next-line no-console
      console.warn('[deleteDamage] Storage-Lösch-Fehler (continue):', stErr.message);
      // Wir brechen NICHT ab — Storage-Reste sind ärgerlich aber nicht fatal
    }
  }

  // 3) order_items aus stornierten/abgeschlossenen Aufträgen explizit löschen
  // (sonst blockiert die FK-Constraint mit "on delete restrict")
  if (items.length > 0) {
    const { error: oiErr } = await supabase
      .from('order_items')
      .delete()
      .eq('damage_id', damageId);
    if (oiErr) {
      throw new Error(`Auftragspositionen löschen fehlgeschlagen: ${oiErr.message}`);
    }
  }

  // 4) Schaden löschen — damage_photos + damage_history cascaden mit
  const { error } = await supabase.from('damages').delete().eq('id', damageId);
  if (error) {
    throw new Error(`Schaden löschen fehlgeschlagen: ${error.message}`);
  }
}
