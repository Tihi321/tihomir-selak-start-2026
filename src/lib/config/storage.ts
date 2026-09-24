import { createDefaultConfig } from '@/data/defaults';
import { startPageConfigSchema, type StartPageConfig } from './schema';
import { migrateLegacyConfig } from './migration';

export const CONFIG_KEY = 'start-page:config:v1';
export const BACKUP_KEY = 'start-page:config:last-known-good';
export const MIGRATION_KEY = 'start-page:legacy-migration:v1';

export type StorageResult = {
  config: StartPageConfig;
  recovered: boolean;
  migrated: boolean;
  readOnly?: boolean;
  notice?: string;
};

export function parseConfig(value: unknown): StartPageConfig {
  return startPageConfigSchema.parse(value);
}

export function mergeConfigs(
  current: StartPageConfig,
  incoming: StartPageConfig,
): StartPageConfig {
  const shortcuts = new Map(
    current.shortcuts.map((shortcut) => [shortcut.id, shortcut]),
  );
  for (const shortcut of incoming.shortcuts)
    shortcuts.set(shortcut.id, shortcut);
  const groups = new Map(current.groups.map((group) => [group.id, group]));
  for (const group of incoming.groups) groups.set(group.id, group);
  const locations = new Map(
    current.weather.locations.map((location) => [location.id, location]),
  );
  for (const location of incoming.weather.locations)
    locations.set(location.id, location);
  const mergedLocations = [...locations.values()].sort(
    (a, b) => a.order - b.order,
  );
  const activeLocationId = mergedLocations.some(
    ({ id }) => id === incoming.weather.activeLocationId,
  )
    ? incoming.weather.activeLocationId
    : current.weather.activeLocationId;

  return parseConfig({
    ...incoming,
    shortcuts: [...shortcuts.values()].sort((a, b) => a.order - b.order),
    groups: [...groups.values()].sort((a, b) => a.order - b.order),
    weather: {
      ...incoming.weather,
      locations: mergedLocations,
      activeLocationId,
    },
    updatedAt: new Date().toISOString(),
  });
}

export function loadConfig(storage: Storage): StorageResult {
  let notice: string | undefined;
  try {
    const raw = storage.getItem(CONFIG_KEY);
    if (raw) {
      try {
        const value = JSON.parse(raw) as { version?: unknown };
        if (typeof value?.version === 'number' && value.version > 1) {
          return {
            config: createDefaultConfig(),
            recovered: false,
            migrated: false,
            readOnly: true,
            notice:
              'These browser settings were saved by a newer version of the page. They were left untouched; update this page before making changes.',
          };
        }
        return {
          config: parseConfig(value),
          recovered: false,
          migrated: false,
        };
      } catch {
        notice =
          'Your saved settings could not be read. The last good copy is being restored.';
      }
    }

    const backup = storage.getItem(BACKUP_KEY);
    if (backup) {
      try {
        const config = parseConfig(JSON.parse(backup));
        storage.setItem(CONFIG_KEY, JSON.stringify(config));
        return { config, recovered: true, migrated: false, notice };
      } catch {
        notice =
          'The saved copy and backup were invalid. Default settings were loaded.';
      }
    }

    if (storage.getItem(MIGRATION_KEY) !== 'done') {
      const migrated = migrateLegacyConfig(storage);
      if (migrated.foundLegacyData) {
        saveConfig(storage, migrated.config);
        storage.setItem(MIGRATION_KEY, 'done');
        return {
          config: migrated.config,
          recovered: false,
          migrated: true,
          notice: 'Older browser settings were brought into this page.',
        };
      }
      storage.setItem(MIGRATION_KEY, 'done');
    }

    const config = createDefaultConfig();
    saveConfig(storage, config);
    return { config, recovered: false, migrated: false, notice };
  } catch {
    return {
      config: createDefaultConfig(),
      recovered: false,
      migrated: false,
      notice: 'Browser storage is unavailable. Changes may not persist.',
    };
  }
}

export function saveConfig(
  storage: Storage,
  configValue: unknown,
): StartPageConfig {
  const config = parseConfig({
    ...(configValue as object),
    updatedAt: new Date().toISOString(),
  });
  const current = storage.getItem(CONFIG_KEY);
  if (current) {
    try {
      const parsed = JSON.parse(current) as { version?: unknown };
      if (typeof parsed?.version === 'number' && parsed.version > 1)
        throw new Error(
          'Newer browser settings were left untouched. Update this page before saving changes.',
        );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith('Newer browser settings')
      )
        throw error;
    }
  }
  if (current) {
    try {
      storage.setItem(
        BACKUP_KEY,
        JSON.stringify(parseConfig(JSON.parse(current))),
      );
    } catch {
      // Preserve the previous good backup if the current value is already invalid.
    }
  }
  storage.setItem(CONFIG_KEY, JSON.stringify(config));
  return config;
}

export function exportConfig(config: StartPageConfig): string {
  return `${JSON.stringify(parseConfig(config), null, 2)}\n`;
}
