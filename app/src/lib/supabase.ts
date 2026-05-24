import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Wir loggen statt zu throwen, damit die LoginPage einen klaren Hinweis zeigen kann.
  // eslint-disable-next-line no-console
  console.error(
    'Supabase-Credentials fehlen. Lege Werte in app/.env.local an (siehe .env.example).',
  );
}

export const supabase = createClient<Database>(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Zweiter Client ohne Session-Persistence — für Admin-Operationen wie
 * `auth.signUp()` zum Anlegen neuer User. Verhindert dass die Admin-Session
 * im Haupt-Client überschrieben wird (sonst feuert onAuthStateChange und
 * der AuthContext blockiert die UI).
 */
export const auxAuthClient = createClient<Database>(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'sb-aux-no-store',
  },
});

export const hasSupabaseCredentials = Boolean(url && anonKey);
