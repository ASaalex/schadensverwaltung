import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { supabase } from '@/lib/supabase';
import { AlertTriangle, CalendarClock, AlarmClock, ClipboardList } from 'lucide-react';
import { DISPO_SIDEBAR } from './sidebar';

interface Kpis {
  open: number;
  dueToday: number;
  overdue: number;
  ordersInProgress: number;
}

async function fetchKpis(): Promise<Kpis> {
  const [openCount, ordersInProgress] = await Promise.all([
    supabase.from('damages').select('*', { count: 'exact', head: true }).neq('status', 'erledigt').neq('status', 'abgelehnt'),
    supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'bearbeitung'),
  ]);
  return {
    open: openCount.count ?? 0,
    dueToday: 0,
    overdue: 0,
    ordersInProgress: ordersInProgress.count ?? 0,
  };
}

export function DispoDashboardPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['kpis'], queryFn: fetchKpis });

  return (
    <AppShell title="Disposition" subtitle="Bauhof Erfurt · Dashboard" sidebar={DISPO_SIDEBAR}>
      <h2 className="mb-4 text-2xl font-semibold">Dashboard</h2>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Daten konnten nicht geladen werden: {(error as Error).message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Offene Schäden" value={isLoading ? '—' : String(data?.open ?? 0)} icon={<AlertTriangle className="h-4 w-4 text-blue-500" />} />
        <Kpi label="Heute fällig" value={isLoading ? '—' : String(data?.dueToday ?? 0)} icon={<CalendarClock className="h-4 w-4 text-amber-500" />} />
        <Kpi label="Überfällig" value={isLoading ? '—' : String(data?.overdue ?? 0)} icon={<AlarmClock className="h-4 w-4 text-red-500" />} />
        <Kpi label="Aufträge in Bearbeitung" value={isLoading ? '—' : String(data?.ordersInProgress ?? 0)} icon={<ClipboardList className="h-4 w-4 text-emerald-500" />} />
      </div>

      <div className="mt-6 rounded-xl border bg-white p-4 text-sm text-slate-600">
        <div className="mb-2 font-medium text-slate-900">Setup-Status</div>
        <ul className="space-y-1">
          <li>✓ App-Gerüst läuft, Login funktioniert</li>
          <li>✓ Live-Verbindung zur Datenbank (KPIs lesen)</li>
          <li>○ Schadensliste mit Filter / Sortierung / Export</li>
          <li>○ Karte mit Pins</li>
          <li>○ Auftrags-Editor mit Drag&amp;Drop</li>
        </ul>
      </div>
    </AppShell>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
