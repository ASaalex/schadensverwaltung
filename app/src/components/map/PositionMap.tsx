/**
 * Einfache interaktive Karte nur für Positions-Erfassung
 */
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';

interface Props {
  center: [number, number];
  zoom?: number;
  markerLat?: number;
  markerLng?: number;
  onMarkerMove?: (lat: number, lng: number) => void;
}

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [map, center]);
  return null;
}

function DragMarker({ markerLat, markerLng, onMarkerMove }: Omit<Props, 'center'>) {
  const map = useMap();

  useEffect(() => {
    if (markerLat == null || markerLng == null) return;

    const marker = L.marker([markerLat, markerLng], {
      draggable: true,
      icon: markerIcon,
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onMarkerMove?.(pos.lat, pos.lng);
    });

    return () => {
      marker.remove();
    };
  }, [map, markerLat, markerLng, onMarkerMove]);

  return null;
}

export function PositionMap({ center, zoom = 18, markerLat, markerLng, onMarkerMove }: Props) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ width: '100%', height: '100%' }}
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />
      <MapUpdater center={center} />
      {markerLat != null && markerLng != null && (
        <DragMarker markerLat={markerLat} markerLng={markerLng} onMarkerMove={onMarkerMove} />
      )}
    </MapContainer>
  );
}
