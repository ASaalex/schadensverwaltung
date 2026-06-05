import { create } from 'zustand';
import type { GeometryType, Priority, PropertyFieldDef } from '@/types/database';
import type { Position } from '@/hooks/useGeolocation';
import type { ResolvedAddress } from '@/hooks/useReverseGeocode';

export interface WizardPhoto {
  file: File;
  preview: string; // object URL
}

export interface WizardCategory {
  id: string;
  name: string;
  path: string[]; // ['Straße', 'Belag', 'Schlagloch']
  /** Alle in der Kategorie erlaubten Geometrie-Typen */
  geometry_types: GeometryType[];
  /** Der vom Erfasser gewählte (bei einem Typ automatisch, sonst Choice-Step) */
  geometry_type: GeometryType;
  property_schema: PropertyFieldDef[];
  default_priority: Priority | null;
}

interface WizardState {
  position: Position | null;
  address: ResolvedAddress | null;
  addressOverride: Partial<ResolvedAddress> | null;
  category: WizardCategory | null;
  networkObjectId: string | null;   // optional: zugeordnetes Netz-Objekt
  geometry: { type: 'LineString' | 'Polygon'; coordinates: number[][] | number[][][] } | null;
  propertyValues: Record<string, unknown>;
  priority: Priority;
  description: string;
  photos: WizardPhoto[];

  setPosition: (p: Position) => void;
  setAddress: (a: ResolvedAddress | null) => void;
  setAddressOverride: (a: Partial<ResolvedAddress> | null) => void;
  setCategory: (c: WizardCategory) => void;
  setNetworkObjectId: (id: string | null) => void;
  setGeometry: (g: WizardState['geometry']) => void;
  setPropertyValue: (name: string, value: unknown) => void;
  setPriority: (p: Priority) => void;
  setDescription: (d: string) => void;
  addPhoto: (p: WizardPhoto) => void;
  removePhoto: (idx: number) => void;
  reset: () => void;
}

const initial = {
  position: null,
  address: null,
  addressOverride: null,
  category: null,
  networkObjectId: null,
  geometry: null,
  propertyValues: {},
  priority: 'normal' as Priority,
  description: '',
  photos: [],
};

export const useWizardStore = create<WizardState>((set) => ({
  ...initial,
  setPosition: (p) => set({ position: p }),
  setAddress: (a) => set({ address: a }),
  setAddressOverride: (a) => set({ addressOverride: a }),
  setCategory: (c) =>
    set((s) => ({
      category: c,
      priority: c.default_priority ?? s.priority,
      // Wenn Kategorie kein Geometrie braucht → Geometrie zurücksetzen
      geometry: c.geometry_type === 'point' ? null : s.geometry,
      // Property-Schema-Werte zurücksetzen (anderes Schema möglich)
      propertyValues: {},
    })),
  setNetworkObjectId: (id) => set({ networkObjectId: id }),
  setGeometry: (g) => set({ geometry: g }),
  setPropertyValue: (name, value) =>
    set((s) => ({ propertyValues: { ...s.propertyValues, [name]: value } })),
  setPriority: (p) => set({ priority: p }),
  setDescription: (d) => set({ description: d }),
  addPhoto: (p) => set((s) => ({ photos: [...s.photos, p] })),
  removePhoto: (idx) =>
    set((s) => {
      const photo = s.photos[idx];
      if (photo) URL.revokeObjectURL(photo.preview);
      return { photos: s.photos.filter((_, i) => i !== idx) };
    }),
  reset: () => {
    set((s) => {
      s.photos.forEach((p) => URL.revokeObjectURL(p.preview));
      return { ...initial };
    });
  },
}));
