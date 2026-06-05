import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { cacheGet, cacheSet, CACHE_KEYS } from '@/lib/localCache';
import type { UserProfile } from '@/types/database';

interface AuthState {
  session: Session | null;
  authUser: User | null;
  profile: UserProfile | null;
  /** Wartet auf das erste Auth-Event (INITIAL_SESSION) — dauert < 1s */
  loading: boolean;
  /** Wartet zusätzlich auf Profil-Load aus DB/Cache — kurz nach loading=false */
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session,        setSession]        = useState<Session | null>(null);
  const [profile,        setProfile]        = useState<UserProfile | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  async function loadProfile(userId: string) {
    setProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setProfile(data as UserProfile);
        cacheSet(CACHE_KEYS.profile(userId), data);
      } else {
        setProfile(null);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Auth] Profil-Online-Load fehlgeschlagen — versuche Cache:', err);
      const cached = cacheGet<UserProfile>(CACHE_KEYS.profile(userId));
      if (cached) {
        // eslint-disable-next-line no-console
        console.log('[Auth] Profil aus Offline-Cache geladen');
        setProfile(cached);
      } else {
        setProfile(null);
      }
    } finally {
      setProfileLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    let lastLoadedUserId: string | null = null;

    // Sicherheitsnetz: nach 5 Sekunden auf jeden Fall raus aus Loading
    const safety = setTimeout(() => {
      if (active) {
        // eslint-disable-next-line no-console
        console.warn('[Auth] Timeout 5s — Loading wird beendet');
        setLoading(false);
        setProfileLoading(false);
      }
    }, 5000);

    // WICHTIG: Callback ist NICHT async — setLoading(false) feuert sofort
    // wenn INITIAL_SESSION eintrifft, OHNE auf loadProfile zu warten.
    // Das verhindert den "Lade Sitzung …"-Hänger bei abgelaufenen Tokens.
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (!active) return;
      // eslint-disable-next-line no-console
      console.log('[Auth] StateChange:', event, sess?.user?.email ?? '(keine Session)');

      setSession(sess);

      // Loading sofort freigeben — nicht auf Profil-DB-Query warten
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        clearTimeout(safety);
        setLoading(false);
      }

      if (sess?.user) {
        // Profil nur neu laden wenn User-ID sich wirklich ändert
        if (sess.user.id !== lastLoadedUserId) {
          lastLoadedUserId = sess.user.id;
          // Fire-and-forget: blockiert Loading NICHT mehr
          loadProfile(sess.user.id).catch(() => {/* bereits in loadProfile behandelt */});
        }
      } else {
        lastLoadedUserId = null;
        setProfile(null);
        setProfileLoading(false);
      }
    });

    return () => {
      active = false;
      clearTimeout(safety);
      sub.subscription.unsubscribe();
    };
  // loadProfile ist stabil (keine deps die sich ändern)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: AuthState = {
    session,
    authUser: session?.user ?? null,
    profile,
    loading,
    profileLoading,
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
