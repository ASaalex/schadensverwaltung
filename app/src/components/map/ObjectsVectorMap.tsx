/**
 * Vektor-Tile-Karte für Netz-Objekte (MapLibre GL + PostGIS ST_AsMVT).
 * Tiles kommen über supabase.rpc('objects_mvt', {z,x,y}) — kein Tile-Server,
 * RLS (Firma) greift automatisch. Skaliert auf sehr viele Objekte.
 */
import { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl, { Map as MlMap, type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Crosshair, Layers } from 'lucide-react';
import { useGpsWatch } from '@/hooks/useGeolocation';
import { useMapLayers } from '@/hooks/useMapLayers';
import { buildBasemaps } from './maplibreBasemaps';
import { registerObjectTileProtocol } from './objectTileProtocol';

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const DEFAULT_CENTER: [number, number] = [11.0328, 50.9787]; // [lng, lat]

interface Props {
  onObjectClick?: (id: string) => void;
  onViewChange?: (bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number }, zoom: number) => void;
  selectedId?: string | null;
  /** Live-GPS-Punkt anzeigen (Feld-Erfassung) */
  showGps?: boolean;
  center?: [number, number]; // [lng, lat]
  zoom?: number;
  /** Karte auf diese Bounds zoomen, wenn gesetzt (z. B. Suchtreffer) */
  fitBounds?: [[number, number], [number, number]] | null;
}

