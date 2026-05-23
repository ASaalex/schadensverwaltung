import type { DamageListItem } from '@/hooks/useDamageList';

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes('"') || s.includes(';') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportCsv(items: DamageListItem[], filename = 'schaeden.csv') {
  const headers = [
    'Code',
    'Aufnahmedatum',
    'Kategorie',
    'Status',
    'Prioritaet',
    'Erfasst von',
    'Strasse',
    'Hausnummer',
    'PLZ',
    'Ort',
    'GPS Lat',
    'GPS Lng',
    'Genauigkeit (m)',
    'Bemerkung',
  ];
  const lines = [headers.map(csvEscape).join(';')];
  for (const d of items) {
    lines.push(
      [
        d.code,
        new Date(d.created_at).toLocaleString('de-DE'),
        d.category_name ?? '',
        d.status,
        d.priority,
        d.creator_name ?? '',
        d.address_street ?? '',
        d.address_house_number ?? '',
        d.address_postal_code ?? '',
        d.address_city ?? '',
        d.gps_lat ?? '',
        d.gps_lng ?? '',
        d.gps_accuracy_m ?? '',
        d.description ?? '',
      ]
        .map(csvEscape)
        .join(';'),
    );
  }
  // BOM für Excel-Kompatibilität (UTF-8 mit Umlauten)
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  downloadBlob(filename, blob);
}

export function exportGeoJson(items: DamageListItem[], filename = 'schaeden.geojson') {
  const features = items
    .filter((d) => d.gps_lat != null && d.gps_lng != null)
    .map((d) => {
      // Vorhandene komplexe Geometrie (Linie/Fläche) bevorzugt, sonst Punkt
      let geometry: object | null = null;
      if (d.geometry && typeof d.geometry === 'object') {
        geometry = d.geometry;
      } else if (d.gps_lat != null && d.gps_lng != null) {
        geometry = { type: 'Point', coordinates: [d.gps_lng, d.gps_lat] };
      }
      return {
        type: 'Feature' as const,
        geometry,
        properties: {
          code: d.code,
          status: d.status,
          priority: d.priority,
          category: d.category_name,
          aufnahmedatum: d.created_at,
          erfasser: d.creator_name,
          strasse: d.address_street,
          hausnummer: d.address_house_number,
          plz: d.address_postal_code,
          ort: d.address_city,
          bemerkung: d.description,
        },
      };
    });
  const fc = { type: 'FeatureCollection' as const, features };
  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
  downloadBlob(filename, blob);
}
