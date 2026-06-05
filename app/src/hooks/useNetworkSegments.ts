import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface RoadSegment {
  id: string;
  from_node: string;
  to_node: string;
  from_node_id: string | null;
  to_node_id:   string | null;
  /** Gültig ab (ISO-Datum) */
  gueltig_von: string | null;
  /** Gültig bis (ISO-Datum, null = unbegrenzt) */
  gueltig_bis: string | null;
  name: string | null;
  length_m: number | null;
  /** Legacy-Klasse (wird durch strassen_klasse_asb abgelöst) */
  road_class: string | null;
  /** ASB-Straßenklasse: A / B / L / K / St / Gem / GV / P / Rad / sonst */
  strassen_klasse_asb: string | null;
  /** Offizielle Straßennummer, z. B. "B 4", "L 1036", "K 12" */
  strassen_nummer: string | null;
  /** ASB-Abschnittsnummer */
  abschnitts_nummer: string | null;
  /** Ast-Nummer (0 = Hauptabschnitt) */
  ast_nummer: string | null;
  /** Start-Stationierung in Metern */
  von_station: number | null;
  /** End-Stationierung in Metern */
  bis_station: number | null;
  geometry: { type: 'LineString'; coordinates: number[][] } | null;
  created_at: string;
  updated_at: string;
}

export function useNetworkSegments() {
  return useQuery({
    queryKey: ['road-segments'],
    queryFn: async (): Promise<RoadSegment[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('road_segments')
        .select(
          'id, from_node, to_node, from_node_id, to_node_id, name, length_m, road_class, ' +
          'strassen_klasse_asb, strassen_nummer, abschnitts_nummer, ast_nummer, ' +
          'von_station, bis_station, gueltig_von, gueltig_bis, geometry, created_at, updated_at',
        )
        .order('strassen_nummer', { ascending: true, nullsFirst: false })
        .order('from_node');
      if (error) throw error;
      return (data ?? []) as RoadSegment[];
    },
  });
}
