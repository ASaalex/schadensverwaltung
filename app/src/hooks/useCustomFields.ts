import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';

export interface CustomField {
  id: string;
  company_id: string;
  entity_type: 'order' | 'damage';
  field_name: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  field_options: string[] | null;
  required: boolean;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export function useCustomFields(entityType?: 'order' | 'damage') {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['custom-fields', profile?.company_id, entityType],
    queryFn: async (): Promise<CustomField[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('custom_fields')
        .select('*')
        .eq('company_id', profile!.company_id)
        .eq('active', true)
        .order('entity_type')
        .order('sort_order');
      if (entityType) q = q.eq('entity_type', entityType);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CustomField[];
    },
    enabled: !!profile?.company_id,
  });
}

/** Alle Felder inkl. inaktiver (für den Admin-Editor) */
export function useCustomFieldsAdmin() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['custom-fields-admin', profile?.company_id],
    queryFn: async (): Promise<CustomField[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('custom_fields')
        .select('*')
        .eq('company_id', profile!.company_id)
        .order('entity_type')
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as CustomField[];
    },
    enabled: !!profile?.company_id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['custom-fields-admin', profile?.company_id] });
    qc.invalidateQueries({ queryKey: ['custom-fields', profile?.company_id] });
  };

  const saveMut = useMutation({
    mutationFn: async (f: Omit<CustomField, 'id' | 'company_id' | 'created_at'> & { id?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tbl = (supabase as any).from('custom_fields');
      const payload = { ...f, company_id: profile!.company_id };
      const { error } = f.id
        ? await tbl.update(payload).eq('id', f.id)
        : await tbl.insert(payload);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('custom_fields').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { query, saveMut, deleteMut };
}
