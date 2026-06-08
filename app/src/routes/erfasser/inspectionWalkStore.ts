import { create } from 'zustand';
import { Geolocation } from '@capacitor/geolocation';
import { haversineDistance } from '@/lib/geoMeasure';

interface InspectionWalkState {
  active: boolean;          // Aufzeichnung läuft (auch im Hintergrund während Schadenserfassung)
  track: number[][];        // [lng, lat][]
  current: [number, number] | null; // aktuelle Position [lat, lng]
  watchId: string | null;
  lastPoint: number[] | null;
  start: () => Promise<void>;
  stop: () => void;         // beendet die GPS-Aufzeichnung, Track bleibt erhalten
  reset: () => void;        // alles zurücksetzen
}

export const useInspectionWalk = create<InspectionWalkState>((set, get) => ({
  active: false,
  track: [],
  current: null,
  watchId: null,
  lastPoint: null,

  start: async () => {
    if (get().watchId) return; // läuft schon
    set({ active: true, track: [], lastPoint: null });
    const id = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
      (pos, err) => {
        if (err || !pos) return;
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;
        set({ current: [lat, lng] });
        const last = get().lastPoint;
        if (!last || haversineDistance(last as [number, number], [lng, lat]) >= 5) {
          set((s) => ({ track: [...s.track, [lng, lat]], lastPoint: [lng, lat] }));
        }
      },
    );
    set({ watchId: id });
  },

  stop: () => {
    const id = get().watchId;
    if (id) Geolocation.clearWatch({ id }).catch(() => {});
    set({ active: false, watchId: null });
  },

  reset: () => {
    const id = get().watchId;
    if (id) Geolocation.clearWatch({ id }).catch(() => {});
    set({ active: false, watchId: null, track: [], lastPoint: null, current: null });
  },
}));
