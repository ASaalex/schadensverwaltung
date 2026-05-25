/**
 * Schlanker localStorage-Cache für Offline-Fallback.
 *  - Profile, Categories und Companies werden nach erfolgreichem Online-Load
 *    gespeichert
 *  - Beim Offline-Start nutzt die App diese Cache-Werte, damit der Erfasser
 *    auch ohne Netz arbeiten kann
 *  - TTL pro Eintrag (Default 30 Tage); danach werden alte Caches verworfen
 */

const PREFIX = 'sv-cache:';
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface Entry<T> {
  v: T;
  t: number; // saved at (ms)
}

export function cacheSet<T>(key: string, value: T): void {
  try {
    const entry: Entry<T> = { v: value, t: Date.now() };
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[cache] write failed:', e);
  }
}

export function cacheGet<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (Date.now() - entry.t > ttlMs) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return entry.v;
  } catch {
    return null;
  }
}

export function cacheClear(prefix?: string): void {
  const fullPrefix = PREFIX + (prefix ?? '');
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(fullPrefix)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export const CACHE_KEYS = {
  profile: (userId: string) => `profile:${userId}`,
  categories: 'category-tree',
  companies: 'companies',
};
