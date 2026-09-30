import { backgroundPhotos } from '@/data/backgrounds';
import {
  LEGACY_FACEBOOK_URL,
  createDefaultConfig,
  defaultGroups,
  defaultShortcuts,
} from '@/data/defaults';
import {
  normalizeImageUrl,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function upgradeConfig(raw: unknown): unknown {
  if (!isRecord(raw) || raw.version !== 1) return raw;
  const upgraded: Record<string, unknown> = {
    ...raw,
    version: 2,
    appearance: { background: { kind: 'field', photo: 'bg' } },
  };
  const currentFacebook = defaultShortcuts.find(
    ({ id }) => id === 'facebook-messages',
  )!;
  const slack = defaultShortcuts.find(({ id }) => id === 'slack')!;
  if (Array.isArray(raw.shortcuts)) {
    let shortcuts: unknown[] = raw.shortcuts.map((entry) =>
      isRecord(entry) &&
      entry.id === 'facebook-messages' &&
      entry.source === 'default' &&
      entry.url === LEGACY_FACEBOOK_URL
        ? { ...entry, url: currentFacebook.url }
        : entry,
    );
    if (!shortcuts.some((entry) => isRecord(entry) && entry.id === 'slack')) {
      const maxOrder = shortcuts.reduce<number>(
        (max, entry) =>
          isRecord(entry) && typeof entry.order === 'number'
            ? Math.max(max, entry.order)
            : max,
        -1,
      );
      shortcuts = [...shortcuts, { ...slack, order: maxOrder + 1 }];
    }
    upgraded.shortcuts = shortcuts;
  }
  if (
    Array.isArray(raw.groups) &&
    !raw.groups.some((group) => isRecord(group) && group.id === 'work')
  ) {
    const work = defaultGroups.find(({ id }) => id === 'work')!;
    upgraded.groups = [...raw.groups, { ...work }];
  }
  return upgraded;
}

function legacyBackground(value: string | undefined) {
  if (!value) return undefined;
  if (value === '/images/bg.jpeg')
    return { kind: 'photo' as const, photo: 'bg' };
  const match = /^\/images\/bg\/(bg\d{3})\.jpg$/.exec(value);
  if (match) {
    const id = match[1]!;
    return backgroundPhotos.some((photo) => photo.id === id)
      ? { kind: 'photo' as const, photo: id }
      : undefined;
  }
  try {
    return {
      kind: 'custom' as const,
      photo: 'bg',
      customUrl: normalizeImageUrl(value),
    };
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

  const background = legacyBackground(readString(storage, 'bg-image-url'));
  if (background) config.appearance.background = background;

  config.updatedAt = new Date().toISOString();
  return { config: startPageConfigSchema.parse(config), foundLegacyData };
}
