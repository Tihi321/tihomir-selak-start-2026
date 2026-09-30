import { describe, expect, it, vi } from 'vitest';
import {
  DAILY_CACHE_KEY,
  LIST_CACHE_KEY,
  getDailyQuote,
  getRandomQuote,
  localReflectionQuote,
} from '@/lib/quotes/cdnQuotes';
import { reflections } from '@/data/reflections';

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

const ok = (body: unknown) =>
  vi.fn(
    async (..._args: unknown[]) =>
      new Response(JSON.stringify(body), { status: 200 }),
  ) as unknown as typeof fetch & { mock: { calls: unknown[][] } };
const day1 = new Date(2026, 5, 1, 10);
const day2 = new Date(2026, 5, 2, 10);
const daily = { data: { text: 'Be kind.', author: 'Someone' } };

describe('daily quote', () => {
  it('fetches on a miss, caches by local date, and skips the network on a hit', async () => {
    const storage = new MemoryStorage();
    const fetcher = ok(daily);
    const first = await getDailyQuote({
      storage: storage.asStorage(),
      fetcher,
      now: day1,
    });
    expect(first).toEqual({
      text: 'Be kind.',
      author: 'Someone',
      source: 'cdn',
    });
    expect(JSON.parse(storage.getItem(DAILY_CACHE_KEY)!)).toEqual({
      date: '2026-06-01',
      text: 'Be kind.',
      author: 'Someone',
    });
    const second = await getDailyQuote({
      storage: storage.asStorage(),
      fetcher,
      now: day1,
    });
    expect(second.source).toBe('cache');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toBe(
      'https://cdn.tihomir-selak.from.hr/daily/quote-eng.json',
    );
  });

  it('refetches on the next day', async () => {
    const storage = new MemoryStorage();
    const fetcher = ok(daily);
    await getDailyQuote({ storage: storage.asStorage(), fetcher, now: day1 });
    await getDailyQuote({ storage: storage.asStorage(), fetcher, now: day2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('returns the stale cached quote when the fetch fails', async () => {
    const storage = new MemoryStorage();
    await getDailyQuote({
      storage: storage.asStorage(),
      fetcher: ok(daily),
      now: day1,
    });
    const quote = await getDailyQuote({
      storage: storage.asStorage(),
      fetcher: vi.fn(async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
      now: day2,
    });
    expect(quote).toEqual({
      text: 'Be kind.',
      author: 'Someone',
      source: 'cache',
    });
  });

  it('falls back to a local reflection with no cache', async () => {
    const quote = await getDailyQuote({
      storage: new MemoryStorage().asStorage(),
      fetcher: vi.fn(
        async () => new Response('nope', { status: 500 }),
      ) as unknown as typeof fetch,
      now: day1,
    });
    expect(quote.source).toBe('local');
    expect(reflections).toContain(quote.text);
    expect(quote.author).toBe('An original reflection');
  });

  it.each([
    { data: { text: '   ', author: 'x' } },
    { data: { author: 'x' } },
    { nope: true },
    'string',
  ])('falls back on an invalid response shape %j', async (body) => {
    const quote = await getDailyQuote({
      storage: new MemoryStorage().asStorage(),
      fetcher: ok(body),
      now: day1,
    });
    expect(quote.source).toBe('local');
  });

  it('uses an empty author when missing and survives throwing storage', async () => {
    const throwing = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const quote = await getDailyQuote({
      storage: throwing,
      fetcher: ok({ data: { text: ' Hello ' } }),
      now: day1,
    });
    expect(quote).toEqual({ text: 'Hello', author: '', source: 'cdn' });
  });

  it('falls back when the request times out', async () => {
    const fetcher = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    ) as unknown as typeof fetch;
    const quote = await getDailyQuote({
      storage: new MemoryStorage().asStorage(),
      fetcher,
      now: day1,
      timeoutMs: 10,
    });
    expect(quote.source).toBe('local');
  });
});

describe('random quote', () => {
  const list = {
    data: [
      { text: 'One', author: 'A' },
      { text: '  ', author: 'skip' },
      { text: 'Two' },
      { text: 'Three', author: 'C' },
    ],
  };

  it('drops empty entries, caches the list, and avoids the excluded text', async () => {
    const storage = new MemoryStorage();
    const fetcher = ok(list);
    for (const random of [0, 0.34, 0.67, 0.99]) {
      const quote = await getRandomQuote({
        storage: storage.asStorage(),
        fetcher,
        now: day1,
        exclude: 'Two',
        random: () => random,
      });
      expect(quote.text).not.toBe('Two');
      expect(quote.text.trim()).not.toBe('');
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
    const cached = JSON.parse(storage.getItem(LIST_CACHE_KEY)!);
    expect(cached.quotes).toEqual([
      { text: 'One', author: 'A' },
      { text: 'Two', author: '' },
      { text: 'Three', author: 'C' },
    ]);
    expect(fetcher.mock.calls[0]![0]).toBe(
      'https://cdn.tihomir-selak.from.hr/api/quotes-eng.json',
    );
  });

  it('refetches after the 7 day TTL', async () => {
    const storage = new MemoryStorage();
    const fetcher = ok(list);
    await getRandomQuote({ storage: storage.asStorage(), fetcher, now: day1 });
    await getRandomQuote({
      storage: storage.asStorage(),
      fetcher,
      now: new Date(day1.getTime() + 6 * 86_400_000),
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await getRandomQuote({
      storage: storage.asStorage(),
      fetcher,
      now: new Date(day1.getTime() + 8 * 86_400_000),
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses the stale list on failure, then a different reflection', async () => {
    const storage = new MemoryStorage();
    await getRandomQuote({
      storage: storage.asStorage(),
      fetcher: ok(list),
      now: day1,
    });
    const failing = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const stale = await getRandomQuote({
      storage: storage.asStorage(),
      fetcher: failing,
      now: new Date(day1.getTime() + 30 * 86_400_000),
    });
    expect(stale.source).toBe('cache');

    const local = await getRandomQuote({
      storage: new MemoryStorage().asStorage(),
      fetcher: failing,
      exclude: reflections[0],
      random: () => 0,
    });
    expect(local.source).toBe('local');
    expect(local.text).not.toBe(reflections[0]);
  });

  it('falls back on an invalid list shape', async () => {
    const quote = await getRandomQuote({
      storage: new MemoryStorage().asStorage(),
      fetcher: ok({ data: 'oops' }),
    });
    expect(quote.source).toBe('local');
  });
});

describe('local reflections', () => {
  it('is deterministic per day and shifts with the offset', () => {
    expect(localReflectionQuote(day1)).toEqual(localReflectionQuote(day1));
    expect(localReflectionQuote(day1, 1).text).not.toBe(
      localReflectionQuote(day1).text,
    );
  });
});
