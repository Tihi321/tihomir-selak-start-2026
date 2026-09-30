import { backgroundPhotos } from '@/data/backgrounds';
import {
  LEGACY_FACEBOOK_URL,
  createDefaultConfig,
  defaultGroups,
  defaultShortcuts,
} from '@/data/defaults';
import { trackIds } from '@/data/audio';
import {
  searchFamilyIds,
  searchProviders,
  type SearchFamily,
} from '@/data/providers';
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
  mixtral: 'mistral',
  claude: 'claude',
  grok: 'grok',
  youtube: 'youtube',
  skillshare: 'skillshare',
  udemy: 'udemy',
  zenva: 'zenva',
  gamedev: 'gamedev',
  spotify: 'spotify',
  youtubemusic: 'youtube-music',
  'youtube music': 'youtube-music',
  soundcloud: 'soundcloud',
  pixabay: 'pixabay',
  chosic: 'chosic',
};

const familyDefaults: Record<SearchFamily, string> = {
  web: 'google',
  ai: 'perplexity',
  video: 'youtube',
  music: 'soundcloud',
};

function providerFamily(id: unknown): SearchFamily | undefined {
  return searchProviders.find((provider) => provider.id === id)?.family;
}

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

function upgradeV2ToV3(raw: Record<string, unknown>): Record<string, unknown> {
  const oldSearch = isRecord(raw.search) ? raw.search : {};
  const recent = Array.isArray(oldSearch.recentProviders)
    ? oldSearch.recentProviders
    : [];
  const family = providerFamily(oldSearch.defaultProvider) ?? 'web';
  const defaults: Record<SearchFamily, string> = { ...familyDefaults };
  for (const item of searchFamilyIds) {
    if (item === family && typeof oldSearch.defaultProvider === 'string') {
      defaults[item] = oldSearch.defaultProvider;
      continue;
    }
    const match = recent.find(
      (id): id is string =>
        typeof id === 'string' && providerFamily(id) === item,
    );
    if (match) defaults[item] = match;
  }
  const defaultConfig = createDefaultConfig();
  const appearance = isRecord(raw.appearance) ? raw.appearance : {};
  const { audio: _audio, ...rest } = raw;
  return {
    ...rest,
    version: 3,
    search: { family, defaults, recentProviders: recent },
    appearance: { ...appearance, focus: false },
    word: defaultConfig.word,
    news: defaultConfig.news,
    audio: defaultConfig.audio,
  };
}

export function upgradeConfig(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  if (raw.version === 1) raw = upgradeV1ToV2(raw);
  if (isRecord(raw) && raw.version === 2) raw = upgradeV2ToV3(raw);
  return raw;
}

function upgradeV1ToV2(raw: Record<string, unknown>): Record<string, unknown> {
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

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function migrateLegacyAudio(storage: Storage, config: StartPageConfig) {
  const beats = parseStoredJson(readString(storage, 'beats'));
  if (isRecord(beats)) {
    for (const [rawName, rawLevel] of Object.entries(beats)) {
      const lowered = rawName.trim().toLowerCase();
      const name = lowered === 'lofy' ? 'lofi' : lowered;
      const id = trackIds.find((track) => track === name);
      const level = Number(rawLevel);
      if (id && Number.isFinite(level))
        config.audio.mix[id] = Math.min(10, Math.max(0, level));
    }
  }

  const level = readString(storage, 'audio-level');
  if (level === '100') config.audio.low = true;
  else if (level === '10') config.audio.low = false;

  const songs = parseStoredJson(readString(storage, 'customsongs'));
  const idsByName = new Map<string, string>();
  if (Array.isArray(songs)) {
    const usedIds = new Set<string>();
    for (const entry of songs) {
      if (config.audio.playlist.length >= 100) break;
      if (!isRecord(entry)) continue;
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      const src = typeof entry.src === 'string' ? entry.src.trim() : '';
      if (!name || name.length > 80 || !src || src.length > 2048) continue;
      if (!isHttpsUrl(src)) continue;
      const baseId =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 70) || 'song';
      let id = baseId;
      let suffix = 2;
      while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
      usedIds.add(id);
      if (!idsByName.has(name)) idsByName.set(name, id);
      config.audio.playlist.push({ id, name, url: new URL(src).toString() });
    }
  }

  const muted = parseStoredJson(readString(storage, 'playlist-muted-songs'));
  if (Array.isArray(muted)) {
    for (const name of muted) {
      const id =
        typeof name === 'string' ? idsByName.get(name.trim()) : undefined;
      if (id && !config.audio.muted.includes(id)) config.audio.muted.push(id);
    }
  }

  const volume = Number(readString(storage, 'playlist-audio-volume'));
  if (readString(storage, 'playlist-audio-volume') && Number.isFinite(volume))
    config.audio.playlistVolume = Math.min(1, Math.max(0, volume / 10));
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
    'beats',
    'audio-level',
    'customsongs',
    'playlist-muted-songs',
    'playlist-audio-volume',
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

  for (const [key, family] of [
    ['text-search-engine', 'web'],
    ['ai-search-engine', 'ai'],
    ['video-search-engine', 'video'],
    ['music-search-engine', 'music'],
  ] as const) {
    const value = readString(storage, key)?.toLowerCase();
    const provider = value ? providerAliases[value] : undefined;
    // Providers without an alias keep the family default.
    if (provider && providerFamily(provider) === family)
      config.search.defaults[family] = provider;
  }

  migrateLegacyAudio(storage, config);
  if (readString(storage, 'focus') === 'true') config.appearance.focus = true;

  const background = legacyBackground(readString(storage, 'bg-image-url'));
  if (background) config.appearance.background = background;

  config.updatedAt = new Date().toISOString();
  return { config: startPageConfigSchema.parse(config), foundLegacyData };
}
