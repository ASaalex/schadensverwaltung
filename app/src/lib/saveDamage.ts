import { supabase } from './supabase';
import { queuePendingDamage, type PendingDamagePayload, type PendingPhotoBlob } from './offlineDb';
import type { UserProfile } from '@/types/database';
import type { useWizardStore } from '@/routes/erfasser/wizardStore';

type WizardState = ReturnType<typeof useWizardStore.getState>;

interface InsertedDamage {
  id: string;
  code: string;
}

export interface SaveProgress {
  step: 'inserting' | 'uploading_photo' | 'inserting_photo_row' | 'done';
  photoIndex?: number;
  photoTotal?: number;
}

/**
 * Speichert einen Schaden aus dem Wizard-State.
 *  - INSERT in damages (Code via DB-Default next_code('SCH'))
 *  - Foto-Uploads in Storage-Bucket damage-photos (mit 20s Timeout)
 *  - INSERT in damage_photos
 *
 * Wirft Fehler mit klarem deutschen Text, ruft optional onProgress auf.
 */
export async function saveDamage(
  profile: UserProfile,
  state: WizardState,
  onProgress?: (p: SaveProgress) => void,
): Promise<string> {
  if (!state.position) throw new Error('Keine Position vorhanden');
  if (!state.category) throw new Error('Keine Kategorie ausgewählt');

  const addr = state.address;

  // Offline-Fallback: Wenn kein Internet, in IndexedDB ablegen und später syncen.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const offlinePayload: PendingDamagePayload = {
      category_id: state.category.id,
      status: 'neu',
      priority: state.priority,
      gps_lat: state.position.lat,
      gps_lng: state.position.lng,
      gps_accuracy_m: state.position.accuracy,
      geometry: state.geometry,
      property_values: state.propertyValues,
      address_street: addr?.street ?? null,
      address_house_number: addr?.house_number ?? null,
      address_postal_code: addr?.postal_code ?? null,
      address_city: addr?.city ?? null,
      address_resolved_at: addr ? new Date().toISOString() : null,
      description: state.description.trim() || null,
    };
    const photoBlobs: PendingPhotoBlob[] = state.photos.map((p) => ({
      blob: p.file,
      contentType: p.file.type || 'image/jpeg',
    }));
    const localId = await queuePendingDamage(offlinePayload, photoBlobs);
    // eslint-disable-next-line no-console
    console.log('[saveDamage] OFFLINE: in Queue gelegt', localId);
    return `LOCAL-${localId.slice(0, 8)} (offline, wartet auf Sync)`;
  }

  const payload = {
    company_id: profile.company_id,
    category_id: state.category.id,
    status: 'neu' as const,
    priority: state.priority,
    gps_lat: state.position.lat,
    gps_lng: state.position.lng,
    gps_accuracy_m: state.position.accuracy,
    geometry: state.geometry,
    property_values: state.propertyValues,
    address_street: addr?.street ?? null,
    address_house_number: addr?.house_number ?? null,
    address_postal_code: addr?.postal_code ?? null,
    address_city: addr?.city ?? null,
    address_resolved_at: addr ? new Date().toISOString() : null,
    description: state.description.trim() || null,
    created_by: profile.id,
  };

  // eslint-disable-next-line no-console
  console.log('[saveDamage] INSERT damage …', payload);
  onProgress?.({ step: 'inserting' });

  const { data, error } = await supabase
    .from('damages')
    .insert(payload as never)
    .select('id, code')
    .single();
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[saveDamage] damages-INSERT-Fehler:', error);
    throw new Error(`Schaden konnte nicht angelegt werden: ${error.message}`);
  }
  const damage = data as unknown as InsertedDamage;
  // eslint-disable-next-line no-console
  console.log('[saveDamage] Damage angelegt:', damage.code);

  // Foto-Upload mit Timeout pro Datei
  const total = state.photos.length;
  for (let i = 0; i < total; i++) {
    const photo = state.photos[i];
    const ext = photo.file.type.includes('png') ? 'png' : 'jpg';
    const uuid = crypto.randomUUID();
    const storagePath = `${profile.company_id}/${damage.id}/before/${uuid}.${ext}`;

    onProgress?.({ step: 'uploading_photo', photoIndex: i + 1, photoTotal: total });
    // eslint-disable-next-line no-console
    console.log(`[saveDamage] Foto ${i + 1}/${total} hochladen (${photo.file.size} Bytes) → ${storagePath}`);

    try {
      await withTimeout(
        supabase.storage
          .from('damage-photos')
          .upload(storagePath, photo.file, { contentType: photo.file.type || 'image/jpeg', upsert: false }),
        20_000,
        `Foto-Upload ${i + 1}/${total} hat 20s überschritten`,
      ).then(({ error: upErr }) => {
        if (upErr) throw new Error(upErr.message);
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[saveDamage] Foto-Upload ${i + 1}/${total} fehlgeschlagen:`, e);
      throw new Error(
        `Foto ${i + 1}/${total} konnte nicht hochgeladen werden: ${(e as Error).message}. ` +
          `Schaden ${damage.code} ist trotzdem angelegt — Fotos kannst du später in der Disposition ergänzen.`,
      );
    }

    onProgress?.({ step: 'inserting_photo_row', photoIndex: i + 1, photoTotal: total });
    const photoRow = {
      damage_id: damage.id,
      storage_path: storagePath,
      photo_type: 'before' as const,
      taken_at: new Date().toISOString(),
      uploaded_by: profile.id,
    };
    const { error: phErr } = await supabase.from('damage_photos').insert(photoRow as never);
    if (phErr) {
      // eslint-disable-next-line no-console
      console.error('[saveDamage] damage_photos-INSERT-Fehler:', phErr);
      // Datei ist im Storage, aber Row fehlt — nicht fatal, weitermachen
    }
  }

  onProgress?.({ step: 'done' });
  // eslint-disable-next-line no-console
  console.log('[saveDamage] Fertig.');
  return damage.code;
}

function withTimeout<T>(p: PromiseLike<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
