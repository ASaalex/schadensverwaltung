import { useState } from 'react';
import { useAuth } from './AuthContext';
import { AlertTriangle, Copy, RefreshCw, LogOut } from 'lucide-react';

export function NoProfileScreen() {
  const { authUser, refreshProfile, signOut } = useAuth();
  const [copied, setCopied] = useState(false);

  const sql = `-- Im Supabase SQL Editor ausführen (idempotent, kannst du beliebig oft laufen lassen):

-- (1) Profil anlegen oder aktualisieren
insert into public.users (id, company_id, role, full_name, active)
values (
  '${authUser?.id ?? '<deine-auth-user-id>'}',
  '00000000-0000-0000-0000-000000000001',  -- Bauhof Erfurt
  'admin',                                  -- oder: dispatcher | field_worker | company_user
  '${authUser?.email?.split('@')[0] ?? 'Dein Name'}',
  true
)
on conflict (id) do update set
  company_id = excluded.company_id,
  role       = excluded.role,
  full_name  = excluded.full_name,
  active     = true;

-- (2) Sicherheits-Policy: User darf sich selbst immer lesen
drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users for select
  using (id = auth.uid());

-- (3) Verify
select id, role, company_id, full_name, active
from public.users
where id = '${authUser?.id ?? '<deine-auth-user-id>'}';`;

  async function copyToClipboard() {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-2xl">
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Anmeldung erfolgreich — aber kein Profil hinterlegt</h1>
            <p className="mt-1 text-sm">
              Dein Auth-Account (<code>{authUser?.email}</code>) existiert, aber in der Tabelle{' '}
              <code>public.users</code> gibt es noch keinen Eintrag mit deiner Rolle und Firma.
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
            So legst du dich als Admin an
          </h2>
          <ol className="mb-4 list-inside list-decimal space-y-1 text-sm">
            <li>Öffne dein Supabase-Projekt → <strong>SQL Editor</strong> → <em>New query</em></li>
            <li>Füge folgenden SQL-Block ein und drücke <strong>Run</strong>:</li>
          </ol>

          <div className="relative">
            <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
{sql}
            </pre>
            <button
              onClick={copyToClipboard}
              className="absolute right-2 top-2 flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600"
            >
              <Copy className="h-3 w-3" />
              {copied ? 'kopiert' : 'kopieren'}
            </button>
          </div>

          <ol start={3} className="mt-4 list-inside list-decimal space-y-1 text-sm">
            <li>
              Danach hier auf <strong>"Erneut prüfen"</strong> klicken — wenn der Eintrag da ist,
              wirst du auf die Admin-Startseite weitergeleitet.
            </li>
          </ol>

          <div className="mt-6 flex justify-between gap-2">
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" /> Abmelden
            </button>
            <button
              onClick={refreshProfile}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <RefreshCw className="h-4 w-4" /> Erneut prüfen
            </button>
          </div>
        </div>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Deine Auth-User-ID: <code className="select-all">{authUser?.id}</code>
        </p>
      </div>
    </div>
  );
}
