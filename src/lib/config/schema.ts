import { z } from 'zod';

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

export const shortcutSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(48),
  url: safeUrl,
  groupId: z.string().trim().min(1).max(40),
  icon: z.string().trim().max(4).optional(),
  order: z.number().int().min(0).max(10_000),
  hidden: z.boolean().default(false),
  favorite: z.boolean().default(false),
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

export const startPageConfigSchema = z
  .object({
    version: z.literal(1),
    shortcuts: z.array(shortcutSchema).max(300),
    groups: z.array(shortcutGroupSchema).max(40),
    search: z.object({
      defaultProvider: z.string().trim().min(1).max(40),
      recentProviders: z.array(z.string().trim().min(1).max(40)).max(4),
    }),
    weather: z.object({
      locations: z.array(weatherLocationSchema).min(1).max(20),
      activeLocationId: z.string().trim().min(1).max(80),
      units: z.enum(['metric', 'imperial']),
    }),
    appearance: z.object({
      theme: z.enum(['night']),
      background: z.enum(['quiet-night']),
    }),
    quote: z.object({ enabled: z.boolean() }),
    audio: z.object({ enabled: z.boolean(), volume: z.number().min(0).max(1) }),
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
export type StartPageConfig = z.infer<typeof startPageConfigSchema>;

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
