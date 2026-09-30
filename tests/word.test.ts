import { describe, expect, it, vi } from 'vitest';
import { WORD_CACHE_KEY, getDailyWord } from '@/lib/daily/word';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  asStorage() {
    return this as unknown as Storage;
  }
}

const okFetch = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body)));
const payload = { data: { name: 'Petrichor', detail: 'The smell of rain.' } };
const day = new Date(2026, 8, 30, 12);
const nextDay = new Date(2026, 9, 1, 12);

describe('getDailyWord', () => {
  it('fetches, trims and caches a fresh word', async () => {
    const storage = new MemoryStorage();
    const fetcher = okFetch({
      data: { name: ' Petrichor ', detail: ' The smell of rain. ' },
    });
    const result = await getDailyWord({
      storage: storage.asStorage(),
      fetcher: fetcher as unknown as typeof fetch,
      now: day,
    });
    expect(result).toEqual({
      word: 'Petrichor',
      meaning: 'The smell of rain.',
      source: 'cdn',
    });
    expect(JSON.parse(storage.values.get(WORD_CACHE_KEY)!)).toEqual({
      date: '2026-09-30',
      word: 'Petrichor',
      meaning: 'The smell of rain.',
    });
  });

  it('uses the same-day cache without fetching', async () => {
    const storage = new MemoryStorage();
    const fetcher = okFetch(payload);
    const options = {
      storage: storage.asStorage(),
      fetcher: fetcher as unknown as typeof fetch,
      now: day,
    };
    await getDailyWord(options);
    const again = await getDailyWord(options);
    expect(again?.source).toBe('cache');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('falls back to a stale word when the fetch fails', async () => {
    const storage = new MemoryStorage();
    await getDailyWord({
      storage: storage.asStorage(),
      fetcher: okFetch(payload) as unknown as typeof fetch,
      now: day,
    });
    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    const result = await getDailyWord({
      storage: storage.asStorage(),
      fetcher: failing as unknown as typeof fetch,
      now: nextDay,
    });
    expect(result).toEqual({
      word: 'Petrichor',
      meaning: 'The smell of rain.',
      source: 'cache',
    });
  });

  it('returns null on failure without a cache and never throws', async () => {
    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(
      getDailyWord({
        storage: new MemoryStorage().asStorage(),
        fetcher: failing as unknown as typeof fetch,
        now: day,
      }),
    ).resolves.toBeNull();
  });

  it('rejects invalid or empty payloads', async () => {
    for (const body of [
      { data: { name: 'x' } },
      { nope: true },
      { data: { name: ' ', detail: 'meaning' } },
    ]) {
      await expect(
        getDailyWord({
          storage: new MemoryStorage().asStorage(),
          fetcher: okFetch(body) as unknown as typeof fetch,
          now: day,
        }),
      ).resolves.toBeNull();
    }
  });
});
