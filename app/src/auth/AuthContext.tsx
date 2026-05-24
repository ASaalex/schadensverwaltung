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
    let lastLoadedUserId: string | null = null;

    // Sicherheitsnetz: nach 8 Sekunden auf jeden Fall raus aus Loading
    const safety = setTimeout(() => {
      if (active) {
        // eslint-disable-next-line no-console
        console.warn('[Auth] Timeout 8s — Loading wird beendet');
        setLoading(false);
      }
    }, 8000);

    // EIN einziger Listener — INITIAL_SESSION feuert sofort, also brauchen
    // wir kein separates getSession() (das hatte vorher Races verursacht).
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, sess) => {
      if (!active) return;
      // eslint-disable-next-line no-console
      console.log('[Auth] StateChange:', event, sess?.user?.email ?? '(keine Session)');

      setSession(sess);

      if (sess?.user) {
        // Profile nur neu laden wenn sich der User-ID wirklich ändert
        // (vermeidet doppelte Loads bei TOKEN_REFRESHED etc.)
        if (sess.user.id !== lastLoadedUserId) {
          lastLoadedUserId = sess.user.id;
          await loadProfile(sess.user.id);
        }
      } else {
        lastLoadedUserId = null;
        setProfile(null);
      }

      // Loading nach erstem Event beenden (INITIAL_SESSION oder SIGNED_IN)
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        clearTimeout(safety);
        setLoading(false);
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
