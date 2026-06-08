import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';

export const ASB_KLASSEN: Record<string, string> = {
  A: 'Autobahn (A)', B: 'Bundesstraße (B)', L: 'Landesstraße (L)',
  K: 'Kreisstraße (K)', St: 'Stadtstraße (St)', Gem: 'Gemeindestraße (Gem)',
  GV: 'Gemeindeverbindungsweg (GV)', P: 'Privat-/Wirtschaftsweg (P)',
  Rad: 'Radweg', sonst: 'Sonstige',
};

export interface ClassInterval { road_class: string; interval_months: number; }
export type SegStatus = 'red' | 'yellow' | 'green' | 'none';
export interface SegmentStatus { id: string; status: SegStatus; last_at: string | null; due_at: string | null; days_until_due: number | null; }

export interface SegmentInspection {
  id: string;
  inspected_at: string;
  coverage_pct: number | null;
  inspector_name: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (n: string) => (supabase as any).from(n);

/** Kontrollintervalle je Straßenklasse (Admin) */
export function useClassIntervals() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['class-intervals', profile?.company_id],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await tbl('road_class_intervals')
        .select('road_class, interval_months')
        .eq('company_id', profile!.company_id);
      if (error) throw error;
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: ClassInterval) => { map[r.road_class] = r.interval_months; });
      return map;
    },
    enabled: !!profile?.company_id,
  });

  const saveMut = useMutation({
    mutationFn: async (rows: ClassInterval[]) => {
      const payload = rows.map((r) => ({ ...r, company_id: profile!.company_id }));
      const { error } = await tbl('road_class_intervals').upsert(payload, { onConflict: 'company_id,road_class' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class-intervals', profile?.company_id] }),
  });

  return { query, saveMut };
}

/** Fälligkeits-Status je Abschnitt (Dashboard-Karte) */
export function useSegmentStatus() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['segment-status', profile?.company_id],
    queryFn: async (): Promise<Record<string, SegmentStatus>> => {
      const { data, error } = await tbl('segment_inspection_status')
        .select('id, status, last_at, due_at, days_until_due')
        .eq('company_id', profile!.company_id);
      if (error) throw error;
      const map: Record<string, SegmentStatus> = {};
      (data ?? []).forEach((r: SegmentStatus) => { map[r.id] = r; });
      return map;
    },
    enabled: !!profile?.company_id,
    staleTime: 60_000,
  });
}

/** Begehungs-Historie eines Abschnitts (wann/von wem) */
export function useSegmentInspections(segmentId: string | null) {
  return useQuery({
    queryKey: ['segment-inspections', segmentId],
    enabled: !!segmentId,
    queryFn: async (): Promise<SegmentInspection[]> => {
      const { data, error } = await tbl('segment_inspections')
        .select('id, inspected_at, coverage_pct, inspector:users!inspected_by ( full_name )')
        .eq('segment_id', segmentId!)
        .order('inspected_at', { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id, inspected_at: r.inspected_at, coverage_pct: r.coverage_pct,
        inspector_name: r.inspector?.full_name ?? null,
      }));
    },
  });
}
