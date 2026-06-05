import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';
import { haversineDistance } from '@/lib/geoMeasure';

export interface NetworkObject {
  id: string;
  object_type_id: string;
  name: string | null;
  identifier: string | null;
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon';
    coordinates: number[] | number[][] | number[][][];
  };
  attributes: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // joined
  type_name?: string;
  type_color?: string;
  type_geometry_type?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = () => (supabase as any).from('network_objects');

export function useNetworkObjects() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['network-objects', profile?.company_id],
    queryFn: async (): Promise<NetworkObject[]> => {
      const { data, error } = await tbl()
        .select(`
          id, object_type_id, name, identifier, geometry, attributes, created_at, updated_at,
          object_type:network_object_types!object_type_id ( name, color, geometry_type )
        `)
        .eq('company_id', profile!.company_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as Array<NetworkObject & {
        object_type: { name: string; color: string; geometry_type: string } | null;
      }>).map((r) => ({
        ...r,
        type_name:          r.object_type?.name,
        type_color:         r.object_type?.color,
        type_geometry_type: r.object_type?.geometry_type,
      }));
    },
    enabled: !!profile?.company_id,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['network-objects', profile?.company_id] });

  const saveMut = useMutation({
    mutationFn: async (o: Partial<NetworkObject> & { object_type_id: string; geometry: NetworkObject['geometry'] }) => {
      const payload = { ...o, company_id: profile!.company_id };
      const { error } = o.id
        ? await tbl().update(payload).eq('id', o.id)
        : await tbl().insert(payload);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await tbl().delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { query, saveMut, deleteMut };
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

/** Mittelpunkt eines Objekts für Distanzberechnung ([lng, lat]) */
export function objectCenter(obj: NetworkObject): [number, number] {
  const geom = obj.geometry;
  if (geom.type === 'Point') return geom.coordinates as [number, number];
  if (geom.type === 'LineString') {
    const coords = geom.coordinates as number[][];
    return coords[Math.floor(coords.length / 2)] as [number, number];
  }
  // Polygon: Schwerpunkt des äußeren Rings
  const ring = (geom.coordinates as number[][][])[0];
  const lng  = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lat  = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return [lng, lat];
}

/** Sucht passende Objekte in einem Umkreis (default 50 m) */
export function findNearbyObjects(
  lat: number,
  lng: number,
  objects: NetworkObject[],
  typeIds: string[],
  radiusM = 50,
): Array<{ object: NetworkObject; distanceM: number }> {
  return objects
    .filter((o) => typeIds.length === 0 || typeIds.includes(o.object_type_id))
    .map((o) => ({ object: o, distanceM: haversineDistance([lng, lat], objectCenter(o)) }))
    .filter((r) => r.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}
