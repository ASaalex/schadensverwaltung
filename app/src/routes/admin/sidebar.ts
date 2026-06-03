import { Users, Building2, ListTree, Route } from 'lucide-react';
import type { NavItem } from '@/components/layout/AppShell';

export const ADMIN_SIDEBAR: NavItem[] = [
  { to: '/admin/users',      icon: Users,     label: 'Nutzer' },
  { to: '/admin/companies',  icon: Building2, label: 'Firmen' },
  { to: '/admin/categories', icon: ListTree,  label: 'Schadenskatalog' },
  { to: '/admin/network',    icon: Route,     label: 'Straßennetz' },
];
