import { supabase } from './supabase';

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

export function downloadBackup(file: BackupFile) {
  const blob = new Blob([JSON.stringify(file, null, 0)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `schadensverwaltung-backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
