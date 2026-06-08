/**
 * Führt eine async-Operation bei transienten Netzfehlern erneut aus.
 * (Safari meldet abgebrochene Fetches als "Load failed".)
 */
function isTransient(e: unknown): boolean {
  const m = ((e as Error)?.message ?? String(e)).toLowerCase();
  return (
    m.includes('load failed') ||
    m.includes('failed to fetch') ||
    m.includes('network') ||
    m.includes('timeout') ||
    m.includes('fetch')
  );
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; delayMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const delayMs = opts.delayMs ?? 600;
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === retries || !isTransient(e)) throw e;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}
