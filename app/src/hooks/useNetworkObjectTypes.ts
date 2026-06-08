import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';
import type { PropertyFieldDef } from '@/types/database';

export interface NetworkObjectType {
  id: string;
  parent_id: string | null;
  name: string;
  geometry_type: 'point' | 'line' | 'polygon';
  color: string;
  description: string | null;
  property_schema: PropertyFieldDef[];
  sort_order: number;
  created_at: string;
}

export interface ObjectTypeNode extends NetworkObjectType {
  children: ObjectTypeNode[];
  depth: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = () => (supabase as any).from('network_object_types');

const SELECT = 'id, parent_id, name, geometry_type, color, description, property_schema, sort_order, created_at';

export function useNetworkObjectTypes() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['network-object-types', profile?.company_id],
    queryFn: async (): Promise<NetworkObjectType[]> => {
      const { data, error } = await tbl()
        .select(SELECT)
        .eq('company_id', profile!.company_id)
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return ((data ?? []) as NetworkObjectType[]).map((t) => ({
        ...t,
        property_schema: Array.isArray(t.property_schema) ? t.property_schema : [],
      }));
    },
    enabled: !!profile?.company_id,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['network-object-types', profile?.company_id] });

  const saveMut = useMutation({
    mutationFn: async (t: Partial<NetworkObjectType> & { name: string; geometry_type: string }) => {
      const payload = { ...t, company_id: profile!.company_id };
      const { error } = t.id
        ? await tbl().update(payload).eq('id', t.id)
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

/** Baut aus der flachen Liste einen Baum (für Admin-Anzeige). */
export function buildObjectTypeTree(types: NetworkObjectType[]): ObjectTypeNode[] {
  const byId = new Map<string, ObjectTypeNode>();
  types.forEach((t) => byId.set(t.id, { ...t, children: [], depth: 0 }));
  const roots: ObjectTypeNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const setDepth = (nodes: ObjectTypeNode[], d: number) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    for (const n of nodes) { n.depth = d; setDepth(n.children, d + 1); }
  };
  setDepth(roots, 0);
  return roots;
}

/** Merkmale eines Typs inklusive der geerbten Merkmale aller Vorfahren. */
export function inheritedSchema(typeId: string, types: NetworkObjectType[]): PropertyFieldDef[] {
  const byId = new Map(types.map((t) => [t.id, t]));
  const chain: PropertyFieldDef[] = [];
  const seen = new Set<string>();
  let cur = byId.get(typeId);
  const stack: NetworkObjectType[] = [];
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    stack.unshift(cur); // Vorfahren zuerst
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  for (const t of stack) {
    for (const f of t.property_schema ?? []) {
      if (!chain.some((c) => c.name === f.name)) chain.push(f);
    }
  }
  return chain;
}
