import type { DamageCategory, GeometryType } from '@/types/database';

export interface CategoryNode extends DamageCategory {
  children: CategoryNode[];
}

/** Liste der erlaubten Geometrie-Typen (Fallback auf primären Typ wenn nur einer). */
export function allowedGeometryTypes(cat: { geometry_types?: GeometryType[] | null; geometry_type?: GeometryType }): GeometryType[] {
  if (cat.geometry_types && cat.geometry_types.length > 0) return cat.geometry_types;
  return [cat.geometry_type ?? 'point'];
}

export function buildCategoryTree(flat: DamageCategory[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  flat.forEach((c) => {
    // Sicherheit: wenn DB-Migration noch nicht gelaufen ist, fülle geometry_types
    // synthetisch aus geometry_type
    const types = c.geometry_types && c.geometry_types.length > 0
      ? c.geometry_types
      : [c.geometry_type ?? 'point'];
    map.set(c.id, { ...c, geometry_types: types, children: [] });
  });
  const roots: CategoryNode[] = [];
  flat.forEach((c) => {
    const node = map.get(c.id)!;
    if (c.parent_id) {
      const parent = map.get(c.parent_id);
      if (parent) parent.children.push(node);
      else roots.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortRecursive = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRecursive(n.children));
  };
  sortRecursive(roots);
  return roots;
}

/** Find a node + the breadcrumb path to it in the tree. */
export function findNodeWithPath(
  tree: CategoryNode[],
  id: string,
  path: CategoryNode[] = [],
): { node: CategoryNode; path: CategoryNode[] } | null {
  for (const node of tree) {
    const newPath = [...path, node];
    if (node.id === id) return { node, path: newPath };
    const inChild = findNodeWithPath(node.children, id, newPath);
    if (inChild) return inChild;
  }
  return null;
}

/** Inherit geometry_type from parent if needed (handy when only leaves are usable). */
export function effectiveGeometryType(node: CategoryNode): 'point' | 'line' | 'polygon' {
  return node.geometry_type;
}
