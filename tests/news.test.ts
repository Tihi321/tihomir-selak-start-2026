// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  NEWS_CACHE_PREFIX,
  NEWS_FEEDS,
  getNews,
  parseFeed,
} from '@/lib/news/rss';
import { fetchJson, fetchText } from '@/lib/cdn/fetch';

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

const rss = (items: string) =>
  `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>T</title>${items}</channel></rss>`;

const rssFixture = rss(`
<item>
  <title>First &amp; foremost</title>
  <link>https://example.com/a</link>
  <guid isPermaLink="false">a-1</guid>
  <description><![CDATA[<p>Hello <b>world</b></p><script>alert(1)</script><style>p{color:red}</style>]]></description>
  <pubDate>Tue, 29 Sep 2026 17:45:00 Z</pubDate>
  <enclosure length="1" type="image/jpeg" url="https://example.com/a.jpg" />
</item>
<item>
  <title>Second</title>
  <link>https://example.com/b</link>
  <description>Plain</description>
  <media:thumbnail url="https://example.com/b.png" />
</item>`);

const atomFixture = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>V</title>
  <entry>
    <title type="html"><![CDATA[Caf&eacute; &#8217;s <i>news</i>]]></title>
    <link rel="alternate" type="text/html" href="https://example.com/v1" />
    <id>https://example.com/?p=1</id>
    <updated>2026-09-29T20:26:57-04:00</updated>
    <summary type="html"><![CDATA[Some <a href="x">summary</a>.]]></summary>
  </entry>
  <entry>
    <title>By id</title>
    <id>https://example.com/v2</id>
    <content type="html">Body text</content>
  </entry>
</feed>`;

describe('parseFeed', () => {
  it('reads RSS items with dates and images', () => {
    const items = parseFeed(rssFixture);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'a-1',
      title: 'First & foremost',
      url: 'https://example.com/a',
      summary: 'Hello world',
      image: 'https://example.com/a.jpg',
      publishedAt: '2026-09-29T17:45:00.000Z',
    });
    expect(items[1]!.image).toBe('https://example.com/b.png');
    expect(items[1]!.id).toBe('https://example.com/b');
  });

  it('reads Atom entries, falling back to the id for the link', () => {
    const items = parseFeed(atomFixture);
    expect(items.map((item) => item.url)).toEqual([
      'https://example.com/v1',
      'https://example.com/v2',
    ]);
    expect(items[0]!.summary).toBe('Some summary.');
    expect(items[0]!.title).not.toContain('<');
    expect(items[0]!.publishedAt).toBe('2026-09-30T00:26:57.000Z');
    expect(items[1]!.summary).toBe('Body text');
  });

  it('strips markup and never leaks script or style text', () => {
    const [item] = parseFeed(rssFixture);
    expect(item!.summary).not.toMatch(/alert|color|</);
  });

  it('decodes HTML entities in titles', () => {
    const xml = rss(
      '<item><title>Tom &amp;amp; Jerry &amp;lt;b&amp;gt;</title><link>https://example.com/t</link></item>',
    );
    expect(parseFeed(xml)[0]!.title).toBe('Tom & Jerry <b>');
  });

  it('drops items with non-https links and keeps items with bad images', () => {
    const xml = rss(`
      <item><title>Http</title><link>http://example.com/x</link></item>
      <item><title>JS</title><link>javascript:alert(1)</link></item>
      <item><title>Creds</title><link>https://user:pw@example.com/x</link></item>
      <item><title>Img</title><link>https://example.com/img</link>
        <enclosure type="image/png" url="http://example.com/i.png" /></item>`);
    const items = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('Img');
    expect(items[0]!.image).toBeUndefined();
  });

  it('de-duplicates by url', () => {
    const one =
      '<item><title>Same</title><link>https://example.com/s</link></item>';
    expect(parseFeed(rss(one + one))).toHaveLength(1);
  });

  it('truncates long summaries to 280 characters with an ellipsis', () => {
    const xml = rss(
      `<item><title>Long</title><link>https://example.com/l</link><description>${'word '.repeat(200)}</description></item>`,
    );
    const summary = parseFeed(xml)[0]!.summary;
    expect(summary.length).toBeLessThanOrEqual(280);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('returns at most 50 items', () => {
    const many = Array.from(
      { length: 70 },
      (_, i) =>
        `<item><title>N${i}</title><link>https://example.com/${i}</link></item>`,
    ).join('');
    expect(parseFeed(rss(many))).toHaveLength(50);
  });

  it('returns nothing for malformed or empty input', () => {
    expect(parseFeed('<rss><channel><item>')).toEqual([]);
    expect(parseFeed('not xml at all')).toEqual([]);
    expect(parseFeed('')).toEqual([]);
  });
});

