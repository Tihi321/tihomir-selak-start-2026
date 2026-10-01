import { z } from 'zod';
import { trackIds } from '@/data/audio';
import { searchFamilyIds } from '@/data/providers';

const safeUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === 'https:' && !url.username && !url.password) ||
        url.protocol === 'mailto:'
      );
    } catch {
      return false;
    }
  }, 'Use a complete HTTPS link or a mailto link.');

const httpsImageUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Use a complete HTTPS image link.');

const httpsUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Use a complete HTTPS link.');

export const newsSources = ['bug', 'verge', 'techcrunch'] as const;
export type NewsSource = (typeof newsSources)[number];

export const backgroundKinds = ['field', 'photo', 'custom', 'plain'] as const;
export type BackgroundKind = (typeof backgroundKinds)[number];

export const CURRENT_CONFIG_VERSION = 3;

export const shortcutSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(48),
  url: safeUrl,
  groupId: z.string().trim().min(1).max(40),
  icon: z.string().trim().max(4).optional(),
  order: z.number().int().min(0).max(10_000),
  hidden: z.boolean().default(false),
  favorite: z.boolean().default(false),
  favoriteOrder: z.number().int().min(0).max(10_000).optional(),
  source: z.enum(['default', 'user', 'migrated']),
});

export const shortcutGroupSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(48),
  order: z.number().int().min(0).max(100),
});

export const weatherLocationSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(80),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().trim().min(1).max(80),
  order: z.number().int().min(0).max(100),
});

export const newsPresetSchema = z.object({
  id: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(32),
  query: z.string().trim().min(1).max(80),
});

export const playlistSongSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(80),
  url: httpsUrl,
});

const searchFamilySchema = z.enum(searchFamilyIds);
const providerIdSchema = z.string().trim().min(1).max(40);

const searchSchema = z.object({
  family: searchFamilySchema,
  defaults: z.object({
    web: providerIdSchema,
    ai: providerIdSchema,
    video: providerIdSchema,
    music: providerIdSchema,
  }),
  recentProviders: z.array(providerIdSchema).max(4),
});

const newsSchema = z.object({
  enabled: z.boolean(),
  source: z.enum(newsSources),
  expanded: z.boolean(),
  presets: z.array(newsPresetSchema).max(12),
});

const audioSchema = z.object({
  mix: z.partialRecord(z.enum(trackIds), z.number().min(0).max(10)),
  low: z.boolean(),
  playlist: z.array(playlistSongSchema).max(100),
  muted: z.array(z.string().trim().min(1).max(80)).max(100),
  playlistVolume: z.number().min(0).max(1),
});

export const startPageConfigSchema = z
  .object({
    version: z.literal(3),
    shortcuts: z.array(shortcutSchema).max(300),
    groups: z.array(shortcutGroupSchema).max(40),
    search: searchSchema,
    weather: z.object({
      locations: z.array(weatherLocationSchema).min(1).max(20),
      activeLocationId: z.string().trim().min(1).max(80),
      units: z.enum(['metric', 'imperial']),
    }),
    appearance: z.object({
      background: z.object({
        kind: z.enum(backgroundKinds),
        photo: z.string().trim().min(1).max(40),
        customUrl: httpsImageUrl.optional(),
      }),
      focus: z.boolean(),
    }),
    quote: z.object({ enabled: z.boolean() }),
    word: z.object({ enabled: z.boolean() }),
    news: newsSchema,
    audio: audioSchema,
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .superRefine((config, context) => {
    const ids = config.shortcuts.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        message: 'Shortcut IDs must be unique.',
        path: ['shortcuts'],
      });
    }
    const groupIds = new Set(config.groups.map(({ id }) => id));
    for (const [index, shortcut] of config.shortcuts.entries()) {
      if (!groupIds.has(shortcut.groupId)) {
        context.addIssue({
          code: 'custom',
          message: `Shortcut “${shortcut.label}” has an unknown group.`,
          path: ['shortcuts', index, 'groupId'],
        });
      }
    }
    const weatherIds = config.weather.locations.map(({ id }) => id);
    if (new Set(weatherIds).size !== weatherIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Weather location IDs must be unique.',
        path: ['weather', 'locations'],
      });
    }
    if (!weatherIds.includes(config.weather.activeLocationId)) {
      context.addIssue({
        code: 'custom',
        message:
          'Choose an active location that exists in your saved locations.',
        path: ['weather', 'activeLocationId'],
      });
    }
  });

export type Shortcut = z.infer<typeof shortcutSchema>;
export type ShortcutGroup = z.infer<typeof shortcutGroupSchema>;
export type WeatherLocation = z.infer<typeof weatherLocationSchema>;
export type NewsPreset = z.infer<typeof newsPresetSchema>;
export type PlaylistSong = z.infer<typeof playlistSongSchema>;
export type SearchConfig = z.infer<typeof searchSchema>;
export type NewsConfig = z.infer<typeof newsSchema>;
export type AudioConfig = z.infer<typeof audioSchema>;
export type StartPageConfig = z.infer<typeof startPageConfigSchema>;
export type Background = StartPageConfig['appearance']['background'];

export function normalizeShortcutUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^mailto:/i.test(trimmed)) {
    const parsed = new URL(trimmed);
    if (!parsed.pathname.includes('@'))
      throw new Error('Add an email address to the mailto link.');
    return parsed.toString();
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed) && !/^https:\/\//i.test(trimmed)) {
    throw new Error('Only HTTPS links and mailto links are allowed.');
  }
  const candidate = /^https:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'https:')
    throw new Error('Only HTTPS links and mailto links are allowed.');
  if (parsed.username || parsed.password)
    throw new Error(
      'Links with embedded usernames or passwords are not allowed.',
    );
  return parsed.toString();
}

export function normalizeImageUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Enter an image address.');
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed) && !/^https:\/\//i.test(trimmed)) {
    throw new Error('Only HTTPS image links are allowed.');
  }
  const candidate = /^https:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Enter a complete image address.');
  }
  if (parsed.protocol !== 'https:')
    throw new Error('Only HTTPS image links are allowed.');
  if (parsed.username || parsed.password)
    throw new Error(
      'Links with embedded usernames or passwords are not allowed.',
    );
  const result = parsed.toString();
  if (result.length > 2048) throw new Error('That image address is too long.');
  return result;
}
