/**
 * Selbstheilung bei veralteten/fehlenden JS-Chunks (nach Deploy) und bei
 * fehlgeschlagenen dynamischen Imports (z. B. Capacitor-Geolocation-Web-Plugin).
 * Lädt die Seite EINMAL neu (per sessionStorage gegen Endlosschleife gesichert).
 */
const FLAG = 'chunk-reload-attempt';

function looksLikeChunkError(msg: string | undefined): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return (
    m.includes('is not a valid javascript mime type') ||
    m.includes('failed to fetch dynamically imported module') ||
    m.includes('importing a module script failed') ||
    m.includes('error loading dynamically imported module') ||
    m.includes("unable to preload css") ||
    m.includes('load failed') // Safari: fehlgeschlagener Modul-/Fetch-Load
  );
}

function reloadOnce() {
  // Innerhalb von 20 s nicht erneut, sonst Schleifenschutz
  const last = Number(sessionStorage.getItem(FLAG) ?? '0');
  if (Date.now() - last < 20_000) return;
  sessionStorage.setItem(FLAG, String(Date.now()));
  // eslint-disable-next-line no-console
  console.warn('[chunkReload] Veralteter/fehlender Chunk erkannt — lade neu …');
  window.location.reload();
}

export function installChunkReloadGuard() {
  // Vite-spezifisches Preload-Fehler-Event
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault();
    reloadOnce();
  });

  // Allgemeine Modul-Ladefehler
  window.addEventListener('error', (e) => {
    if (looksLikeChunkError(e.message)) reloadOnce();
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const msg = typeof reason === 'string' ? reason : reason?.message;
    if (looksLikeChunkError(msg)) reloadOnce();
  });
}
