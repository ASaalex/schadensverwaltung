import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface OrderListItem {
  id: string;
  code: string;
  title: string;
  status: string;
  planned_start_date: string | null;
  planned_end_date: string | null;
  created_at: string;
  assigned_company_id: string;
  assigned_company_name: string | null;
  positions_count: number;
}

export function useOrdersList() {
  return useQuery({
    queryKey: ['orders-list'],
    queryFn: async (): Promise<OrderListItem[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          id, code, title, status,
          planned_start_date, planned_end_date, created_at, assigned_company_id,
          assigned_company:companies!assigned_company_id ( name ),
          positions:order_items ( id )
        `,
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{
        id: string;
        code: string;
        title: string;
        status: string;
        planned_start_date: string | null;
        planned_end_date: string | null;
        created_at: string;
        assigned_company_id: string;
        assigned_company: { name: string } | null;
        positions: { id: string }[];
      }>;
      return rows.map((r) => ({
        id: r.id,
        code: r.code,
        title: r.title,
        status: r.status,
        planned_start_date: r.planned_start_date,
        planned_end_date: r.planned_end_date,
        created_at: r.created_at,
        assigned_company_id: r.assigned_company_id,
        assigned_company_name: r.assigned_company?.name ?? null,
        positions_count: r.positions?.length ?? 0,
      }));
    },
  });
}
