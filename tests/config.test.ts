import { describe, expect, it } from 'vitest';
import { backgroundPhotos, photoById, randomPhotoId } from '@/data/backgrounds';
import { createDefaultConfig } from '@/data/defaults';
import { buildProviderUrl, searchProviders } from '@/data/providers';
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

  it('does not invent a prompt route for AI providers', () => {
    const chatgpt = searchProviders.find(({ id }) => id === 'chatgpt')!;
    expect(buildProviderUrl(chatgpt, 'hello')).toBe('https://chatgpt.com/');
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
    const future = JSON.stringify({ version: 3, kept: 'future data' });
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
    ).toBe(2);
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
    expect(upgraded.version).toBe(2);
    expect(upgraded.appearance).toEqual({
      background: { kind: 'field', photo: 'bg' },
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
    expect(result.config.version).toBe(2);
    expect(result.readOnly).toBeUndefined();
    const stored = JSON.parse(storage.getItem(CONFIG_KEY)!);
    expect(stored.version).toBe(2);
    expect(stored.appearance.background.kind).toBe('field');
  });

  it('accepts a v1 backup through parseConfig and merge', () => {
    const imported = parseConfig(JSON.parse(JSON.stringify(v1Config())));
    expect(imported.version).toBe(2);
    expect(mergeConfigs(createDefaultConfig(), imported).version).toBe(2);
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
