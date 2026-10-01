import { describe, expect, it } from 'vitest';
import { backgroundPhotos, photoById, randomPhotoId } from '@/data/backgrounds';
import { createDefaultConfig } from '@/data/defaults';
import {
  buildProviderUrl,
  providersFor,
  resolveFamilyDefault,
  searchFamilyIds,
  searchProviders,
} from '@/data/providers';
import { migrateLegacyConfig, upgradeConfig } from '@/lib/config/migration';
import {
  normalizeImageUrl,
  normalizeShortcutUrl,
  startPageConfigSchema,
} from '@/lib/config/schema';
import {
  BACKUP_KEY,
  CONFIG_KEY,
  MIGRATION_KEY,
  exportConfig,
  loadConfig,
  mergeConfigs,
  parseConfig,
  saveConfig,
} from '@/lib/config/storage';

class MemoryStorage {
  values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
  asStorage() {
    return this as unknown as Storage;
  }
}

describe('search URL contracts', () => {
  it('encodes a query and opens a provider homepage for an empty query', () => {
    const google = searchProviders.find(({ id }) => id === 'google')!;
    expect(buildProviderUrl(google, 'cats & dogs')).toBe(
      'https://www.google.com/search?q=cats%20%26%20dogs',
    );
    expect(buildProviderUrl(google, '   ')).toBe(google.homepage);
  });

  it.each([
    ['perplexity', 'https://www.perplexity.ai/search?q=a%20%26%20b%C4%8D'],
    ['chatgpt', 'https://chatgpt.com/?q=a%20%26%20b%C4%8D&hints=search'],
    [
      'copilot',
      'https://www.bing.com/search?showconv=1&sendquery=1&q=a%20%26%20b%C4%8D',
    ],
    ['mistral', 'https://chat.mistral.ai/chat?q=a%20%26%20b%C4%8D'],
    ['grok', 'https://grok.com/?q=a%20%26%20b%C4%8D'],
    ['claude', 'https://claude.ai/new?q=a%20%26%20b%C4%8D'],
    [
      'skillshare',
      'https://www.skillshare.com/en/search?query=a%20%26%20b%C4%8D',
    ],
    [
      'udemy',
      'https://www.udemy.com/courses/search/?src=ukw&q=a%20%26%20b%C4%8D',
    ],
    ['zenva', 'https://academy.zenva.com/search/?s=a%20%26%20b%C4%8D'],
    ['gamedev', 'https://www.gamedev.tv/courses/?query=a%20%26%20b%C4%8D'],
    ['pixabay', 'https://pixabay.com/music/search/a%20%26%20b%C4%8D/'],
    [
      'chosic',
      'https://www.chosic.com/free-music/all/?keyword=a%20%26%20b%C4%8D',
    ],
  ])('builds an encoded prompt URL for %s', (id, expected) => {
    const provider = searchProviders.find((item) => item.id === id)!;
    expect(buildProviderUrl(provider, 'a & bč')).toBe(expected);
    expect(buildProviderUrl(provider, ' ')).toBe(provider.homepage);
  });

  it('gives every provider a template and every family a provider', () => {
    for (const provider of searchProviders) {
      expect(provider.queryTemplate).toContain('{query}');
      expect(new URL(provider.homepage).protocol).toBe('https:');
    }
    for (const family of searchFamilyIds)
      expect(providersFor(family).length).toBeGreaterThan(0);
    expect(searchProviders.find(({ id }) => id === 'zenva')!.homepage).toBe(
      'https://academy.zenva.com/',
    );
  });

  it('resolves family defaults and falls back on a mismatch', () => {
    const { search } = createDefaultConfig();
    expect(resolveFamilyDefault(search, 'ai').id).toBe('perplexity');
    expect(
      resolveFamilyDefault(
        { defaults: { ...search.defaults, ai: 'claude' } },
        'ai',
      ).id,
    ).toBe('claude');
    expect(
      resolveFamilyDefault(
        { defaults: { ...search.defaults, ai: 'google' } },
        'ai',
      ).id,
    ).toBe(providersFor('ai')[0]!.id);
    expect(
      resolveFamilyDefault(
        { defaults: { ...search.defaults, video: 'nope' } },
        'video',
      ).family,
    ).toBe('video');
  });

  it('builds a YouTube results URL with punctuation safely encoded', () => {
    const youtube = searchProviders.find(({ id }) => id === 'youtube')!;
    expect(buildProviderUrl(youtube, 'ambient & focus')).toBe(
      'https://www.youtube.com/results?search_query=ambient%20%26%20focus',
    );
  });
});

