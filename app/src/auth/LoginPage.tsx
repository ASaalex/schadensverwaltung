import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { hasSupabaseCredentials } from '@/lib/supabase';
import { Construction, AlertTriangle } from 'lucide-react';

export function LoginPage() {
  const { session, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) {
    const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await signIn(email, password);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
            <Construction className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Schadensverwaltung</h1>
            <p className="text-sm text-muted-foreground">Bauhof Erfurt</p>
          </div>
        </div>

        {!hasSupabaseCredentials && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              <strong>Supabase-Verbindung fehlt.</strong> Trage <code>VITE_SUPABASE_URL</code> und{' '}
              <code>VITE_SUPABASE_ANON_KEY</code> in <code>app/.env.local</code> ein und starte den
              Dev-Server neu.
            </span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium">E-Mail</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Passwort</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <button
            type="submit"
            disabled={busy || !hasSupabaseCredentials}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Anmelden …' : 'Anmelden'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Keinen Account? Bitte beim Admin melden.
        </p>
      </div>
    </div>
  );
}
