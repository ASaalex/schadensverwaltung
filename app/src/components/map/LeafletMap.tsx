import { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, Polygon, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { MapLayerSwitcher } from './MapLayerSwitcher';
import { MapOptionsControl, type OverlayToggle } from './MapOptionsControl';
import { NetworkLayer } from './NetworkLayer';
import { NetworkAreaLayer } from './NetworkAreaLayer';
import { NetworkObjectViewportLayer } from './NetworkObjectViewportLayer';
import { useMapLayers } from '@/hooks/useMapLayers';
import { useNetworkSegments } from '@/hooks/useNetworkSegments';
// Default-Marker-Icons werden zentral in src/lib/leafletIcons.ts gesetzt

interface Props {
  center: [number, number];
  zoom?: number;
  markerPosition?: [number, number] | null;
  draggableMarker?: boolean;
  onMarkerDrag?: (lat: number, lng: number) => void;
  onMapClick?: (lat: number, lng: number) => void;
  /** GeoJSON-Geometrie zum Anzeigen */
  polygon?: number[][] | null; // [[lng,lat], [lng,lat], ...]
  line?: number[][] | null;
  className?: string;
  zoomable?: boolean;
  /** Layer-Switcher (Luftbild etc.) zeigen — default true */
  showLayerSwitcher?: boolean;
  /** Welche Overlays angeboten/angezeigt werden (Rollen-Filter).
   *  Firmen sehen nur den Auftrag → { network:false, objects:false }. */
  allowOverlays?: { network?: boolean; objects?: boolean };
}

function CenterUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [map, center]);
  return null;
}

function ClickHandler({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (onClick) onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function LeafletMap({
  center,
  zoom = 16,
  markerPosition,
  draggableMarker = false,
  onMarkerDrag,
  onMapClick,
  polygon,
  line,
  className,
  zoomable = true,
  showLayerSwitcher = true,
  allowOverlays,
}: Props) {
  const markerRef = useRef<L.Marker>(null);
  const { data: layers } = useMapLayers();
  const { data: segments = [] } = useNetworkSegments();
  const allow = { network: true, objects: true, ...allowOverlays };
  const [showNetwork, setShowNetwork] = useState(true);
  const [showObjects, setShowObjects] = useState(true);
  const [baseId, setBaseId] = useState<string | null>(layers?.find((l) => l.is_default)?.id ?? null);

  const overlays: OverlayToggle[] = [
    allow.network && { key: 'net', label: 'Netz', checked: showNetwork, onChange: setShowNetwork, color: '#0ea5e9' },
    allow.objects && { key: 'obj', label: 'Objekte', checked: showObjects, onChange: setShowObjects, color: '#6366f1' },
  ].filter(Boolean) as OverlayToggle[];

  // GeoJSON-Koordinaten sind [lng, lat], Leaflet erwartet [lat, lng]
  const polygonLatLng = polygon ? polygon.map(([lng, lat]) => [lat, lng] as [number, number]) : null;
  const lineLatLng = line ? line.map(([lng, lat]) => [lat, lng] as [number, number]) : null;

  const showOptions = showLayerSwitcher && zoomable;
  return (
    <div className="relative h-full w-full">
    <MapContainer
      center={center}
      zoom={zoom}
      maxZoom={22}
      scrollWheelZoom={zoomable}
      zoomControl={zoomable}
      doubleClickZoom={zoomable}
      dragging={zoomable}
      touchZoom={zoomable}
      className={className ?? 'h-full w-full'}
    >
      <CenterUpdater center={center} />
      <ClickHandler onClick={onMapClick} />
      <MapLayerSwitcher layers={layers} maxZoom={22} showSwitcher={false} activeId={baseId} onActiveChange={setBaseId} />
      {allow.network && showNetwork && <NetworkLayer segments={segments} />}
      {allow.network && showNetwork && <NetworkAreaLayer />}
      {allow.objects && showObjects && <NetworkObjectViewportLayer />}
      {markerPosition && (
        <Marker
          position={markerPosition}
          draggable={draggableMarker}
          ref={markerRef}
          eventHandlers={
            draggableMarker
              ? {
                  dragend: () => {
                    const m = markerRef.current;
                    if (m && onMarkerDrag) {
                      const { lat, lng } = m.getLatLng();
                      onMarkerDrag(lat, lng);
                    }
                  },
                }
              : {}
          }
        />
      )}
      {polygonLatLng && polygonLatLng.length > 2 && (
        <Polygon positions={polygonLatLng} pathOptions={{ color: '#ea580c', weight: 2, fillOpacity: 0.25 }} />
      )}
      {lineLatLng && lineLatLng.length > 1 && (
        <Polyline positions={lineLatLng} pathOptions={{ color: '#ea580c', weight: 3 }} />
      )}
    </MapContainer>
    {showOptions && (
      <MapOptionsControl layers={layers} activeLayerId={baseId} onLayerChange={setBaseId} overlays={overlays} />
    )}
    </div>
  );
}