describe('shortcut address validation', () => {
  it('normalizes a bare host and accepts mailto', () => {
    expect(normalizeShortcutUrl('example.com')).toBe('https://example.com/');
    expect(normalizeShortcutUrl('mailto:hello@example.com')).toBe(
      'mailto:hello@example.com',
    );
  });

  it.each([
    'http://example.com',
    'javascript:alert(1)',
    'data:text/html,hello',
    'https://user:pass@example.com',
  ])('rejects unsafe address %s', (url) => {
    expect(() => normalizeShortcutUrl(url)).toThrow();
  });

  it('rejects duplicate shortcut IDs and a missing active weather location', () => {
    const config = createDefaultConfig();
    expect(() =>
      parseConfig({
        ...config,
        shortcuts: [config.shortcuts[0], config.shortcuts[0]],
      }),
    ).toThrow(/unique/);
    expect(() =>
      parseConfig({
        ...config,
        weather: { ...config.weather, activeLocationId: 'missing' },
      }),
    ).toThrow(/active location/);
    expect(() =>
      parseConfig({
        ...config,
        shortcuts: [{ ...config.shortcuts[0], url: 'javascript:alert(1)' }],
      }),
    ).toThrow();
  });
});

describe('local configuration recovery', () => {
  it('restores the last known good version when the primary record is malformed', () => {
    const storage = new MemoryStorage();
    const original = createDefaultConfig();
    storage.setItem(BACKUP_KEY, JSON.stringify(original));
    storage.setItem(CONFIG_KEY, '{broken');
    const result = loadConfig(storage.asStorage());
    expect(result.recovered).toBe(true);
    expect(result.config.shortcuts).toHaveLength(original.shortcuts.length);
    expect(storage.getItem(CONFIG_KEY)).toBe(JSON.stringify(result.config));
  });

  it('does not overwrite a newer version on load or save', () => {
    const storage = new MemoryStorage();
    const future = JSON.stringify({ version: 4, kept: 'future data' });
    storage.setItem(CONFIG_KEY, future);
    const result = loadConfig(storage.asStorage());
    expect(result.readOnly).toBe(true);
    expect(result.notice).toMatch(/newer version/);
    expect(storage.getItem(CONFIG_KEY)).toBe(future);
    expect(() =>
      saveConfig(storage.asStorage(), createDefaultConfig()),
    ).toThrow(/newer browser settings/i);
    expect(storage.getItem(CONFIG_KEY)).toBe(future);
  });

  it('round-trips exports and merges shortcuts and saved locations by id', () => {
    const first = createDefaultConfig();
    const second = createDefaultConfig();
    second.shortcuts = [
      ...second.shortcuts,
      { ...second.shortcuts[0]!, id: 'extra', label: 'Extra', order: 55 },
    ];
    second.weather.locations.push({
      id: 'zagreb',
      label: 'Zagreb',
      latitude: 45.815,
      longitude: 15.9819,
      timezone: 'Europe/Zagreb',
      order: 1,
    });
    expect(
      startPageConfigSchema.parse(JSON.parse(exportConfig(first))).version,
    ).toBe(3);
    const merged = mergeConfigs(first, second);
    expect(merged.shortcuts.some(({ id }) => id === 'extra')).toBe(true);
    expect(merged.weather.locations.map(({ id }) => id)).toContain('zagreb');
  });
});

