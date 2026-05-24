import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { supabase } from '@/lib/supabase';
import {
  AlertTriangle,
  CalendarClock,
  AlarmClock,
  ClipboardList,
  MessageSquare,
  Plus,
  ArrowRight,
  ArrowUp,
  Edit3,
  ClipboardPlus,
  PackageOpen,
  Activity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DISPO_SIDEBAR } from './sidebar';
import { useDashboardActivity, useTodayCounts, type ActivityItem } from '@/hooks/useDashboardActivity';

interface Kpis {
  open: number;
  dueToday: number;
  overdue: number;
  ordersInProgress: number;
}

async function fetchKpis(): Promise<Kpis> {
  const today = new Date().toISOString().slice(0, 10);
  const [openCount, ordersInProgress, dueTodayCount, overdueCount] = await Promise.all([
    supabase.from('damages').select('*', { count: 'exact', head: true }).neq('status', 'erledigt').neq('status', 'abgelehnt'),
    supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'bearbeitung'),
    supabase.from('order_items').select('*', { count: 'exact', head: true }).eq('planned_date', today).neq('status', 'erledigt'),
    supabase.from('order_items').select('*', { count: 'exact', head: true }).lt('planned_date', today).neq('status', 'erledigt').neq('status', 'uebersprungen'),
  ]);
  return {
    open: openCount.count ?? 0,
    dueToday: dueTodayCount.count ?? 0,
    overdue: overdueCount.count ?? 0,
    ordersInProgress: ordersInProgress.count ?? 0,
  };
}

const ACTIVITY_META: Record<string, { icon: LucideIcon; color: string }> = {
  damage_created: { icon: Plus, color: '#3b82f6' },
  damage_status: { icon: Edit3, color: '#f97316' },
  damage_priority: { icon: ArrowUp, color: '#f97316' },
  damage_comment: { icon: MessageSquare, color: '#10b981' },
  order_created: { icon: ClipboardPlus, color: '#8b5cf6' },
  order_status: { icon: PackageOpen, color: '#f59e0b' },
};

const ACTIVITY_LABEL: Record<string, string> = {
  damage_created: 'Neuer Schaden',
  damage_status: 'Status-Änderung',
  damage_priority: 'Priorität-Änderung',
  damage_comment: 'Nachricht',
  order_created: 'Neuer Auftrag',
  order_status: 'Auftrags-Status',
};

export function DispoDashboardPage() {
  const nav = useNavigate();
  const { data: kpis, isLoading } = useQuery({ queryKey: ['kpis'], queryFn: fetchKpis, refetchInterval: 60_000 });
  const { data: activity = [] } = useDashboardActivity(30);
  const { data: today } = useTodayCounts();

  return (
    <AppShell title="Disposition" subtitle="Bauhof Erfurt · Dashboard" sidebar={DISPO_SIDEBAR}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-2xl font-semibold">Dashboard</h2>
        <span className="text-xs text-muted-foreground">aktualisiert sich automatisch</span>
      </div>

      {/* KPI-Tiles */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Offene Schäden" value={isLoading ? '—' : String(kpis?.open ?? 0)} icon={<AlertTriangle className="h-4 w-4 text-blue-500" />} />
        <Kpi label="Heute fällig" value={isLoading ? '—' : String(kpis?.dueToday ?? 0)} icon={<CalendarClock className="h-4 w-4 text-amber-500" />} />
        <Kpi label="Überfällig" value={isLoading ? '—' : String(kpis?.overdue ?? 0)} icon={<AlarmClock className="h-4 w-4 text-red-500" />} />
        <Kpi label="Aufträge in Bearbeitung" value={isLoading ? '—' : String(kpis?.ordersInProgress ?? 0)} icon={<ClipboardList className="h-4 w-4 text-emerald-500" />} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Activity-Feed */}
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl border bg-white">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2 font-medium">
                <Activity className="h-4 w-4 text-blue-600" />
                Live-Aktivität
              </div>
              <span className="text-xs text-muted-foreground">
                {activity.length} Einträge · Top {Math.min(activity.length, 30)}
              </span>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {activity.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Noch keine Aktivität. Wird sichtbar sobald Schäden erfasst oder Aufträge angelegt werden.
                </div>
              )}
              {activity.map((a) => (
                <ActivityRow key={a.id} item={a} onClick={() => nav(routeForActivity(a))} />
              ))}
            </div>
          </div>
        </div>

        {/* Heute-Sidebar */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <div className="mb-3 text-sm font-medium text-slate-700">Heute</div>
            <TodayCount
              label="neue Schäden erfasst"
              value={today?.damagesToday ?? 0}
              icon={<AlertTriangle className="h-4 w-4 text-blue-600" />}
              onClick={() => nav('/dispo/damages')}
            />
            <TodayCount
              label="Auftrags-Positionen geplant"
              value={today?.positionsToday ?? 0}
              icon={<CalendarClock className="h-4 w-4 text-amber-600" />}
              onClick={() => nav('/dispo/orders')}
            />
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="mb-2 text-sm font-medium text-slate-700">Schnellzugriff</div>
            <button
              onClick={() => nav('/dispo/damages')}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
            >
              <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-blue-500" /> Schäden</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            </button>
            <button
              onClick={() => nav('/dispo/orders')}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
            >
              <span className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-emerald-500" /> Aufträge</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            </button>
            <button
              onClick={() => nav('/dispo/orders/new')}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
            >
              <span className="flex items-center gap-2"><Plus className="h-4 w-4 text-violet-500" /> Neuer Auftrag</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            </button>
            <button
              onClick={() => nav('/dispo/import')}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
            >
              <span className="flex items-center gap-2"><ClipboardPlus className="h-4 w-4 text-slate-500" /> CSV-Import</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ActivityRow({ item, onClick }: { item: ActivityItem; onClick: () => void }) {
  const meta = ACTIVITY_META[item.kind];
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      className="flex w-full items-start gap-3 border-b px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-slate-50"
    >
      <div
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: meta.color + '20' }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">
            {ACTIVITY_LABEL[item.kind] ?? item.kind}
            {' '}
            <span className="font-mono text-xs text-muted-foreground">
              {item.damage_code ?? item.order_code}
            </span>
          </span>
          <span className="flex-shrink-0 text-[10px] text-muted-foreground">
            {formatRelativeTime(item.created_at)}
          </span>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {item.details ?? item.message}
          {item.user_name && <span className="ml-1">· {item.user_name}</span>}
        </div>
      </div>
    </button>
  );
}

function TodayCount({
  label,
  value,
  icon,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50"
    >
      <span className="flex items-center gap-2 text-sm text-slate-700">
        {icon} {label}
      </span>
      <span className="text-xl font-semibold">{value}</span>
    </button>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground sm:text-sm">{label}</span>
        {icon}
      </div>
      <div className="text-xl font-semibold sm:text-2xl">{value}</div>
    </div>
  );
}

function routeForActivity(a: ActivityItem): string {
  if (a.damage_id) return `/dispo/damages/${a.damage_id}`;
  if (a.order_id) return `/dispo/orders/${a.order_id}`;
  return '/dispo/dashboard';
}

function formatRelativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  const diffSec = Math.round((Date.now() - ts) / 1000);
  if (diffSec < 60) return `vor ${diffSec}s`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `vor ${diffMin}min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `vor ${diffH}h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `vor ${diffD}T`;
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}
