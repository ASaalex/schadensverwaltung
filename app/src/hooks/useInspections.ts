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
export interface SegmentStatus { id: string; status: 'red' | 'yellow' | 'green'; last_at: string | null; due_at: string | null; days_until_due: number | null; }

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
