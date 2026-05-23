import { LayoutDashboard, AlertTriangle, ClipboardList, Upload } from 'lucide-react';
import type { NavItem } from '@/components/layout/AppShell';

export const DISPO_SIDEBAR: NavItem[] = [
  { to: '/dispo/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/dispo/damages',   icon: AlertTriangle,   label: 'Schäden' },
  { to: '/dispo/orders',    icon: ClipboardList,   label: 'Aufträge' },
  { to: '/dispo/import',    icon: Upload,          label: 'CSV-Import' },
];
