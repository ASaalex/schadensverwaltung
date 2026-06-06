/**
 * Karte für die Objekt-Übersicht & -Detail.
 * Zeigt Netz-Objekte (Punkt/Linie/Fläche), anwählbar, mit Layer-Switcher.
 */
import { useEffect } from 'react';
import { MapContainer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { MapLayerSwitcher } from './MapLayerSwitcher';
import { NetworkObjectLayer } from './NetworkObjectLayer';
import { useMapLayers } from '@/hooks/useMapLayers';
import { objectCenter, type NetworkObject } from '@/hooks/useNetworkObjects';

interface Props {
  objects: NetworkObject[];
  selectedId?: string | null;
  onObjectClick?: (id: string) => void;
  /** Auf dieses Objekt zoomen (Detail-Ansicht) */
  fitToId?: string | null;
  center?: [number, number];
  zoom?: number;
  /** Auto-Fit auf Objekte (Default true). Bei Viewport-Laden auf false setzen. */
  autoFit?: boolean;
  /** Meldet Kartenausschnitt + Zoom (für serverseitiges Viewport-Laden) */
  onViewChange?: (bounds: L.LatLngBounds, zoom: number) => void;
}

function ViewTracker({ onChange }: { onChange: (b: L.LatLngBounds, z: number) => void }) {
  const map = useMapEvents({
    moveend: () => onChange(map.getBounds(), map.getZoom()),
    zoomend: () => onChange(map.getBounds(), map.getZoom()),
  });
  useEffect(() => {
    const t = setTimeout(() => onChange(map.getBounds(), map.getZoom()), 200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function InvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    const t1 = setTimeout(fix, 100);
    const t2 = setTimeout(fix, 400);
    window.addEventListener('resize', fix);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener('resize', fix); };
  }, [map]);
  return null;
}

function FitBounds({ objects, fitToId }: { objects: NetworkObject[]; fitToId?: string | null }) {
  const map = useMap();
  useEffect(() => {
    const targets = fitToId ? objects.filter((o) => o.id === fitToId) : objects;
    if (targets.length === 0) return;

    const pts: [number, number][] = [];
    for (const o of targets) {
      const g = o.geometry;
      if (g.type === 'Point') {
        const [lng, lat] = g.coordinates as number[];
        pts.push([lat, lng]);
      } else if (g.type === 'LineString') {
        for (const [lng, lat] of g.coordinates as number[][]) pts.push([lat, lng]);
      } else if (g.type === 'Polygon') {
        for (const [lng, lat] of (g.coordinates as number[][][])[0]) pts.push([lat, lng]);
      }
    }
    if (pts.length === 1) {
      map.setView(pts[0], fitToId ? 18 : map.getZoom());
    } else if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 18 });
    }
  // Nur bei Wechsel der Objektmenge/Ziel neu fitten
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToId, objects.length]);
  return null;
}

export function ObjectsMap({
  objects, selectedId, onObjectClick, fitToId, center, zoom = 14,
  autoFit = true, onViewChange,
}: Props) {
  const { data: layers } = useMapLayers();

  const initialCenter: [number, number] = center
    ?? (objects.length > 0 ? objectCenterLatLng(objects[0]) : [50.9787, 11.0328]);

  return (
    <MapContainer center={initialCenter} zoom={zoom} maxZoom={22} className="h-full w-full">
      <InvalidateOnMount />
      {autoFit && <FitBounds objects={objects} fitToId={fitToId} />}
      {onViewChange && <ViewTracker onChange={onViewChange} />}
      <MapLayerSwitcher layers={layers} maxZoom={22} />
      <NetworkObjectLayer objects={objects} selectedId={selectedId} onObjectClick={onObjectClick} />
    </MapContainer>
  );
}

function objectCenterLatLng(o: NetworkObject): [number, number] {
  const [lng, lat] = objectCenter(o);
  return [lat, lng];
}