describe('legacy configuration migration', () => {
  it('imports custom links safely without interpreting panel visibility or background URL as shortcut visibility', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'shortcuts',
      JSON.stringify([
        { name: 'Example', url: 'https://example.com' },
        { name: 'Bad', url: 'javascript:alert(1)' },
      ]),
    );
    storage.setItem('showcustomshortcuts', 'false');
    storage.setItem('bg-image-url', 'https://unreviewed.example/image.jpg');
    const migrated = migrateLegacyConfig(storage.asStorage());
    const example = migrated.config.shortcuts.find(
      ({ label }) => label === 'Example',
    )!;
    expect(example.hidden).toBe(false);
    expect(example.source).toBe('migrated');
    expect(migrated.config.shortcuts.some(({ label }) => label === 'Bad')).toBe(
      false,
    );
    expect(migrated.config.appearance.background).toEqual({
      kind: 'custom',
      photo: 'bg',
      customUrl: 'https://unreviewed.example/image.jpg',
    });
  });

  it.each([
    ['/images/bg.jpeg', { kind: 'photo', photo: 'bg' }],
    ['/images/bg/bg007.jpg', { kind: 'photo', photo: 'bg007' }],
    [
      'https://img.example/a.jpg',
      { kind: 'custom', photo: 'bg', customUrl: 'https://img.example/a.jpg' },
    ],
    ['/images/bg/bg004.jpg', { kind: 'field', photo: 'bg' }],
    ['http://img.example/a.jpg', { kind: 'field', photo: 'bg' }],
    ['javascript:alert(1)', { kind: 'field', photo: 'bg' }],
    ['   ', { kind: 'field', photo: 'bg' }],
  ])('maps legacy bg-image-url %s', (value, expected) => {
    const storage = new MemoryStorage();
    storage.setItem('bg-image-url', value);
    expect(
      migrateLegacyConfig(storage.asStorage()).config.appearance.background,
    ).toEqual(expected);
  });

  it('migrates once and records completion', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'shortcuts',
      JSON.stringify([{ name: 'One', url: 'https://one.example' }]),
    );
    const first = loadConfig(storage.asStorage());
    const second = loadConfig(storage.asStorage());
    expect(first.migrated).toBe(true);
    expect(second.migrated).toBe(false);
    expect(storage.getItem(MIGRATION_KEY)).toBe('done');
    expect(
      second.config.shortcuts.filter(({ source }) => source === 'migrated'),
    ).toHaveLength(1);
  });
});

describe('legacy v3 mapping', () => {
  function legacy(values: Record<string, string>) {
    const storage = new MemoryStorage();
    for (const [key, value] of Object.entries(values))
      storage.setItem(key, value);
    return migrateLegacyConfig(storage.asStorage());
  }

  it('maps search engine keys to per-family defaults', () => {
    const { config } = legacy({
      'text-search-engine': 'brave',
      'ai-search-engine': 'mixtral',
      'video-search-engine': 'zenva',
      'music-search-engine': 'youtubemusic',
    });
    expect(config.search.family).toBe('web');
    expect(config.search.defaults).toEqual({
      web: 'brave',
      ai: 'mistral',
      video: 'zenva',
      music: 'youtube-music',
    });
  });

  it('falls back to the family default for removed providers', () => {
    const { config } = legacy({
      'ai-search-engine': 'morphic',
      'video-search-engine': 'udemy',
      'text-search-engine': 'phind',
    });
    expect(config.search.defaults.ai).toBe('perplexity');
    expect(config.search.defaults.web).toBe('google');
    expect(config.search.defaults.video).toBe('udemy');
  });

  it('migrates the ambient mix, level, playlist, muted names and volume', () => {
    const { config, foundLegacyData } = legacy({
      beats: JSON.stringify({
        Forest: 3.2,
        rain: 0,
        lofy: 2,
        bogus: 4,
        waves: 99,
      }),
      'audio-level': '10',
      customsongs: JSON.stringify([
        { name: 'Good Song', src: 'https://a.example/x.mp3' },
        { name: 'Insecure', src: 'http://a.example/y.mp3' },
        { name: 'Good Song', src: 'https://a.example/z.mp3' },
        { name: 'Script', src: 'javascript:alert(1)' },
      ]),
      'playlist-muted-songs': JSON.stringify(['Good Song', 'Unknown']),
      'playlist-audio-volume': '7.5',
    });
    expect(foundLegacyData).toBe(true);
    expect(config.audio.mix).toEqual({
      forest: 3.2,
      rain: 0,
      lofi: 2,
      waves: 10,
    });
    expect(config.audio.low).toBe(false);
    expect(config.audio.playlist.map(({ id }) => id)).toEqual([
      'good-song',
      'good-song-2',
    ]);
    expect(config.audio.muted).toEqual(['good-song']);
    expect(config.audio.playlistVolume).toBe(0.75);
  });

  it('treats audio-level 100 as low and never throws on bad input', () => {
    expect(legacy({ 'audio-level': '100' }).config.audio.low).toBe(true);
    const bad = legacy({
      beats: '{oops',
      customsongs: '[1,null,{"name":5}]',
      'playlist-muted-songs': '"x"',
      'playlist-audio-volume': 'abc',
      focus: 'true',
    });
    expect(bad.config.audio.mix).toEqual({});
    expect(bad.config.audio.playlist).toEqual([]);
    expect(bad.config.audio.playlistVolume).toBe(0.5);
    expect(bad.config.appearance.focus).toBe(true);
    expect(legacy({ focus: 'false' }).config.appearance.focus).toBe(false);
  });
});

