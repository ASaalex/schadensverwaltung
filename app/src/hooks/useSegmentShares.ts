import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (n: string) => (supabase as any).from(n);

/**
 * Sichtbarkeits-Freigaben eines Straßenabschnitts an weitere Firmen.
 * Liefert die company_ids, für die der Abschnitt (zusätzlich zur Eigentümer-
 * Firma) sichtbar ist, und eine Mutation zum Setzen der kompletten Liste.
 */
export function useSegmentShares(segmentId: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['segment-shares', segmentId],
    enabled: !!segmentId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await tbl('road_segment_shares')
        .select('company_id')
        .eq('segment_id', segmentId!);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => r.company_id as string);
    },
  });

  /** Setzt die Freigabe-Liste eines Abschnitts (Diff: löschen + einfügen). */
  const saveMut = useMutation({
    mutationFn: async ({ segId, companyIds }: { segId: string; companyIds: string[] }) => {
      const { data: existing, error: readErr } = await tbl('road_segment_shares')
        .select('company_id').eq('segment_id', segId);
      if (readErr) throw readErr;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const current: string[] = (existing ?? []).map((r: any) => r.company_id);
      const toAdd = companyIds.filter((c) => !current.includes(c));
      const toDel = current.filter((c) => !companyIds.includes(c));

      if (toDel.length > 0) {
        const { error } = await tbl('road_segment_shares')
          .delete().eq('segment_id', segId).in('company_id', toDel);
        if (error) throw error;
      }
      if (toAdd.length > 0) {
        const { error } = await tbl('road_segment_shares')
          .insert(toAdd.map((company_id) => ({ segment_id: segId, company_id })));
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['segment-shares', vars.segId] });
      qc.invalidateQueries({ queryKey: ['road-segments'] });
    },
  });

  return { query, saveMut };
}
