import { z } from 'zod';
import {
  defaultStorage,
  fetchJson,
  localDateKey,
  readJson,
  writeJson,
} from '@/lib/cdn/fetch';

export type DailyWord = {
  word: string;
  meaning: string;
  source: 'cdn' | 'cache';
};
export type WordOptions = {
  storage?: Storage;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  now?: Date;
  timeoutMs?: number;
};

export const DAILY_WORD_URL =
  'https://cdn.tihomir-selak.from.hr/daily/vocabulary-word-eng.json';
export const WORD_CACHE_KEY = 'start-page:word:daily';
const DEFAULT_TIMEOUT_MS = 9000;

const response = z.object({
  data: z.object({ name: z.string(), detail: z.string() }),
});
const cache = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  word: z.string(),
  meaning: z.string(),
});

export async function getDailyWord(
  options: WordOptions = {},
): Promise<DailyWord | null> {
  const {
    storage = defaultStorage(),
    fetcher = globalThis.fetch?.bind(globalThis),
    signal,
    now = new Date(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const today = localDateKey(now);
  const cachedResult = cache.safeParse(readJson(storage, WORD_CACHE_KEY));
  const cached =
    cachedResult.success &&
    cachedResult.data.word.trim() &&
    cachedResult.data.meaning.trim()
      ? cachedResult.data
      : null;
  if (cached && cached.date === today)
    return { word: cached.word, meaning: cached.meaning, source: 'cache' };
  try {
    if (!fetcher) throw new Error('Fetch is unavailable.');
    const data = response.parse(
      await fetchJson(DAILY_WORD_URL, fetcher, signal, timeoutMs),
    );
    const word = data.data.name.trim();
    const meaning = data.data.detail.trim();
    if (!word || !meaning) throw new Error('Word was empty.');
    writeJson(storage, WORD_CACHE_KEY, { date: today, word, meaning });
    return { word, meaning, source: 'cdn' };
  } catch {
    return cached
      ? { word: cached.word, meaning: cached.meaning, source: 'cache' }
      : null;
  }
}
