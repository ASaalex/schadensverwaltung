/**
 * Leaflet-natives Objekt-Overlay: lädt nur die Objekte im sichtbaren
 * Kartenausschnitt (BBox, gedeckelt) und zeichnet sie direkt — zuverlässig,
 * performant auch bei sehr vielen Objekten. Ersatz für das MapLibre-Overlay
 * auf den Leaflet-Karten.
 */
import { useEffect, useState } from 'react';
import { useMapEvents } from 'react-leaflet';
import { NetworkObjectLayer } from './NetworkObjectLayer';
import { useObjectsInBounds, type Bounds } from '@/hooks/useObjectsInBounds';

interface Props {
  /** Ab diesem Zoom werden Objekte geladen (Default 12) */
  minZoom?: number;
  onObjectClick?: (id: string) => void;
}

export function NetworkObjectViewportLayer({ minZoom = 12, onObjectClick }: Props) {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [zoom, setZoom] = useState(13);

  const map = useMapEvents({
    moveend: () => updateView(),
    zoomend: () => updateView(),
  });
  function updateView() {
    const b = map.getBounds();
    setBounds({ minLng: b.getWest(), minLat: b.getSouth(), maxLng: b.getEast(), maxLat: b.getNorth() });
    setZoom(map.getZoom());
  }
  // initial einmalig
  useEffect(() => {
    const t = setTimeout(updateView, 100);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enabled = zoom >= minZoom && !!bounds;
  const { data: objects = [] } = useObjectsInBounds(bounds, enabled);

  if (!enabled) return null;
  return <NetworkObjectLayer objects={objects} onObjectClick={onObjectClick} />;
}
