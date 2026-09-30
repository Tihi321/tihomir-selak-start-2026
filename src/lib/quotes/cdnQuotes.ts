import { z } from 'zod';
import {
  defaultStorage,
  fetchJson,
  localDateKey,
  readJson,
  writeJson,
} from '@/lib/cdn/fetch';
import { REFLECTION_AUTHOR, reflections } from '@/data/reflections';

export type Quote = {
  text: string;
  author: string;
  source: 'cdn' | 'cache' | 'local';
};
export type QuoteOptions = {
  storage?: Storage;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  now?: Date;
  timeoutMs?: number;
};

export const DAILY_QUOTE_URL =
  'https://cdn.tihomir-selak.from.hr/daily/quote-eng.json';
export const QUOTE_LIST_URL =
  'https://cdn.tihomir-selak.from.hr/api/quotes-eng.json';
export const DAILY_CACHE_KEY = 'start-page:quote:daily';
export const LIST_CACHE_KEY = 'start-page:quote:list';
const LIST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 9000;

type Entry = { text: string; author: string };

const rawEntry = z.object({
  text: z.string(),
  author: z.string().nullish(),
});
const dailyResponse = z.object({ data: rawEntry });
const listResponse = z.object({ data: z.array(z.unknown()) });
const dailyCache = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  text: z.string(),
  author: z.string(),
});
const listCache = z.object({
  fetchedAt: z.iso.datetime({ offset: true }),
  quotes: z.array(z.object({ text: z.string(), author: z.string() })),
});

function cleanEntry(value: unknown): Entry | null {
  const parsed = rawEntry.safeParse(value);
  if (!parsed.success) return null;
  const text = parsed.data.text.trim();
  if (!text) return null;
  return { text, author: parsed.data.author?.trim() ?? '' };
}

export function localReflectionQuote(
  date: Date = new Date(),
  offset = 0,
): Quote {
  const day = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000,
  );
  const count = reflections.length;
  const index = (((day + offset) % count) + count) % count;
  return {
    text: reflections[index]!,
    author: REFLECTION_AUTHOR,
    source: 'local',
  };
}

export async function getDailyQuote(
  options: QuoteOptions = {},
): Promise<Quote> {
  const {
    storage = defaultStorage(),
    fetcher = globalThis.fetch?.bind(globalThis),
    signal,
    now = new Date(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const today = localDateKey(now);
  const cachedResult = dailyCache.safeParse(readJson(storage, DAILY_CACHE_KEY));
  const cached =
    cachedResult.success && cachedResult.data.text.trim()
      ? cachedResult.data
      : null;
  if (cached && cached.date === today) {
    return { text: cached.text, author: cached.author, source: 'cache' };
  }
  try {
    if (!fetcher) throw new Error('Fetch is unavailable.');
    const data = dailyResponse.parse(
      await fetchJson(DAILY_QUOTE_URL, fetcher, signal, timeoutMs),
    );
    const entry = cleanEntry(data.data);
    if (!entry) throw new Error('Quote was empty.');
    writeJson(storage, DAILY_CACHE_KEY, { date: today, ...entry });
    return { ...entry, source: 'cdn' };
  } catch {
    if (cached)
      return { text: cached.text, author: cached.author, source: 'cache' };
    return localReflectionQuote(now);
  }
}

function readList(storage: Storage | undefined) {
  const parsed = listCache.safeParse(readJson(storage, LIST_CACHE_KEY));
  if (!parsed.success || !parsed.data.quotes.length) return null;
  return parsed.data;
}

function pick(
  quotes: Entry[],
  exclude: string | undefined,
  random: () => number,
  source: Quote['source'],
): Quote {
  const pool =
    quotes.length > 1 ? quotes.filter(({ text }) => text !== exclude) : quotes;
  const list = pool.length ? pool : quotes;
  const index = Math.min(list.length - 1, Math.floor(random() * list.length));
  return { ...list[index]!, source };
}

export async function getRandomQuote(
  options: QuoteOptions & { exclude?: string; random?: () => number } = {},
): Promise<Quote> {
  const {
    storage = defaultStorage(),
    fetcher = globalThis.fetch?.bind(globalThis),
    signal,
    now = new Date(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    exclude,
    random = Math.random,
  } = options;
  const cached = readList(storage);
  const age = cached ? now.getTime() - Date.parse(cached.fetchedAt) : Infinity;
  if (cached && age >= 0 && age < LIST_TTL_MS) {
    return pick(cached.quotes, exclude, random, 'cache');
  }
  try {
    if (!fetcher) throw new Error('Fetch is unavailable.');
    const data = listResponse.parse(
      await fetchJson(QUOTE_LIST_URL, fetcher, signal, timeoutMs),
    );
    const quotes = data.data
      .map(cleanEntry)
      .filter((entry): entry is Entry => entry !== null);
    if (!quotes.length) throw new Error('Quote list was empty.');
    writeJson(storage, LIST_CACHE_KEY, {
      fetchedAt: now.toISOString(),
      quotes,
    });
    return pick(quotes, exclude, random, 'cdn');
  } catch {
    if (cached) return pick(cached.quotes, exclude, random, 'cache');
    const start = Math.floor(random() * reflections.length);
    for (let step = 0; step < reflections.length; step++) {
      const text = reflections[(start + step) % reflections.length]!;
      if (text !== exclude)
        return { text, author: REFLECTION_AUTHOR, source: 'local' };
    }
    return localReflectionQuote(now);
  }
}
