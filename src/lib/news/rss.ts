import { z } from 'zod';
import type { NewsSource } from '@/lib/config/schema';
import {
  defaultStorage,
  fetchText,
  readJson,
  writeJson,
} from '@/lib/cdn/fetch';

export const NEWS_FEEDS: Record<
  NewsSource,
  { label: string; url: string; homepage: string }
> = {
  bug: {
    label: 'Bug',
    url: 'https://cdn.tihomir-selak.from.hr/rss/bug.xml',
    homepage: 'https://www.bug.hr/',
  },
  verge: {
    label: 'The Verge',
    url: 'https://cdn.tihomir-selak.from.hr/rss/verge.xml',
    homepage: 'https://www.theverge.com/',
  },
  techcrunch: {
    label: 'TechCrunch',
    url: 'https://cdn.tihomir-selak.from.hr/rss/techcrunch.xml',
    homepage: 'https://techcrunch.com/',
  },
};

export const NEWS_CACHE_PREFIX = 'start-page:news:v1:';
export const NEWS_TTL_MS = 60 * 60 * 1000;
export const NEWS_MAX_ITEMS = 50;
export const NEWS_SUMMARY_LIMIT = 280;
const TITLE_LIMIT = 300;
const DEFAULT_TIMEOUT_MS = 9000;

