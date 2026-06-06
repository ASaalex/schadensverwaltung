import type { RasterSourceSpecification } from 'maplibre-gl';
import type { MapLayer } from '@/types/database';

export interface BaseMapDef {
  id: string;
  name: string;
  source: RasterSourceSpecification;
}

/** Wandelt die konfigurierten map_layers in MapLibre-Raster-Quellen um. */
export function buildBasemaps(layers?: MapLayer[]): BaseMapDef[] {
  const out: BaseMapDef[] = [{
    id: 'osm',
    name: 'OpenStreetMap',
    source: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap',
    },
  }];

  for (const l of layers ?? []) {
    if (!l.enabled) continue;

    if (l.type === 'wms') {
      const [base, query = ''] = l.url_template.split('?');
      const p = Object.fromEntries(new URLSearchParams(query));
      const params = new URLSearchParams({
        service: 'WMS', request: 'GetMap', version: '1.1.1',
        layers: p.layers ?? '', styles: '',
        format: p.format ?? 'image/png',
        transparent: (p.transparent ?? 'false'),
        width: '256', height: '256', srs: 'EPSG:3857',
      });
      // {bbox-epsg-3857} bewusst NACH toString() anhängen (Token bleibt unkodiert)
      const url = `${base}?${params.toString()}&bbox={bbox-epsg-3857}`;
      out.push({
        id: l.id, name: l.name,
        source: { type: 'raster', tiles: [url], tileSize: 256, attribution: l.attribution ?? '' },
      });
    } else {
      // xyz / wmts: url_template enthält bereits {z}/{x}/{y}
      out.push({
        id: l.id, name: l.name,
        source: { type: 'raster', tiles: [l.url_template], tileSize: 256, attribution: l.attribution ?? '' },
      });
    }
  }
  return out;
}
