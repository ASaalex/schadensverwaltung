import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/types/database';

interface AuthState {
  session: Session | null;
  authUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      // eslint-disable-next-line no-console
      console.error('Profil laden fehlgeschlagen:', error);
      setProfile(null);
    } else {
      setProfile(data as UserProfile | null);
    }
  }

  useEffect(() => {
    let active = true;

    // Sicherheitsnetz: nach 8 Sekunden Loading-State auf jeden Fall beenden,
    // damit kein endloses "Lade Sitzung …" hängt. Hilft beim Diagnostizieren
    // von Auth-Hängern (z.B. ungültiger Session-Token nach Schlüssel-Wechsel).
    const safety = setTimeout(() => {
      if (active) {
        // eslint-disable-next-line no-console
        console.warn(
          '[Auth] getSession() hat nach 8s nicht geantwortet. Lokale Session wird verworfen.',
        );
        setLoading(false);
      }
    }, 8000);

    // eslint-disable-next-line no-console
    console.log('[Auth] Lade Session …');

    supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error) {
          // eslint-disable-next-line no-console
          console.error('[Auth] getSession Fehler:', error);
        }
        // eslint-disable-next-line no-console
        console.log('[Auth] Session geladen:', data.session ? `user=${data.session.user.email}` : 'keine Session');
        setSession(data.session);
        if (data.session?.user) {
          await loadProfile(data.session.user.id);
        }
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error('[Auth] getSession() warf Exception:', e);
      })
      .finally(() => {
        if (active) {
          clearTimeout(safety);
          setLoading(false);
        }
      });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, sess) => {
      // eslint-disable-next-line no-console
      console.log('[Auth] StateChange:', event);
      setSession(sess);
      if (sess?.user) {
        await loadProfile(sess.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      active = false;
      clearTimeout(safety);
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthState = {
    session,
    authUser: session?.user ?? null,
    profile,
    loading,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    async signOut() {
      await supabase.auth.signOut();
    },
    async refreshProfile() {
      if (session?.user) await loadProfile(session.user.id);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
