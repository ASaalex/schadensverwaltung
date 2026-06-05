import { useEffect, useRef } from 'react';
import { MapContainer, Marker, Polygon, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { MapLayerSwitcher } from './MapLayerSwitcher';
import { NetworkLayer } from './NetworkLayer';
import { NetworkAreaLayer } from './NetworkAreaLayer';
import { NetworkObjectLayer } from './NetworkObjectLayer';
import { useNetworkObjects } from '@/hooks/useNetworkObjects';
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
}: Props) {
  const markerRef = useRef<L.Marker>(null);
  const { data: layers } = useMapLayers();
  const { data: segments = [] } = useNetworkSegments();
  const { query: objQuery } = useNetworkObjects();
  const networkObjects = objQuery.data ?? [];

  // GeoJSON-Koordinaten sind [lng, lat], Leaflet erwartet [lat, lng]
  const polygonLatLng = polygon ? polygon.map(([lng, lat]) => [lat, lng] as [number, number]) : null;
  const lineLatLng = line ? line.map(([lng, lat]) => [lat, lng] as [number, number]) : null;

  return (
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
      <MapLayerSwitcher layers={layers} maxZoom={22} showSwitcher={showLayerSwitcher && zoomable} />
      <NetworkLayer segments={segments} />
      <NetworkAreaLayer />
      <NetworkObjectLayer objects={networkObjects} />
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
  );
}
