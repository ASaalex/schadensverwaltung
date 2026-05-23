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

export const hasSupabaseCredentials = Boolean(url && anonKey);