describe('image address validation', () => {
  it('prefixes a bare host with https', () => {
    expect(normalizeImageUrl('img.example/a.jpg')).toBe(
      'https://img.example/a.jpg',
    );
  });

  it.each([
    'http://example.com/a.jpg',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'https://user:pass@example.com/a.jpg',
    '',
  ])('rejects unsafe image address %s', (url) => {
    expect(() => normalizeImageUrl(url)).toThrow();
  });

  it('rejects an http custom URL in the schema', () => {
    const config = createDefaultConfig();
    expect(() =>
      parseConfig({
        ...config,
        appearance: {
          focus: false,
          background: {
            kind: 'custom',
            photo: 'bg',
            customUrl: 'http://example.com/a.jpg',
          },
        },
      }),
    ).toThrow();
  });
});

type Loose = Record<string, unknown>;

function v1Config() {
  const config = createDefaultConfig() as unknown as Loose;
  const shortcuts = (config.shortcuts as Loose[]).filter(
    ({ id }) => id !== 'slack',
  );
  return {
    ...config,
    version: 1,
    appearance: { theme: 'night', background: 'quiet-night' },
    shortcuts: shortcuts.map((shortcut) =>
      shortcut.id === 'facebook-messages'
        ? { ...shortcut, url: 'https://www.facebook.com/messages/e2ee/' }
        : shortcut,
    ) as Loose[],
    groups: config.groups as Loose[],
  } as Loose & { shortcuts: Loose[]; groups: Loose[] };
}

