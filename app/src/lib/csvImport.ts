/**
 * Minimaler CSV-Parser mit Quotes-Unterstützung (RFC 4180-Untermenge).
 * Trennzeichen automatisch erkannt (Semikolon oder Komma).
 */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  // BOM entfernen
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/);
  if (lines.length === 0 || !lines[0].trim()) return { headers: [], rows: [] };

  // Trennzeichen erkennen
  const firstLine = lines[0];
  const semi = (firstLine.match(/;/g) ?? []).length;
  const comma = (firstLine.match(/,/g) ?? []).length;
  const sep = semi >= comma ? ';' : ',';

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuote) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') {
          inQuote = false;
        } else {
          cur += c;
        }
      } else {
        if (c === '"') inQuote = true;
        else if (c === sep) {
          out.push(cur);
          cur = '';
        } else {
          cur += c;
        }
      }
    }
    out.push(cur);
    return out;
  };

  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    rows.push(parseLine(line));
  }
  return { headers, rows };
}

/** Logische Spalten, in die der Nutzer mappt */
export const TARGET_FIELDS = [
  { key: 'category', label: 'Kategorie (Name oder Code)', required: true },
  { key: 'gps_lat', label: 'GPS-Breite (Lat)', required: false },
  { key: 'gps_lng', label: 'GPS-Länge (Lng)', required: false },
  { key: 'priority', label: 'Priorität (niedrig/normal/hoch/dringend)', required: false },
  { key: 'description', label: 'Bemerkung', required: false },
  { key: 'address_street', label: 'Straße', required: false },
  { key: 'address_house_number', label: 'Hausnummer', required: false },
  { key: 'address_postal_code', label: 'PLZ', required: false },
  { key: 'address_city', label: 'Ort', required: false },
] as const;

export type TargetKey = (typeof TARGET_FIELDS)[number]['key'];

export interface CsvMapping {
  [target: string]: number | null; // index der CSV-Spalte (oder null = nicht mappen)
}

export interface CsvRowResult {
  row: string[];
  ok: boolean;
  error?: string;
  /** geparste Felder */
  parsed?: {
    category_id: string;
    priority: string;
    gps_lat: number | null;
    gps_lng: number | null;
    description: string | null;
    address_street: string | null;
    address_house_number: string | null;
    address_postal_code: string | null;
    address_city: string | null;
  };
}

export interface CategoryLookup {
  id: string;
  name: string;
  code: string | null;
}

const VALID_PRIORITY = ['niedrig', 'normal', 'hoch', 'dringend'];

export function validateCsv(
  _headers: string[],
  rows: string[][],
  mapping: CsvMapping,
  categories: CategoryLookup[],
): CsvRowResult[] {
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const catByCode = new Map(
    categories.filter((c) => c.code).map((c) => [c.code!.toLowerCase(), c]),
  );

  return rows.map((row) => {
    const get = (target: TargetKey): string | null => {
      const idx = mapping[target];
      if (idx == null || idx < 0) return null;
      const v = row[idx];
      return v == null ? null : v.trim();
    };

    const catRaw = get('category');
    if (!catRaw) return { row, ok: false, error: 'Kategorie fehlt' };
    const cat = catByCode.get(catRaw.toLowerCase()) ?? catByName.get(catRaw.toLowerCase());
    if (!cat) return { row, ok: false, error: `Unbekannte Kategorie: "${catRaw}"` };

    const parseNum = (raw: string | null): number | null => {
      if (!raw) return null;
      const n = Number(raw.replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    };
    const gps_lat = parseNum(get('gps_lat'));
    const gps_lng = parseNum(get('gps_lng'));
    if ((gps_lat == null) !== (gps_lng == null)) {
      return { row, ok: false, error: 'GPS-Lat und Lng nur paarweise erlaubt' };
    }

    let priority = (get('priority') ?? 'normal').toLowerCase();
    if (!VALID_PRIORITY.includes(priority)) {
      // Toleranz: deutsch klein normalisieren
      priority = 'normal';
    }

    return {
      row,
      ok: true,
      parsed: {
        category_id: cat.id,
        priority,
        gps_lat,
        gps_lng,
        description: get('description'),
        address_street: get('address_street'),
        address_house_number: get('address_house_number'),
        address_postal_code: get('address_postal_code'),
        address_city: get('address_city'),
      },
    };
  });
}

/** Versucht ein Auto-Mapping anhand der Header-Namen */
export function autoMapping(headers: string[]): CsvMapping {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const find = (...needles: string[]): number | null => {
    for (const n of needles) {
      const i = lower.indexOf(n);
      if (i >= 0) return i;
    }
    for (const n of needles) {
      const i = lower.findIndex((h) => h.includes(n));
      if (i >= 0) return i;
    }
    return null;
  };
  return {
    category: find('kategorie', 'category'),
    gps_lat: find('lat', 'latitude', 'breite'),
    gps_lng: find('lng', 'lon', 'longitude', 'länge', 'laenge'),
    priority: find('priorität', 'prioritaet', 'priority', 'prio'),
    description: find('bemerkung', 'description', 'notiz', 'kommentar'),
    address_street: find('straße', 'strasse', 'street'),
    address_house_number: find('hausnummer', 'hnr', 'house_number'),
    address_postal_code: find('plz', 'postcode', 'postal_code'),
    address_city: find('ort', 'stadt', 'city'),
  };
}
