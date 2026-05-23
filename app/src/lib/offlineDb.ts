import Dexie, { type Table } from 'dexie';

/**
 * Offline-Storage für Schadenserfassungen, die ohne Internet entstehen.
 * Beim nächsten Online-Status werden sie automatisch synchronisiert.
 */

export interface PendingPhotoBlob {
  blob: Blob;
  contentType: string;
}

export interface PendingDamagePayload {
  // Felder wie sie an Supabase gehen — ohne `created_by` (kommt zum Sync-Zeitpunkt vom Profil)
  category_id: string;
  status: 'neu';
  priority: string;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy_m: number | null;
  geometry: unknown | null;
  property_values: Record<string, unknown>;
  address_street: string | null;
  address_house_number: string | null;
  address_postal_code: string | null;
  address_city: string | null;
  address_resolved_at: string | null;
  description: string | null;
}

export interface PendingDamage {
  id?: number;
  localId: string; // UUID für lokale Anzeige
  payload: PendingDamagePayload;
  photos: PendingPhotoBlob[];
  createdAt: number;
  attemptCount: number;
  lastError: string | null;
}

class OfflineDb extends Dexie {
  pendingDamages!: Table<PendingDamage, number>;

  constructor() {
    super('SchadensverwaltungOffline');
    this.version(1).stores({
      pendingDamages: '++id, localId, createdAt',
    });
  }
}

export const offlineDb = new OfflineDb();

export async function queuePendingDamage(
  payload: PendingDamagePayload,
  photos: PendingPhotoBlob[],
): Promise<string> {
  const localId = crypto.randomUUID();
  await offlineDb.pendingDamages.add({
    localId,
    payload,
    photos,
    createdAt: Date.now(),
    attemptCount: 0,
    lastError: null,
  });
  return localId;
}

export async function countPendingDamages(): Promise<number> {
  return await offlineDb.pendingDamages.count();
}

export async function listPendingDamages(): Promise<PendingDamage[]> {
  return await offlineDb.pendingDamages.orderBy('createdAt').toArray();
}

export async function deletePendingDamage(id: number): Promise<void> {
  await offlineDb.pendingDamages.delete(id);
}

export async function markPendingError(id: number, message: string): Promise<void> {
  await offlineDb.pendingDamages.update(id, (item) => {
    item.attemptCount = (item.attemptCount ?? 0) + 1;
    item.lastError = message;
  });
}