describe('v1 to v2 upgrade', () => {
  it('maps appearance, updates Facebook, adds Slack, and does not mutate input', () => {
    const input = v1Config();
    const snapshot = JSON.stringify(input);
    const upgraded = parseConfig(input);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(upgraded.version).toBe(3);
    expect(upgraded.appearance).toEqual({
      background: { kind: 'field', photo: 'bg' },
      focus: false,
    });
    expect(
      upgraded.shortcuts.find(({ id }) => id === 'facebook-messages')!.url,
    ).toBe('https://www.facebook.com/messages/');
    const slack = upgraded.shortcuts.filter(({ id }) => id === 'slack');
    expect(slack).toHaveLength(1);
    expect(slack[0]!.order).toBe(
      Math.max(...input.shortcuts.map(({ order }) => Number(order))) + 1,
    );
  });

  it('leaves a user-edited Facebook URL and a user-source shortcut untouched', () => {
    const input = v1Config();
    input.shortcuts = input.shortcuts.map((shortcut) =>
      shortcut.id === 'facebook-messages'
        ? { ...shortcut, url: 'https://example.com/fb' }
        : shortcut,
    );
    expect(
      parseConfig(input).shortcuts.find(({ id }) => id === 'facebook-messages')!
        .url,
    ).toBe('https://example.com/fb');

    const asUser = v1Config();
    asUser.shortcuts = asUser.shortcuts.map((shortcut) =>
      shortcut.id === 'facebook-messages'
        ? { ...shortcut, source: 'user' }
        : shortcut,
    );
    expect(
      parseConfig(asUser).shortcuts.find(
        ({ id }) => id === 'facebook-messages',
      )!.url,
    ).toBe('https://www.facebook.com/messages/e2ee/');
  });

  it('adds Slack once and is idempotent', () => {
    const once = upgradeConfig(v1Config());
    expect(upgradeConfig(once)).toEqual(once);
    const again = parseConfig(parseConfig(v1Config()));
    expect(again.shortcuts.filter(({ id }) => id === 'slack')).toHaveLength(1);
  });

  it('restores the work group when a v1 config lacks it', () => {
    const input = v1Config();
    input.groups = input.groups.filter(({ id }) => id !== 'work');
    input.shortcuts = input.shortcuts.filter(
      ({ groupId }) => groupId !== 'work',
    );
    expect(parseConfig(input).groups.some(({ id }) => id === 'work')).toBe(
      true,
    );
  });

  it('upgrades and persists a stored v1 config on load', () => {
    const storage = new MemoryStorage();
    storage.setItem(CONFIG_KEY, JSON.stringify(v1Config()));
    const result = loadConfig(storage.asStorage());
    expect(result.config.version).toBe(3);
    expect(result.readOnly).toBeUndefined();
    const stored = JSON.parse(storage.getItem(CONFIG_KEY)!);
    expect(stored.version).toBe(3);
    expect(stored.appearance.background.kind).toBe('field');
  });

  it('accepts a v1 backup through parseConfig and merge', () => {
    const imported = parseConfig(JSON.parse(JSON.stringify(v1Config())));
    expect(imported.version).toBe(3);
    expect(mergeConfigs(createDefaultConfig(), imported).version).toBe(3);
  });
});

describe('v2 to v3 upgrade', () => {
  function v2Config(defaultProvider: string, recent: string[] = []) {
    const base = createDefaultConfig() as unknown as Loose;
    delete base.audio;
    delete base.word;
    delete base.news;
    return {
      ...base,
      version: 2,
      search: { defaultProvider, recentProviders: recent },
      appearance: { background: { kind: 'field', photo: 'bg' } },
      audio: { enabled: false, volume: 0.55 },
    };
  }

  it('moves defaultProvider into its family and keeps recents per family', () => {
    const config = parseConfig(v2Config('chatgpt', ['spotify', 'udemy', 'x']));
    expect(config.version).toBe(3);
    expect(config.search.family).toBe('ai');
    expect(config.search.defaults).toEqual({
      web: 'google',
      ai: 'chatgpt',
      video: 'udemy',
      music: 'spotify',
    });
    expect(config.search.recentProviders).toEqual(['spotify', 'udemy', 'x']);
    expect(config.appearance.focus).toBe(false);
    expect(config.word).toEqual({ enabled: true });
    expect(config.news.source).toBe('bug');
    expect(config.audio).toEqual(createDefaultConfig().audio);
  });

  it('is idempotent and walks v1 all the way to v3', () => {
    const once = upgradeConfig(v2Config('google'));
    expect(upgradeConfig(once)).toEqual(once);
    expect(parseConfig(v1Config()).version).toBe(3);
  });

  it('stays read-only for a newer version', () => {
    const storage = new MemoryStorage();
    storage.setItem(CONFIG_KEY, JSON.stringify({ version: 4 }));
    expect(loadConfig(storage.asStorage()).readOnly).toBe(true);
  });
});

