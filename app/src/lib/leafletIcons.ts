// Einmal-Setup für Leaflet-Default-Marker-Icons unter Vite.
//
// Leaflet versucht die Marker-Bilder via relativem Pfad zu laden,
// was im Vite-Bundle nicht funktioniert. Wir importieren die Bilder
// als Assets (Vite gibt URLs zurück) und überschreiben den internen
// `_getIconUrl`-Override durch ein `delete`, damit die mergeOptions
// tatsächlich greifen.
//
// Dieses Modul wird in main.tsx einmal importiert und hat einen
// Side-Effect — keine Exporte nötig.

import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

// Der entscheidende Schritt: den prototypischen Override entfernen
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;

L.Icon.Default.mergeOptions({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
});