export function ObjectsVectorMap({
  onObjectClick, onViewChange, selectedId, showGps, center, zoom = 13, fitBounds,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const gpsCenteredRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const { position } = useGpsWatch(!!showGps);
  const { data: mapLayers } = useMapLayers();

  const basemaps = useMemo(() => buildBasemaps(mapLayers), [mapLayers]);
  const [activeBase, setActiveBase] = useState<string>('osm');
  const baseInitRef = useRef(false);
  // Default-Basemap aus Konfiguration übernehmen (einmalig)
  useEffect(() => {
    if (baseInitRef.current || !mapLayers) return;
    const def = mapLayers.find((l) => l.is_default && l.enabled);
    if (def) { setActiveBase(def.id); baseInitRef.current = true; }
  }, [mapLayers]);

  // Karte initialisieren
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    registerObjectTileProtocol();

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: center ?? DEFAULT_CENTER,
      zoom,
      maxZoom: 22,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

    map.on('load', () => {
      map.addSource('objects', {
        type: 'vector',
        tiles: ['objtiles://{z}/{x}/{y}'],
        minzoom: 0,
        maxzoom: 22,
      });
      // Flächen
      map.addLayer({
        id: 'obj-fill', type: 'fill', source: 'objects', 'source-layer': 'objects',
        filter: ['==', ['get', 'gtype'], 'polygon'],
        paint: { 'fill-color': ['coalesce', ['get', 'color'], '#6366f1'], 'fill-opacity': 0.3 },
      });
      map.addLayer({
        id: 'obj-fill-line', type: 'line', source: 'objects', 'source-layer': 'objects',
        filter: ['==', ['get', 'gtype'], 'polygon'],
        paint: { 'line-color': ['coalesce', ['get', 'color'], '#6366f1'], 'line-width': 1.5 },
      });
      // Linien
      map.addLayer({
        id: 'obj-line', type: 'line', source: 'objects', 'source-layer': 'objects',
        filter: ['==', ['get', 'gtype'], 'line'],
        paint: { 'line-color': ['coalesce', ['get', 'color'], '#6366f1'], 'line-width': 3 },
      });
      // Punkte
      map.addLayer({
        id: 'obj-point', type: 'circle', source: 'objects', 'source-layer': 'objects',
        filter: ['==', ['get', 'gtype'], 'point'],
        paint: {
          'circle-color': ['coalesce', ['get', 'color'], '#6366f1'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 6, 20, 9],
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5,
        },
      });
      // Hervorhebung des gewählten Objekts
      map.addLayer({
        id: 'obj-highlight', type: 'circle', source: 'objects', 'source-layer': 'objects',
        filter: ['==', ['get', 'id'], '___none___'],
        paint: { 'circle-color': '#2563eb', 'circle-radius': 10, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
      });

      // GPS-Quelle
      if (showGps) {
        map.addSource('gps', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'gps-dot', type: 'circle', source: 'gps',
          paint: { 'circle-color': '#2563eb', 'circle-radius': 7, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 },
        });
      }

      setMapReady(true);
      emitView();
    });

    // Klick auf Objekt
    const clickLayers = ['obj-point', 'obj-line', 'obj-fill'];
    map.on('click', (e) => {
      const feats = map.queryRenderedFeatures(e.point, { layers: clickLayers }) as MapGeoJSONFeature[];
      const id = feats[0]?.properties?.id as string | undefined;
      if (id && onObjectClick) onObjectClick(id);
    });
    for (const lyr of clickLayers) {
      map.on('mouseenter', lyr, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', lyr, () => { map.getCanvas().style.cursor = ''; });
    }

    function emitView() {
      if (!onViewChange) return;
      const b = map.getBounds();
      onViewChange(
        { minLng: b.getWest(), minLat: b.getSouth(), maxLng: b.getEast(), maxLat: b.getNorth() },
        map.getZoom(),
      );
    }
    map.on('moveend', emitView);

    return () => { map.remove(); mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Basemaps anlegen/umschalten (Raster-Layer unter die Objekt-Layer)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    for (const bm of basemaps) {
      if (bm.id === 'osm') continue; // OSM ist Teil des Initial-Styles
      const srcId = `base-src-${bm.id}`;
      const lyrId = `base-${bm.id}`;
      if (!map.getSource(srcId)) map.addSource(srcId, bm.source);
      if (!map.getLayer(lyrId)) {
        map.addLayer(
          { id: lyrId, type: 'raster', source: srcId, layout: { visibility: 'none' } },
          'obj-fill', // unter den Objekt-Layern einfügen
        );
      }
    }
    // Sichtbarkeit setzen: nur aktive Basemap an
    map.setLayoutProperty('osm', 'visibility', activeBase === 'osm' ? 'visible' : 'none');
    for (const bm of basemaps) {
      if (bm.id === 'osm') continue;
      const lyrId = `base-${bm.id}`;
      if (map.getLayer(lyrId)) {
        map.setLayoutProperty(lyrId, 'visibility', activeBase === bm.id ? 'visible' : 'none');
      }
    }
  }, [basemaps, activeBase, mapReady]);

  // Hervorhebung aktualisieren
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('obj-highlight')) return;
    map.setFilter('obj-highlight', ['==', ['get', 'id'], selectedId ?? '___none___']);
  }, [selectedId]);

  // GPS-Punkt + Auto-Center beim ersten Fix
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showGps || !position) return;
    const src = map.getSource('gps') as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [position.lng, position.lat] }, properties: {} }],
      });
    }
    if (!gpsCenteredRef.current) {
      gpsCenteredRef.current = true;
      map.easeTo({ center: [position.lng, position.lat], zoom: Math.max(map.getZoom(), 16) });
    }
  }, [position, showGps]);

  // Auf Bounds zoomen (z. B. Suchtreffer)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitBounds) return;
    map.fitBounds(fitBounds, { padding: 60, maxZoom: 18, duration: 600 });
  }, [fitBounds]);

  function recenter() {
    const map = mapRef.current;
    if (map && position) map.easeTo({ center: [position.lng, position.lat], zoom: Math.max(map.getZoom(), 16) });
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Basemap-Switcher (oben rechts) */}
      {basemaps.length > 1 && (
        <div className="absolute right-3 top-3 z-10 overflow-hidden rounded-lg bg-white shadow-lg">
          <div className="flex items-center gap-1 border-b bg-slate-50 px-2 py-1 text-xs text-slate-500">
            <Layers className="h-3 w-3" /> Karte
          </div>
          {basemaps.map((bm) => (
            <button key={bm.id} onClick={() => setActiveBase(bm.id)}
              className={`block w-full px-3 py-1.5 text-left text-xs ${activeBase === bm.id ? 'bg-blue-50 font-medium text-blue-700' : 'hover:bg-slate-50'}`}>
              {activeBase === bm.id ? '●' : '○'} {bm.name}
            </button>
          ))}
        </div>
      )}

      {/* GPS-Recenter (unten links, kollidiert nicht mit Switcher/Zoom) */}
      {showGps && (
        <button onClick={recenter}
          className="absolute bottom-3 left-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg active:scale-95"
          title="Auf meine Position zentrieren">
          <Crosshair className="h-5 w-5 text-blue-600" />
        </button>
      )}
    </div>
  );
}
