import { useEffect, useState } from 'react';

/**
 * Reagiert auf Online/Offline-Events des Browsers.
 * Auf Capacitor (Mobile) verwendet die App den nativen NetworkStatus.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    function on() { setOnline(true); }
    function off() { setOnline(false); }
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return online;
}
