/**
 * Objekt-Vektor-Tiles als Overlay auf einer Leaflet-Karte (react-leaflet).
 * Bindet eine MapLibre-GL-Instanz via @maplibre/maplibre-gl-leaflet ein und
 * rendert nur die Objekt-Layer (transparente Basiskarte) — skaliert auf sehr
 * viele Objekte statt der bisherigen 2000er-Begrenzung.
 */
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import '@maplibre/maplibre-gl-leaflet';
import { registerObjectTileProtocol, objectOverlayStyle } from './objectTileProtocol';

interface Props {
  onObjectClick?: (id: string) => void;
}

export function NetworkObjectVectorOverlay({ onObjectClick }: Props) {
  const map = useMap();

  useEffect(() => {
    registerObjectTileProtocol();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const glLayer = (L as any).maplibreGL({
      style: objectOverlayStyle(),
      interactive: !!onObjectClick,
      attributionControl: false,
    });
    glLayer.addTo(map);

    // Klick-Weiterleitung: nächstes Objekt-Feature unter dem Klickpunkt
    let detach: (() => void) | undefined;
    const wire = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ml = glLayer.getMaplibreMap?.() as any;
      if (!ml || !onObjectClick) return;
      const handler = (e: { point: { x: number; y: number } }) => {
        const feats = ml.queryRenderedFeatures(e.point, { layers: ['obj-point', 'obj-line', 'obj-fill'] });
        const id = feats?.[0]?.properties?.id as string | undefined;
        if (id) onObjectClick(id);
      };
      ml.on('click', handler);
      detach = () => ml.off('click', handler);
    };
    // getMaplibreMap ist erst nach 'add' verfügbar
    setTimeout(wire, 300);

    // maplibre-gl-leaflet rendert beim Pan teils nicht neu → Repaint/Resize erzwingen,
    // damit Objekte zuverlässig (nicht erst beim Zoomen) erscheinen.
    const repaint = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ml = glLayer.getMaplibreMap?.() as any;
      if (ml) { try { ml.resize(); ml.triggerRepaint(); } catch { /* ignore */ } }
    };
    map.on('moveend', repaint);
    map.on('zoomend', repaint);
    const t = setTimeout(repaint, 500);

    return () => {
      if (detach) detach();
      clearTimeout(t);
      map.off('moveend', repaint);
      map.off('zoomend', repaint);
      map.removeLayer(glLayer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}
