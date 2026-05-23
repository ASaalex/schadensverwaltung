import { usePendingSync } from '@/hooks/usePendingSync';
import { CloudOff, Cloud, Loader2, RefreshCw } from 'lucide-react';

interface Props {
  variant?: 'mobile' | 'desktop';
}

/**
 * Visualisiert den Online-Status + Anzahl der wartenden Schäden.
 * Klick → manueller Sync-Versuch.
 */
export function SyncIndicator({ variant = 'mobile' }: Props) {
  const { online, pendingCount, syncing, syncNow } = usePendingSync();

  if (online && pendingCount === 0) {
    if (variant === 'desktop') {
      return (
        <span className="flex items-center gap-1 text-xs text-emerald-600">
          <Cloud className="h-3.5 w-3.5" /> Online
        </span>
      );
    }
    return null; // Mobile: ruhig wenn alles ok
  }

  const offline = !online;
  const color = offline ? 'bg-amber-500' : pendingCount > 0 ? 'bg-blue-600' : 'bg-emerald-600';
  const label = syncing
    ? 'Sync läuft …'
    : offline
      ? pendingCount > 0
        ? `Offline · ${pendingCount} wartet`
        : 'Offline'
      : `${pendingCount} wartet auf Sync`;

  return (
    <button
      onClick={() => !offline && syncNow()}
      disabled={syncing || offline}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white ${color} disabled:opacity-80`}
      title={offline ? 'Aktuell offline — wird automatisch synchronisiert, sobald online' : 'Jetzt synchronisieren'}
    >
      {syncing ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : offline ? (
        <CloudOff className="h-3 w-3" />
      ) : (
        <RefreshCw className="h-3 w-3" />
      )}
      {label}
    </button>
  );
}
