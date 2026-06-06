/**
 * Einfache interaktive Karte nur für Positions-Erfassung.
 * Robust gegen Flexbox-Höhenprobleme via invalidateSize().
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
  onMapClick?: (lat: number, lng: number) => void;
}

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/** Zentriert die Karte neu + behebt Grau-Tile-Problem (invalidateSize) */
function MapController({
  center, markerLat, markerLng, onMarkerMove, onMapClick,
}: Omit<Props, 'zoom'>) {
  const map = useMap();

  // Höhe nach Mount korrigieren (Flexbox-Problem)
  useEffect(() => {
    const fix = () => map.invalidateSize();
    // Mehrfach, da Layout asynchron sein kann
    const t1 = setTimeout(fix, 100);
    const t2 = setTimeout(fix, 300);
    const t3 = setTimeout(fix, 600);
    window.addEventListener('resize', fix);
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      window.removeEventListener('resize', fix);
    };
  }, [map]);

  // Karte auf neues Zentrum setzen
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [map, center]);

  // Klick-Handler
  useEffect(() => {
    if (!onMapClick) return;
    const handler = (e: L.LeafletMouseEvent) => onMapClick(e.latlng.lat, e.latlng.lng);
    map.on('click', handler);
    return () => { map.off('click', handler); };
  }, [map, onMapClick]);

  // Marker
  useEffect(() => {
    if (markerLat == null || markerLng == null) return;
    const marker = L.marker([markerLat, markerLng], {
      draggable: !!onMarkerMove,
      icon: markerIcon,
    }).addTo(map);
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onMarkerMove?.(pos.lat, pos.lng);
    });
    return () => { marker.remove(); };
  }, [map, markerLat, markerLng, onMarkerMove]);

  return null;
}

export function PositionMap({ center, zoom = 18, markerLat, markerLng, onMarkerMove, onMapClick }: Props) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ width: '100%', height: '100%' }}
      zoomControl={true}
      scrollWheelZoom={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap'
        maxZoom={19}
      />
      <MapController
        center={center}
        markerLat={markerLat}
        markerLng={markerLng}
        onMarkerMove={onMarkerMove}
        onMapClick={onMapClick}
      />
    </MapContainer>
  );
}
