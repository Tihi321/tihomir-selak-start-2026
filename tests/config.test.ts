import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '@/data/defaults';
import { buildProviderUrl, searchProviders } from '@/data/providers';
import { migrateLegacyConfig } from '@/lib/config/migration';
import {
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
    const future = JSON.stringify({ version: 2, kept: 'future data' });
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
    ).toBe(1);
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
    expect(migrated.config.appearance).not.toHaveProperty('backgroundUrl');
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