describe('v3 sections', () => {
  it('validates news presets, audio mix and playlist URLs', () => {
    const config = createDefaultConfig();
    const withAudio = (audio: object) => ({
      ...config,
      audio: { ...config.audio, ...audio },
    });
    expect(() => parseConfig(withAudio({ mix: { rain: 3.5 } }))).not.toThrow();
    expect(() => parseConfig(withAudio({ mix: { rain: 11 } }))).toThrow();
    expect(() => parseConfig(withAudio({ mix: { nope: 1 } }))).toThrow();
    expect(() =>
      parseConfig(
        withAudio({
          playlist: [{ id: 'a', name: 'A', url: 'mailto:a@example.com' }],
        }),
      ),
    ).toThrow();
    expect(() =>
      parseConfig({
        ...config,
        news: {
          ...config.news,
          presets: [{ id: 'p', name: 'x'.repeat(33), query: 'q' }],
        },
      }),
    ).toThrow();
  });

  it('merges playlists and presets without duplicate ids', () => {
    const a = createDefaultConfig();
    const b = createDefaultConfig();
    a.audio.playlist = [{ id: 'one', name: 'One', url: 'https://a.example/1' }];
    b.audio.playlist = [
      { id: 'one', name: 'One v2', url: 'https://a.example/1b' },
      { id: 'two', name: 'Two', url: 'https://a.example/2' },
    ];
    a.news.presets = [{ id: 'p1', name: 'AI', query: 'ai' }];
    b.news.presets = [{ id: 'p1', name: 'AI', query: 'ai' }];
    b.news.source = 'verge';
    const merged = mergeConfigs(a, b);
    expect(merged.audio.playlist.map(({ id }) => id)).toEqual(['one', 'two']);
    expect(merged.audio.playlist[0]!.name).toBe('One v2');
    expect(merged.news.presets).toHaveLength(1);
    expect(merged.news.source).toBe('verge');
  });
});

describe('default links', () => {
  it('has the new Facebook and Slack links and 13 favorites', () => {
    const config = createDefaultConfig();
    expect(
      config.shortcuts.find(({ id }) => id === 'facebook-messages')!.url,
    ).toBe('https://www.facebook.com/messages/');
    const slack = config.shortcuts.find(({ id }) => id === 'slack')!;
    expect(slack.url).toBe(
      'https://app.slack.com/client/T03TQ1AE0/C01R9LA2UTW',
    );
    expect(slack.favorite).toBe(true);
    expect(config.shortcuts.filter(({ favorite }) => favorite)).toHaveLength(
      13,
    );
  });
});

describe('background photos', () => {
  it('lists bg plus 19 numbered photos without bg004', () => {
    expect(backgroundPhotos).toHaveLength(20);
    expect(backgroundPhotos.some(({ id }) => id === 'bg004')).toBe(false);
    expect(photoById('nope').id).toBe('bg');
    expect(randomPhotoId('bg', () => 0)).not.toBe('bg');
    expect(randomPhotoId('bg001', () => 0.999999)).not.toBe('bg001');
  });
});

describe('favoriteOrder', () => {
  it('parses configs with and without favoriteOrder and round-trips it', () => {
    const config = createDefaultConfig();
    expect(() => parseConfig(config)).not.toThrow();
    const ordered = {
      ...config,
      shortcuts: config.shortcuts.map((item, index) =>
        item.favorite ? { ...item, favoriteOrder: 100 - index } : item,
      ),
    };
    const parsed = parseConfig(ordered);
    const first = parsed.shortcuts.find(({ favorite }) => favorite)!;
    expect(first.favoriteOrder).toBeTypeOf('number');
    const exported = parseConfig(JSON.parse(exportConfig(parsed)));
    expect(
      exported.shortcuts.map(({ favoriteOrder }) => favoriteOrder),
    ).toEqual(parsed.shortcuts.map(({ favoriteOrder }) => favoriteOrder));
    const merged = mergeConfigs(createDefaultConfig(), parsed);
    expect(
      merged.shortcuts.find(({ id }) => id === first.id)!.favoriteOrder,
    ).toBe(first.favoriteOrder);
  });

  it('rejects an out-of-range favoriteOrder', () => {
    const config = createDefaultConfig();
    const bad = {
      ...config,
      shortcuts: [{ ...config.shortcuts[0]!, favoriteOrder: -1 }],
    };
    expect(() => parseConfig(bad)).toThrow();
  });
});
