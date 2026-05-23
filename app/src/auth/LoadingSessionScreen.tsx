import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

/**
 * Zeigt "Lade Sitzung …" und nach 3 Sekunden zusätzlich eine "Stuck?"-Aktion,
 * die alle Supabase-bezogenen LocalStorage-Einträge löscht und neu lädt.
 *
 * Hilft bei Auth-Hängern, die durch alte/inkompatible Session-Tokens entstehen
 * (z.B. nach Schlüssel- oder Projektwechsel).
 */
export function LoadingSessionScreen() {
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowHelp(true), 3000);
    return () => clearTimeout(t);
  }, []);

  function clearAndReload() {
    try {
      const keysToDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((k) => localStorage.removeItem(k));
      // eslint-disable-next-line no-console
      console.log('[Auth] LocalStorage geleert:', keysToDelete);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[Auth] Konnte LocalStorage nicht leeren:', e);
    }
    window.location.replace('/');
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Lade Sitzung …
      </div>
      {showHelp && (
        <div className="mt-6 max-w-md rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="mb-2 flex items-start gap-2 text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <div className="font-medium">Dauert ungewöhnlich lange?</div>
              <div className="text-sm">
                Ein abgelaufener Session-Token kann den Auth-Aufruf blockieren. Lösche
                die lokale Session und lade neu — du musst dich danach wieder anmelden.
              </div>
            </div>
          </div>
          <button
            onClick={clearAndReload}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            <RefreshCw className="h-4 w-4" /> Lokale Session löschen &amp; neu laden
          </button>
          <p className="mt-2 text-center text-xs text-slate-500">
            (Browser-DevTools öffnen → Tab <code>Konsole</code> zeigt Auth-Logs)
          </p>
        </div>
      )}
    </div>
  );
}
