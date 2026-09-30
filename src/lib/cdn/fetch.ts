export function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function defaultStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function readJson(storage: Storage | undefined, key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeJson(
  storage: Storage | undefined,
  key: string,
  value: unknown,
) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* Features still work without a cache. */
  }
}

async function request<T>(
  url: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  timeoutMs: number,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const pending = fetcher(url, { signal: controller.signal });
    const aborted = new Promise<never>((_, reject) => {
      const fail = () => reject(new Error('Request was cancelled.'));
      if (controller.signal.aborted) fail();
      else controller.signal.addEventListener('abort', fail, { once: true });
    });
    const response = await Promise.race([pending, aborted]);
    if (!response.ok) throw new Error(`Service returned ${response.status}.`);
    return await Promise.race([read(response), aborted]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function fetchJson(
  url: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<unknown> {
  return request(url, fetcher, signal, timeoutMs, (r) => r.json());
}

export function fetchText(
  url: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<string> {
  return request(url, fetcher, signal, timeoutMs, (r) => r.text());
}
