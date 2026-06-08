import maplibregl from 'maplibre-gl';
import { supabase } from '@/lib/supabase';

let registered = false;

async function fetchTileB64(z: number, x: number, y: number): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < 4; i++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('objects_mvt', { z, x, y });
      if (error) throw new Error(error.message);
      return (data as string) ?? '';
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

/** Registriert das 'objtiles://'-Protokoll für MapLibre — Tiles via supabase.rpc (RLS-konform). */
export function registerObjectTileProtocol() {
  if (registered) return;
  registered = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (maplibregl as any).addProtocol('objtiles', async (params: { url: string }) => {
    const [z, x, y] = params.url.replace('objtiles://', '').split('/').map(Number);
    const b64 = await fetchTileB64(z, x, y);
    if (!b64) return { data: new Uint8Array(0) };
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { data: bytes };
  });
}

/** MapLibre-Style-Layer für die Objekt-Vektor-Tiles (ohne Basiskarte) — als Overlay nutzbar. */
export function objectOverlayStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      objects: { type: 'vector', tiles: ['objtiles://{z}/{x}/{y}'], minzoom: 0, maxzoom: 22 },
    },
    layers: [
      { id: 'obj-fill', type: 'fill', source: 'objects', 'source-layer': 'objects',
        filter: ['==', ['get', 'gtype'], 'polygon'],
        paint: { 'fill-color': ['coalesce', ['get', 'color'], '#6366f1'], 'fill-opacity': 0.3 } },
      { id: 'obj-fill-line', type: 'line', source: 'objects', 'source-layer': 'objects',
        filter: ['==', ['get', 'gtype'], 'polygon'],
        paint: { 'line-color': ['coalesce', ['get', 'color'], '#6366f1'], 'line-width': 1.5 } },
      { id: 'obj-line', type: 'line', source: 'objects', 'source-layer': 'objects',
        filter: ['==', ['get', 'gtype'], 'line'],
        paint: { 'line-color': ['coalesce', ['get', 'color'], '#6366f1'], 'line-width': 3 } },
      { id: 'obj-point', type: 'circle', source: 'objects', 'source-layer': 'objects',
        filter: ['==', ['get', 'gtype'], 'point'],
        paint: {
          'circle-color': ['coalesce', ['get', 'color'], '#6366f1'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 6, 20, 9],
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5,
        } },
    ],
  };
}
