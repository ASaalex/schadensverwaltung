import { LayoutDashboard, AlertTriangle, ClipboardList, Upload, Box } from 'lucide-react';
import type { NavItem } from '@/components/layout/AppShell';

export const DISPO_SIDEBAR: NavItem[] = [
  { to: '/dispo/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/dispo/damages',   icon: AlertTriangle,   label: 'Schäden' },
  { to: '/dispo/objects',   icon: Box,             label: 'Objekte' },
  { to: '/dispo/orders',    icon: ClipboardList,   label: 'Aufträge' },
  { to: '/dispo/import',    icon: Upload,          label: 'CSV-Import' },
];
