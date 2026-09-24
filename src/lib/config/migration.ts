import { createDefaultConfig, defaultGroups } from '@/data/defaults';
import {
  normalizeShortcutUrl,
  startPageConfigSchema,
  type StartPageConfig,
} from './schema';

const providerAliases: Record<string, string> = {
  google: 'google',
  brave: 'brave',
  duckduckgo: 'duckduckgo',
  bing: 'bing',
  perplexity: 'perplexity',
  chatgpt: 'chatgpt',
  copilot: 'copilot',
  youtube: 'youtube',
  spotify: 'spotify',
  'youtube music': 'youtube-music',
  soundcloud: 'soundcloud',
};

function readString(storage: Storage, key: string): string | undefined {
  const value = storage.getItem(key)?.trim();
  return value || undefined;
}

function parseStoredJson(value: string | undefined): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function migrateLegacyConfig(storage: Storage): {
  config: StartPageConfig;
  foundLegacyData: boolean;
} {
  const config = createDefaultConfig();
  const legacyKeys = [
    'shortcuts',
    'showcustomshortcuts',
    'searchpresets',
    'ai-search-engine',
    'text-search-engine',
    'video-search-engine',
    'music-search-engine',
    'bg-image-url',
    'focus',
  ];
  const foundLegacyData = legacyKeys.some(
    (key) => storage.getItem(key) !== null,
  );
  if (!foundLegacyData) return { config, foundLegacyData };

  const dailyGroup = defaultGroups.find(({ id }) => id === 'daily')!;
  const custom = parseStoredJson(readString(storage, 'shortcuts'));
  if (Array.isArray(custom)) {
    const usedIds = new Set(config.shortcuts.map(({ id }) => id));
    let order = config.shortcuts.length;
    for (const [index, entry] of custom.entries()) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as {
        name?: unknown;
        label?: unknown;
        url?: unknown;
      };
      const label =
        typeof candidate.name === 'string'
          ? candidate.name.trim()
          : typeof candidate.label === 'string'
            ? candidate.label.trim()
            : '';
      if (!label || typeof candidate.url !== 'string') continue;
      try {
        const url = normalizeShortcutUrl(candidate.url);
        const baseId =
          `migrated-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || index}`.slice(
            0,
            70,
          );
        let id = baseId;
        let suffix = 2;
        while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
        usedIds.add(id);
        config.shortcuts.push({
          id,
          label: label.slice(0, 48),
          url,
          groupId: dailyGroup.id,
          icon: label.slice(0, 1).toUpperCase(),
          order: order++,
          hidden: false,
          favorite: true,
          source: 'migrated',
        });
      } catch {
        // Unsafe or incomplete legacy links are skipped rather than activated.
      }
    }
  }

  for (const [key, fallback] of [
    ['text-search-engine', 'google'],
    ['ai-search-engine', 'perplexity'],
    ['video-search-engine', 'youtube'],
    ['music-search-engine', 'spotify'],
  ] as const) {
    const value = readString(storage, key)?.toLowerCase();
    const provider = value ? providerAliases[value] : undefined;
    if (key === 'text-search-engine' && provider)
      config.search.defaultProvider = provider;
    if (
      key !== 'text-search-engine' &&
      provider &&
      !config.search.recentProviders.includes(provider)
    )
      config.search.recentProviders.push(provider);
    if (!value && key === 'text-search-engine')
      config.search.defaultProvider = fallback;
  }

  config.updatedAt = new Date().toISOString();
  return { config: startPageConfigSchema.parse(config), foundLegacyData };
}