function isHttps(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

const httpsUrl = z.string().max(2048).refine(isHttps, 'Use an HTTPS link.');

const newsItemSchema = z.object({
  id: z.string().min(1).max(2048),
  title: z.string().min(1).max(TITLE_LIMIT),
  url: httpsUrl,
  summary: z.string().max(NEWS_SUMMARY_LIMIT),
  image: httpsUrl.optional(),
  publishedAt: z.iso.datetime({ offset: true }).optional(),
});

export type NewsItem = z.infer<typeof newsItemSchema>;

export type NewsOptions = {
  storage?: Storage;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  now?: Date;
  timeoutMs?: number;
};

export type NewsResult =
  | { items: NewsItem[]; source: 'cdn' | 'cache'; stale: boolean }
  | { items: []; error: string };

const newsCache = z.object({
  fetchedAt: z.iso.datetime({ offset: true }),
  items: z.array(newsItemSchema),
});

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function htmlToText(value: string, parser: DOMParser): string {
  if (!value) return '';
  try {
    const doc = parser.parseFromString(value, 'text/html');
    doc
      .querySelectorAll('script, style, noscript, template')
      .forEach((node) => node.remove());
    return collapse(doc.body?.textContent ?? '');
  } catch {
    return '';
  }
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1).trimEnd()}…`;
}

function childrenOf(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter(
    (child) => (child.localName ?? child.tagName) === name,
  );
}

function childText(parent: Element, ...names: string[]): string {
  for (const name of names) {
    const [first] = childrenOf(parent, name);
    const text = first?.textContent?.trim();
    if (text) return text;
  }
  return '';
}

function toIsoDate(raw: string): string | undefined {
  if (!raw) return undefined;
  // Some feeds write "Tue, 29 Sep 2026 17:45:00 Z", which Date rejects.
  const time = Date.parse(raw.replace(/\sZ$/, ' GMT'));
  if (Number.isNaN(time)) return undefined;
  return new Date(time).toISOString();
}

function atomLink(entry: Element): string {
  const links = childrenOf(entry, 'link');
  const alternate = links.find((link) => {
    const rel = link.getAttribute('rel');
    return !rel || rel === 'alternate';
  });
  const href = (alternate ?? links[0])?.getAttribute('href')?.trim();
  if (href) return href;
  const id = childText(entry, 'id');
  return isHttps(id) ? id : '';
}

function rssLink(item: Element): string {
  const link = childText(item, 'link');
  if (link) return link;
  const guid = childText(item, 'guid');
  return isHttps(guid) ? guid : '';
}

function itemImage(item: Element): string | undefined {
  for (const enclosure of childrenOf(item, 'enclosure')) {
    const type = enclosure.getAttribute('type') ?? '';
    const url = enclosure.getAttribute('url')?.trim();
    if (url && (!type || type.startsWith('image/'))) return url;
  }
  for (const name of ['content', 'thumbnail']) {
    for (const media of childrenOf(item, name)) {
      const url = media.getAttribute('url')?.trim();
      if (!url) continue;
      const type = media.getAttribute('type') ?? '';
      const medium = media.getAttribute('medium') ?? '';
      const image =
        name === 'thumbnail' ||
        !type ||
        type.startsWith('image/') ||
        medium === 'image';
      if (image) return url;
    }
  }
  return undefined;
}

function readEntry(
  element: Element,
  atom: boolean,
  parser: DOMParser,
): NewsItem | null {
  const url = atom ? atomLink(element) : rssLink(element);
  const title = truncate(
    htmlToText(childText(element, 'title'), parser),
    TITLE_LIMIT,
  );
  const summary = truncate(
    htmlToText(
      atom
        ? childText(element, 'summary', 'content')
        : childText(element, 'description', 'encoded'),
      parser,
    ),
    NEWS_SUMMARY_LIMIT,
  );
  const publishedAt = toIsoDate(
    atom
      ? childText(element, 'updated', 'published')
      : childText(element, 'pubDate', 'date'),
  );
  const rawImage = itemImage(element);
  const image = rawImage && isHttps(rawImage) ? rawImage : undefined;
  const parsed = newsItemSchema.safeParse({
    id: childText(element, atom ? 'id' : 'guid') || url,
    title,
    url,
    summary,
    ...(image ? { image } : {}),
    ...(publishedAt ? { publishedAt } : {}),
  });
  return parsed.success ? parsed.data : null;
}

export function parseFeed(xml: string, parser?: DOMParser): NewsItem[] {
  try {
    const dom = parser ?? new DOMParser();
    const doc = dom.parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) return [];
    const atom = doc.getElementsByTagName('entry').length > 0;
    const elements = Array.from(
      doc.getElementsByTagName(atom ? 'entry' : 'item'),
    );
    const seen = new Set<string>();
    const items: NewsItem[] = [];
    for (const element of elements) {
      const item = readEntry(element, atom, dom);
      if (!item || seen.has(item.url)) continue;
      seen.add(item.url);
      items.push(item);
      if (items.length >= NEWS_MAX_ITEMS) break;
    }
    return items;
  } catch {
    return [];
  }
}

export async function getNews(
  source: NewsSource,
  options: NewsOptions = {},
): Promise<NewsResult> {
  const {
    storage = defaultStorage(),
    fetcher = globalThis.fetch?.bind(globalThis),
    signal,
    now = new Date(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const key = `${NEWS_CACHE_PREFIX}${source}`;
  const parsedCache = newsCache.safeParse(readJson(storage, key));
  const cached =
    parsedCache.success && parsedCache.data.items.length
      ? parsedCache.data
      : null;
  const age = cached ? now.getTime() - Date.parse(cached.fetchedAt) : Infinity;
  if (cached && age >= 0 && age < NEWS_TTL_MS) {
    return { items: cached.items, source: 'cache', stale: false };
  }
  try {
    if (!fetcher) throw new Error('Fetch is unavailable.');
    const xml = await fetchText(
      NEWS_FEEDS[source].url,
      fetcher,
      signal,
      timeoutMs,
    );
    const items = parseFeed(xml);
    if (!items.length) throw new Error('The feed had no readable items.');
    writeJson(storage, key, { fetchedAt: now.toISOString(), items });
    return { items, source: 'cdn', stale: false };
  } catch {
    if (cached) return { items: cached.items, source: 'cache', stale: true };
    return {
      items: [],
      error: `Could not load ${NEWS_FEEDS[source].label} news right now.`,
    };
  }
}
