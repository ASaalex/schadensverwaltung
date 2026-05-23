import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';
import { useOnlineStatus } from './useOnlineStatus';
import {
  listPendingDamages,
  countPendingDamages,
  deletePendingDamage,
  markPendingError,
} from '@/lib/offlineDb';

/**
 * Verwaltet den Sync von offline gespeicherten Schäden.
 * - Auto-Sync wenn online
 * - Manuelles Trigger via `syncNow`
 * - Counter wird live aktualisiert
 */
export function usePendingSync() {
  const { profile } = useAuth();
  const online = useOnlineStatus();
  const qc = useQueryClient();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setPendingCount(await countPendingDamages());
  }, []);

  const syncNow = useCallback(async (): Promise<{ ok: number; failed: number }> => {
    if (!profile || syncing) return { ok: 0, failed: 0 };
    setSyncing(true);
    setLastError(null);
    let ok = 0;
    let failed = 0;
    try {
      const items = await listPendingDamages();
      for (const item of items) {
        try {
          // 1) INSERT damage
          const insertPayload = {
            ...item.payload,
            company_id: profile.company_id,
            created_by: profile.id,
          };
          const { data: dRaw, error: dErr } = await supabase
            .from('damages')
            .insert(insertPayload as never)
            .select('id, code')
            .single();
          if (dErr) throw new Error(dErr.message);
          const damage = dRaw as unknown as { id: string; code: string };

          // 2) Fotos
          for (const ph of item.photos) {
            const ext = ph.contentType.includes('png') ? 'png' : 'jpg';
            const uuid = crypto.randomUUID();
            const storagePath = `${profile.company_id}/${damage.id}/before/${uuid}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from('damage-photos')
              .upload(storagePath, ph.blob, { contentType: ph.contentType, upsert: true });
            if (upErr) throw new Error(`Foto-Upload: ${upErr.message}`);
            await supabase.from('damage_photos').insert({
              damage_id: damage.id,
              storage_path: storagePath,
              photo_type: 'before',
              taken_at: new Date(item.createdAt).toISOString(),
              uploaded_by: profile.id,
            } as never);
          }

          // 3) Aus Queue entfernen
          if (item.id) await deletePendingDamage(item.id);
          ok += 1;
        } catch (e) {
          failed += 1;
          if (item.id) await markPendingError(item.id, (e as Error).message);
          // eslint-disable-next-line no-console
          console.error('[Sync] Schaden konnte nicht synchronisiert werden:', e);
        }
      }
      // Caches invalidieren
      await qc.invalidateQueries({ queryKey: ['damage-list'] });
      await qc.invalidateQueries({ queryKey: ['erfasser', 'my-damages'] });
      await qc.invalidateQueries({ queryKey: ['erfasser', 'list'] });
      await refresh();
    } catch (e) {
      setLastError((e as Error).message);
    } finally {
      setSyncing(false);
    }
    return { ok, failed };
  }, [profile, syncing, qc, refresh]);

  // Initial-Counter laden
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-Sync wenn online und Pending vorhanden
  useEffect(() => {
    if (online && pendingCount > 0 && profile && !syncing) {
      syncNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, pendingCount, profile]);

  return { online, pendingCount, syncing, lastError, syncNow, refresh };
}
