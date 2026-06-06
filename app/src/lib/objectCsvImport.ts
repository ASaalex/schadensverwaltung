/**
 * CSV-Import für Netz-Objekte.
 * - Punkt-Objekte: per GPS-Lat/Lng
 * - Linien/Flächen: per GeoJSON-Geometrie-Spalte
 * Nutzt den generischen parseCsv aus csvImport.
 */
export { parseCsv } from './csvImport';

export const OBJ_TARGET_FIELDS = [
  { key: 'object_type', label: 'Objekttyp (Name) *', required: true },
  { key: 'name',        label: 'Bezeichnung', required: false },
  { key: 'identifier',  label: 'Kennung / Nummer', required: false },
  { key: 'gps_lat',     label: 'GPS-Breite (Lat) — für Punkt', required: false },
  { key: 'gps_lng',     label: 'GPS-Länge (Lng) — für Punkt', required: false },
  { key: 'geometry',    label: 'Geometrie (GeoJSON) — für Linie/Fläche', required: false },
] as const;

export type ObjTargetKey = (typeof OBJ_TARGET_FIELDS)[number]['key'];

export interface ObjCsvMapping { [target: string]: number | null; }

export interface ObjTypeLookup {
  id: string;
  name: string;
  geometry_type: 'point' | 'line' | 'polygon';
}

export interface ObjGeometry {
  type: 'Point' | 'LineString' | 'Polygon';
  coordinates: number[] | number[][] | number[][][];
}

export interface ObjCsvRowResult {
  row: string[];
  ok: boolean;
  error?: string;
  parsed?: {
    object_type_id: string;
    name: string | null;
    identifier: string | null;
    geometry: ObjGeometry;
  };
}

const GEOJSON_TYPE: Record<string, ObjGeometry['type']> = {
  point: 'Point', line: 'LineString', polygon: 'Polygon',
};

export function validateObjectCsv(
  rows: string[][],
  mapping: ObjCsvMapping,
  types: ObjTypeLookup[],
): ObjCsvRowResult[] {
  const byName = new Map(types.map((t) => [t.name.toLowerCase(), t]));

  return rows.map((row) => {
    const get = (target: ObjTargetKey): string | null => {
      const idx = mapping[target];
      if (idx == null || idx < 0) return null;
      const v = row[idx];
      return v == null ? null : v.trim();
    };

    const typeRaw = get('object_type');
    if (!typeRaw) return { row, ok: false, error: 'Objekttyp fehlt' };
    const type = byName.get(typeRaw.toLowerCase());
    if (!type) return { row, ok: false, error: `Unbekannter Objekttyp: "${typeRaw}"` };

    const name = get('name');
    const identifier = get('identifier');
    const geomRaw = get('geometry');

    let geometry: ObjGeometry | null = null;

    // 1) Explizite GeoJSON-Geometrie hat Vorrang
    if (geomRaw) {
      try {
        const parsed = JSON.parse(geomRaw);
        const g = parsed.geometry ?? parsed; // Feature oder Geometry
        if (!g || typeof g.type !== 'string' || !Array.isArray(g.coordinates)) {
          return { row, ok: false, error: 'Ungültige GeoJSON-Geometrie' };
        }
        geometry = { type: g.type, coordinates: g.coordinates };
      } catch {
        return { row, ok: false, error: 'Geometrie ist kein gültiges JSON' };
      }
    } else {
      // 2) Punkt aus Lat/Lng
      const parseNum = (raw: string | null): number | null => {
        if (!raw) return null;
        const n = Number(raw.replace(',', '.'));
        return Number.isFinite(n) ? n : null;
      };
      const lat = parseNum(get('gps_lat'));
      const lng = parseNum(get('gps_lng'));
      if (type.geometry_type === 'point') {
        if (lat == null || lng == null) {
          return { row, ok: false, error: 'Punkt-Objekt braucht GPS-Lat und Lng' };
        }
        geometry = { type: 'Point', coordinates: [lng, lat] };
      } else {
        return {
          row, ok: false,
          error: `${type.geometry_type === 'line' ? 'Linie' : 'Fläche'} braucht eine GeoJSON-Geometrie-Spalte`,
        };
      }
    }

    // Geometrietyp grob gegen Objekttyp prüfen
    const expected = GEOJSON_TYPE[type.geometry_type];
    if (geometry.type !== expected) {
      return { row, ok: false, error: `Geometrietyp ${geometry.type} passt nicht zu Objekttyp ${type.name} (erwartet ${expected})` };
    }

    return { row, ok: true, parsed: { object_type_id: type.id, name, identifier, geometry } };
  });
}

export function autoObjectMapping(headers: string[]): ObjCsvMapping {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const find = (...needles: string[]): number | null => {
    for (const n of needles) { const i = lower.indexOf(n); if (i >= 0) return i; }
    for (const n of needles) { const i = lower.findIndex((h) => h.includes(n)); if (i >= 0) return i; }
    return null;
  };
  return {
    object_type: find('objekttyp', 'typ', 'object_type', 'type'),
    name:        find('bezeichnung', 'name'),
    identifier:  find('kennung', 'nummer', 'identifier', 'id', 'nr'),
    gps_lat:     find('lat', 'latitude', 'breite'),
    gps_lng:     find('lng', 'lon', 'longitude', 'länge', 'laenge'),
    geometry:    find('geometry', 'geometrie', 'geojson'),
  };
}
