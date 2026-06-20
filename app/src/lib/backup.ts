import { supabase } from './supabase';
import { zip, unzip, type Unzipped } from 'fflate';

/**
 * Daten-Sicherung (Export/Import) je Firma als JSON.
 * Liest/schreibt nur, was die RLS der angemeldeten (Admin-)Rolle erlaubt
 * → also die eigene Firma. IDs bleiben erhalten (Upsert), damit Beziehungen
 * (Fremdschlüssel) beim Wiederherstellen stimmen.
 */

export interface TableSpec { name: string; conflict: string; }

/** Reihenfolge = Import-Reihenfolge (Eltern vor Kindern wegen Fremdschlüsseln) */
export const BACKUP_TABLES: TableSpec[] = [
  { name: 'companies',                conflict: 'id' },
  { name: 'users',                    conflict: 'id' },
  { name: 'map_layers',               conflict: 'id' },
  { name: 'print_config',             conflict: 'id' },
  { name: 'custom_fields',            conflict: 'id' },
  { name: 'damage_categories',        conflict: 'id' },
  { name: 'road_classes',             conflict: 'id' },
  { name: 'road_class_intervals',     conflict: 'company_id,road_class' },
  { name: 'network_object_types',     conflict: 'id' },
  { name: 'network_nodes',            conflict: 'id' },
  { name: 'road_segments',            conflict: 'id' },
  { name: 'network_areas',            conflict: 'id' },
  { name: 'network_objects',          conflict: 'id' },
  { name: 'network_object_documents', conflict: 'id' },
  { name: 'damages',                  conflict: 'id' },
  { name: 'damage_photos',            conflict: 'id' },
  { name: 'damage_comments',          conflict: 'id' },
  { name: 'damage_history',           conflict: 'id' },
  { name: 'orders',                   conflict: 'id' },
  { name: 'order_items',              conflict: 'id' },
  { name: 'order_comments',           conflict: 'id' },
  { name: 'order_history',            conflict: 'id' },
  { name: 'segment_inspections',      conflict: 'id' },
];

export interface BackupFile {
  format: 'schadensverwaltung-backup';
  version: number;
  exported_at: string;
  company_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tables: Record<string, any[]>;
}

export type ProgressFn = (msg: string) => void;

/** Liest alle Zeilen einer Tabelle (seitenweise), gefiltert durch RLS. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(table: string): Promise<any[]> {
  const PAGE = 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let all: any[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from(table).select('*').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = data ?? [];
    all = all.concat(rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function exportBackup(companyId: string | null, onProgress?: ProgressFn): Promise<BackupFile> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tables: Record<string, any[]> = {};
  for (const t of BACKUP_TABLES) {
    onProgress?.(`Exportiere ${t.name} …`);
    try {
      tables[t.name] = await fetchAll(t.name);
    } catch (e) {
      // Tabelle existiert evtl. nicht / kein Zugriff → überspringen, aber melden
      // eslint-disable-next-line no-console
      console.warn('[backup] Export übersprungen:', t.name, e);
      tables[t.name] = [];
    }
  }
  return {
    format: 'schadensverwaltung-backup',
    version: 1,
    exported_at: new Date().toISOString(),
    company_id: companyId,
    tables,
  };
}

export interface ImportResult { table: string; ok: number; failed: number; error?: string; }

export async function importBackup(file: BackupFile, onProgress?: ProgressFn): Promise<ImportResult[]> {
  if (file.format !== 'schadensverwaltung-backup') {
    throw new Error('Ungültige Sicherungsdatei (falsches Format).');
  }
  const results: ImportResult[] = [];
  const CHUNK = 500;

  for (const t of BACKUP_TABLES) {
    const rows = file.tables[t.name] ?? [];
    if (rows.length === 0) { results.push({ table: t.name, ok: 0, failed: 0 }); continue; }
    let ok = 0, failed = 0, firstErr: string | undefined;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      onProgress?.(`Importiere ${t.name} (${i + slice.length}/${rows.length}) …`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from(t.name).upsert(slice, { onConflict: t.conflict });
      if (error) { failed += slice.length; firstErr = firstErr ?? error.message; }
      else ok += slice.length;
    }
    results.push({ table: t.name, ok, failed, error: firstErr });
  }
  return results;
}

// =============================================================================
//  Datei-Sicherung (Storage: Fotos & Dokumente) als separates ZIP
// =============================================================================

/** Welche Tabelle/Spalte auf welchen Storage-Bucket verweist. */
const STORAGE_SOURCES = [
  { bucket: 'damage-photos',    table: 'damage_photos',            col: 'storage_path' },
  { bucket: 'object-documents', table: 'network_object_documents', col: 'storage_path' },
];

function guessMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'heic': return 'image/heic';
    case 'pdf': return 'application/pdf';
    default: return 'application/octet-stream';
  }
}

/** Sammelt alle Storage-Pfade aus den DB-Verweisen (RLS-gescopt). */
async function collectStoragePaths(): Promise<{ bucket: string; path: string }[]> {
  const out: { bucket: string; path: string }[] = [];
  for (const s of STORAGE_SOURCES) {
    let rows: Array<Record<string, unknown>> = [];
    try { rows = await fetchAll(s.table); } catch { rows = []; }
    for (const r of rows) {
      const p = r[s.col];
      if (typeof p === 'string' && p) out.push({ bucket: s.bucket, path: p });
    }
  }
  return out;
}

/** Lädt alle referenzierten Dateien herunter und packt sie in ein ZIP (Pfad = bucket/path). */
export async function exportStorageZip(onProgress?: ProgressFn): Promise<{ blob: Blob; count: number; missing: number }> {
  const items = await collectStoragePaths();
  const files: Record<string, Uint8Array> = {};
  let missing = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    onProgress?.(`Lade Datei ${i + 1}/${items.length} …`);
    const { data, error } = await supabase.storage.from(it.bucket).download(it.path);
    if (error || !data) { missing++; continue; }
    files[`${it.bucket}/${it.path}`] = new Uint8Array(await data.arrayBuffer());
  }
  // level 0 = "store": Bilder/PDF sind bereits komprimiert → kein CPU verschwenden
  const zipped: Uint8Array = await new Promise((resolve, reject) =>
    zip(files, { level: 0 }, (err, d) => (err ? reject(err) : resolve(d))));
  return { blob: new Blob([zipped as unknown as BlobPart], { type: 'application/zip' }), count: Object.keys(files).length, missing };
}

export interface StorageImportResult { ok: number; failed: number; }

/** Spielt ein zuvor erstelltes Datei-ZIP zurück in die Storage-Buckets. */
export async function importStorageZip(zipBlob: Blob, onProgress?: ProgressFn): Promise<StorageImportResult> {
  const buf = new Uint8Array(await zipBlob.arrayBuffer());
  const entries: Unzipped = await new Promise((resolve, reject) =>
    unzip(buf, (err, d) => (err ? reject(err) : resolve(d))));
  const names = Object.keys(entries).filter((n) => !n.endsWith('/') && n.includes('/'));
  let ok = 0, failed = 0;
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    onProgress?.(`Stelle Datei ${i + 1}/${names.length} her …`);
    const slash = name.indexOf('/');
    const bucket = name.slice(0, slash);
    const path = name.slice(slash + 1);
    const body = new Blob([entries[name] as unknown as BlobPart], { type: guessMime(path) });
    const { error } = await supabase.storage.from(bucket).upload(path, body, { upsert: true, contentType: guessMime(path) });
    if (error) failed++; else ok++;
  }
  return { ok, failed };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadBackup(file: BackupFile) {
  const blob = new Blob([JSON.stringify(file, null, 0)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `schadensverwaltung-backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
