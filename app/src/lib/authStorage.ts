import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/**
 * Persistenter Storage für die Supabase-Session.
 * - Nativ (Capacitor/iOS/Android): Capacitor Preferences → überlebt App-Kill
 *   und Speicher-Räumung durch das OS (im Gegensatz zu WebView-localStorage).
 * - Web/PWA: localStorage.
 *
 * supabase-js akzeptiert asynchrone Storage-Adapter (Promise-Rückgaben).
 */
const isNative = Capacitor.isNativePlatform();

export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    if (isNative) {
      const { value } = await Preferences.get({ key });
      return value ?? null;
    }
    try { return localStorage.getItem(key); } catch { return null; }
  },
  async setItem(key: string, value: string): Promise<void> {
    if (isNative) { await Preferences.set({ key, value }); return; }
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  },
  async removeItem(key: string): Promise<void> {
    if (isNative) { await Preferences.remove({ key }); return; }
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};