const xmlFetcher = (body: string, status = 200) =>
  vi.fn(
    async (..._args: unknown[]) => new Response(body, { status }),
  ) as unknown as typeof fetch & { mock: { calls: unknown[][] } };
const failing = () =>
  vi.fn(async () => {
    throw new Error('offline');
  }) as unknown as typeof fetch & { mock: { calls: unknown[][] } };
const t0 = new Date('2026-09-30T10:00:00Z');
const key = `${NEWS_CACHE_PREFIX}bug`;

describe('getNews', () => {
  it('fetches on a miss and writes the cache', async () => {
    const storage = new MemoryStorage();
    const fetcher = xmlFetcher(rssFixture);
    const result = await getNews('bug', {
      storage: storage.asStorage(),
      fetcher,
      now: t0,
    });
    expect(result).toMatchObject({ source: 'cdn', stale: false });
    expect(result.items).toHaveLength(2);
    expect(fetcher.mock.calls[0]![0]).toBe(NEWS_FEEDS.bug.url);
    const cached = JSON.parse(storage.getItem(key)!);
    expect(cached.fetchedAt).toBe(t0.toISOString());
    expect(cached.items).toHaveLength(2);
  });

  it('uses a fresh cache without calling the network', async () => {
    const storage = new MemoryStorage();
    await getNews('bug', {
      storage: storage.asStorage(),
      fetcher: xmlFetcher(rssFixture),
      now: t0,
    });
    const fetcher = xmlFetcher(rssFixture);
    const result = await getNews('bug', {
      storage: storage.asStorage(),
      fetcher,
      now: new Date(t0.getTime() + 30 * 60 * 1000),
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(result).toMatchObject({ source: 'cache', stale: false });
  });

  it('falls back to stale cache when the fetch fails', async () => {
    const storage = new MemoryStorage();
    await getNews('bug', {
      storage: storage.asStorage(),
      fetcher: xmlFetcher(rssFixture),
      now: t0,
    });
    const result = await getNews('bug', {
      storage: storage.asStorage(),
      fetcher: failing(),
      now: new Date(t0.getTime() + 2 * 60 * 60 * 1000),
    });
    expect(result).toMatchObject({ source: 'cache', stale: true });
    expect(result.items).toHaveLength(2);
  });

  it('returns an error result with no cache', async () => {
    const result = await getNews('verge', {
      storage: new MemoryStorage().asStorage(),
      fetcher: failing(),
      now: t0,
    });
    expect(result).toEqual({
      items: [],
      error: expect.stringContaining('The Verge'),
    });
  });

  it('treats malformed XML and HTTP errors as failures', async () => {
    const storage = new MemoryStorage().asStorage();
    expect(
      'error' in
        (await getNews('bug', { storage, fetcher: xmlFetcher('<rss><item>') })),
    ).toBe(true);
    expect(
      'error' in
        (await getNews('bug', { storage, fetcher: xmlFetcher('x', 500) })),
    ).toBe(true);
    expect(storage.getItem(key)).toBeNull();
  });
});

describe('fetchText and fetchJson', () => {
  const hanging = ((_url: string, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      void reject;
      void init;
    })) as unknown as typeof fetch;

  it('times out a hanging request', async () => {
    await expect(
      fetchText('https://x.test', hanging, undefined, 20),
    ).rejects.toThrow('Request was cancelled.');
    await expect(
      fetchJson('https://x.test', hanging, undefined, 20),
    ).rejects.toThrow('Request was cancelled.');
  });

  it('honours an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchText('https://x.test', hanging, controller.signal, 5000),
    ).rejects.toThrow('Request was cancelled.');
  });

  it('reports non-ok statuses and returns text', async () => {
    await expect(
      fetchText('https://x.test', xmlFetcher('no', 503), undefined, 1000),
    ).rejects.toThrow('Service returned 503.');
    await expect(
      fetchText('https://x.test', xmlFetcher('<a/>'), undefined, 1000),
    ).resolves.toBe('<a/>');
  });
});
