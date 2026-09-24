import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';
import { createDefaultConfig } from '@/data/defaults';
import {
  searchFamilies,
  searchProviders,
  providerById,
  buildProviderUrl,
} from '@/data/providers';
import {
  exportConfig,
  loadConfig,
  mergeConfigs,
  parseConfig,
  saveConfig,
} from '@/lib/config/storage';
import {
  normalizeShortcutUrl,
  type WeatherLocation,
  type Shortcut,
  type StartPageConfig,
} from '@/lib/config/schema';
import {
  getWeather,
  searchCities,
  weatherDescription,
  type CityResult,
  type WeatherResult,
} from '@/lib/weather/openMeteo';

const reflections = [
  'Start with the next clear step.',
  'A little progress still changes the map.',
  'Leave room for a better question.',
  'Notice what is already working.',
  'Begin where your feet are.',
];

function weatherSymbol(code: number) {
  if (code === 0) return '☼';
  if ([1, 2, 3, 45, 48].includes(code)) return '☁';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return '☂';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄';
  if ([95, 96, 99].includes(code)) return 'ϟ';
  return '◌';
}

type Draft = {
  id?: string;
  label: string;
  url: string;
  groupId: string;
  favorite: boolean;
};
const freshId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `shortcut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export default function StartDashboard() {
  const [config, setConfig] = createSignal<StartPageConfig>(
    createDefaultConfig(),
  );
  const [storageReadOnly, setStorageReadOnly] = createSignal(false);
  const [now, setNow] = createSignal(new Date());
  const [weather, setWeather] = createSignal<WeatherResult>({
    snapshot: null,
    stale: false,
    error: null,
  });
  const [cityQuery, setCityQuery] = createSignal('');
  const [cityResults, setCityResults] = createSignal<CityResult[]>([]);
  const [cityError, setCityError] = createSignal('');
  const [findingCities, setFindingCities] = createSignal(false);
  const [quoteOffset, setQuoteOffset] = createSignal(0);
  const [family, setFamily] = createSignal('web');
  const [query, setQuery] = createSignal('');
  const [showAll, setShowAll] = createSignal(false);
  const [filter, setFilter] = createSignal('');
  const [notice, setNotice] = createSignal('');
  const [undoTarget, setUndoTarget] = createSignal<Shortcut | null>(null);
  const [draft, setDraft] = createSignal<Draft>({
    label: '',
    url: '',
    groupId: 'daily',
    favorite: false,
  });
  const [importValue, setImportValue] = createSignal<StartPageConfig | null>(
    null,
  );
  const [importError, setImportError] = createSignal('');
  const [importMode, setImportMode] = createSignal<'replace' | 'merge'>(
    'replace',
  );
  const [searchNode, setSearchNode] = createSignal<HTMLInputElement>();
  let settingsDialog: HTMLDialogElement | undefined;
  let shortcutDialog: HTMLDialogElement | undefined;
  let importInput: HTMLInputElement | undefined;
  let weatherAbort: AbortController | undefined;
  let cityAbort: AbortController | undefined;

  const provider = createMemo(() =>
    providerById(config().search.defaultProvider),
  );
  const activeLocation = createMemo(
    () =>
      config().weather.locations.find(
        ({ id }) => id === config().weather.activeLocationId,
      ) ?? config().weather.locations[0]!,
  );
  const dailyQuote = createMemo(() => {
    const date = now();
    const localDay = Math.floor(
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() /
        86_400_000,
    );
    return reflections[
      (((localDay + quoteOffset()) % reflections.length) + reflections.length) %
        reflections.length
    ]!;
  });
  const familyProviders = createMemo(() =>
    searchProviders.filter((item) => item.family === family()),
  );
  const active = createMemo(() =>
    config()
      .shortcuts.filter((shortcut) => !shortcut.hidden)
      .sort((a, b) => a.order - b.order),
  );
  const favorites = createMemo(() =>
    active().filter((shortcut) => shortcut.favorite),
  );
  const groups = createMemo(() => {
    const needle = filter().trim().toLowerCase();
    return [...config().groups]
      .sort((a, b) => a.order - b.order)
      .map((group) => ({
        ...group,
        shortcuts: active().filter(
          (shortcut) =>
            shortcut.groupId === group.id &&
            (!needle ||
              `${shortcut.label} ${group.label}`
                .toLowerCase()
                .includes(needle)),
        ),
      }))
      .filter((group) => group.shortcuts.length);
  });

  function persist(next: StartPageConfig, message = ''): boolean {
    let validated: StartPageConfig;
    try {
      validated = parseConfig(next);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `Settings were not changed: ${error.message}`
          : 'Settings were not changed because they are invalid.',
      );
      return false;
    }
    if (storageReadOnly()) {
      setNotice(
        'These browser settings belong to a newer page version and cannot be changed here.',
      );
      return false;
    }
    const storage = browserStorage();
    if (!storage) {
      setConfig(validated);
      setNotice(
        'Browser storage is unavailable. Your change is only in this tab.',
      );
      return true;
    }
    try {
      setConfig(saveConfig(storage, validated));
      setNotice(message);
      return true;
    } catch {
      setConfig(validated);
      setNotice(
        'Browser storage is unavailable. Your change is only in this tab.',
      );
      return true;
    }
  }

  function openSettings() {
    settingsDialog?.showModal();
  }
  function openShortcut(item?: Shortcut) {
    setDraft(
      item
        ? {
            id: item.id,
            label: item.label,
            url: item.url,
            groupId: item.groupId,
            favorite: item.favorite,
          }
        : {
            label: '',
            url: '',
            groupId: config().groups[0]?.id ?? 'daily',
            favorite: favorites().length < 16,
          },
    );
    shortcutDialog?.showModal();
  }

  function setProvider(id: string) {
    const next = providerById(id);
    setFamily(next.family);
    persist({
      ...config(),
      search: {
        defaultProvider: id,
        recentProviders: [
          id,
          ...config().search.recentProviders.filter((value) => value !== id),
        ].slice(0, 4),
      },
    });
  }

  function search(event: SubmitEvent) {
    event.preventDefault();
    if (query().trim() && !provider().queryTemplate)
      setNotice(
        `${provider().label} opened. Your prompt stays in the search field because this provider has no verified prefilled-search route.`,
      );
    window.open(
      buildProviderUrl(provider(), query()),
      '_blank',
      'noopener,noreferrer',
    );
  }

  async function refreshWeather(force = false, location = activeLocation()) {
    if (!location) return;
    const storage = browserStorage();
    if (!storage) {
      setWeather({
        snapshot: null,
        stale: false,
        error: 'Weather is unavailable because browser storage is blocked.',
      });
      return;
    }
    weatherAbort?.abort();
    const controller = new AbortController();
    weatherAbort = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 9_000);
    try {
      const result = await getWeather(location, config().weather.units, {
        storage,
        signal: controller.signal,
        force,
      });
      if (
        (!controller.signal.aborted || timedOut) &&
        activeLocation().id === location.id
      )
        setWeather(result);
    } catch {
      if (
        (!controller.signal.aborted || timedOut) &&
        activeLocation().id === location.id
      )
        setWeather({
          snapshot: null,
          stale: false,
          error: 'Weather is unavailable.',
        });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function moveWeatherLocation(offset: number) {
    const locations = [...config().weather.locations].sort(
      (a, b) => a.order - b.order,
    );
    if (locations.length < 2) return;
    const index = locations.findIndex(({ id }) => id === activeLocation().id);
    const next =
      locations[(index + offset + locations.length) % locations.length]!;
    if (
      persist({
        ...config(),
        weather: { ...config().weather, activeLocationId: next.id },
      })
    )
      void refreshWeather(false, next);
  }

  async function findCities(event: SubmitEvent) {
    event.preventDefault();
    setCityError('');
    if (cityQuery().trim().length < 2) {
      setCityError('Enter at least two letters to search.');
      return;
    }
    cityAbort?.abort();
    const controller = new AbortController();
    cityAbort = controller;
    setFindingCities(true);
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 9_000);
    try {
      setCityResults(await searchCities(cityQuery(), fetch, controller.signal));
      if (!controller.signal.aborted && !cityResults().length)
        setCityError('No matching places found. Try a nearby city name.');
    } catch (error) {
      if (!controller.signal.aborted || timedOut)
        setCityError(
          timedOut
            ? 'Place search took too long. Try again.'
            : error instanceof Error
              ? error.message
              : 'Place search is unavailable.',
        );
    } finally {
      if (!controller.signal.aborted) setFindingCities(false);
      window.clearTimeout(timeout);
    }
  }

  function addWeatherLocation(city: CityResult) {
    if (config().weather.locations.length >= 20) {
      setCityError(
        'You can save up to 20 weather places. Remove one to add another.',
      );
      return;
    }
    const baseId = `city-${city.id}`;
    const ids = new Set(config().weather.locations.map(({ id }) => id));
    let id = baseId;
    let suffix = 2;
    while (ids.has(id)) id = `${baseId}-${suffix++}`;
    const nextLocation: WeatherLocation = {
      id,
      label: city.label,
      latitude: city.latitude,
      longitude: city.longitude,
      timezone: city.timezone,
      order: config().weather.locations.length,
    };
    if (
      !persist(
        {
          ...config(),
          weather: {
            ...config().weather,
            locations: [...config().weather.locations, nextLocation],
            activeLocationId: id,
          },
        },
        `${city.label} added to saved places.`,
      )
    )
      return;
    setCityResults([]);
    setCityQuery('');
    setWeather({ snapshot: null, stale: false, error: null });
    void refreshWeather(false, nextLocation);
  }

  function renameWeatherLocation(location: WeatherLocation) {
    const label = window
      .prompt('Name this saved place', location.label)
      ?.trim();
    if (!label) return;
    persist(
      {
        ...config(),
        weather: {
          ...config().weather,
          locations: config().weather.locations.map((item) =>
            item.id === location.id
              ? { ...item, label: label.slice(0, 80) }
              : item,
          ),
        },
      },
      'Place name updated.',
    );
  }

  function reorderWeatherLocation(location: WeatherLocation, offset: number) {
    const sorted = [...config().weather.locations].sort(
      (a, b) => a.order - b.order,
    );
    const index = sorted.findIndex(({ id }) => id === location.id);
    const target = index + offset;
    if (target < 0 || target >= sorted.length) return;
    [sorted[index], sorted[target]] = [sorted[target]!, sorted[index]!];
    persist(
      {
        ...config(),
        weather: {
          ...config().weather,
          locations: sorted.map((item, order) => ({ ...item, order })),
        },
      },
      `${location.label} moved ${offset < 0 ? 'up' : 'down'}.`,
    );
  }

  function removeWeatherLocation(location: WeatherLocation) {
    if (config().weather.locations.length <= 1) {
      setNotice('Keep at least one saved weather place.');
      return;
    }
    const locations = config()
      .weather.locations.filter(({ id }) => id !== location.id)
      .map((item, order) => ({ ...item, order }));
    const activeLocationId =
      config().weather.activeLocationId === location.id
        ? locations[0]!.id
        : config().weather.activeLocationId;
    if (
      persist({
        ...config(),
        weather: { ...config().weather, locations, activeLocationId },
      })
    ) {
      setNotice(`${location.label} removed.`);
      void refreshWeather(
        false,
        locations.find(({ id }) => id === activeLocationId)!,
      );
    }
  }

  function changeWeatherUnits(units: 'metric' | 'imperial') {
    if (units === config().weather.units) return;
    if (
      !persist(
        { ...config(), weather: { ...config().weather, units } },
        `Weather units changed to ${units === 'metric' ? 'Celsius' : 'Fahrenheit'}.`,
      )
    )
      return;
    setWeather({ snapshot: null, stale: false, error: null });
    void refreshWeather(false);
  }

  function saveShortcut(event: SubmitEvent) {
    event.preventDefault();
    const value = draft();
    try {
      const url = normalizeShortcutUrl(value.url);
      const old = config().shortcuts.find((item) => item.id === value.id);
      const shortcut: Shortcut = {
        id: value.id ?? freshId(),
        label: value.label.trim(),
        url,
        groupId: value.groupId,
        icon: value.label.trim().slice(0, 1).toUpperCase(),
        order:
          old?.order ??
          Math.max(0, ...config().shortcuts.map((item) => item.order)) + 1,
        hidden: false,
        favorite: value.favorite,
        source: old?.source ?? 'user',
      };
      const shortcuts = old
        ? config().shortcuts.map((item) =>
            item.id === old.id ? shortcut : item,
          )
        : [...config().shortcuts, shortcut];
      persist(
        { ...config(), shortcuts },
        old ? 'Shortcut saved.' : 'Shortcut added.',
      );
      shortcutDialog?.close();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Enter a complete HTTPS address.',
      );
    }
  }

  function move(id: string, offset: number) {
    const items = [...config().shortcuts];
    const item = items.find((value) => value.id === id);
    if (!item) return;
    const sameGroup = items
      .filter((value) => value.groupId === item.groupId && !value.hidden)
      .sort((a, b) => a.order - b.order);
    const adjacent =
      sameGroup[sameGroup.findIndex((value) => value.id === id) + offset];
    if (!adjacent) return;
    const result = items.map((value) =>
      value.id === id
        ? { ...value, order: adjacent.order }
        : value.id === adjacent.id
          ? { ...value, order: item.order }
          : value,
    );
    persist(
      { ...config(), shortcuts: result },
      `${item.label} moved ${offset < 0 ? 'up' : 'down'}.`,
    );
  }

  function hide(item: Shortcut) {
    persist(
      {
        ...config(),
        shortcuts: config().shortcuts.map((value) =>
          value.id === item.id ? { ...value, hidden: !value.hidden } : value,
        ),
      },
      item.hidden ? `${item.label} restored.` : `${item.label} hidden.`,
    );
  }
  function toggleFavorite(item: Shortcut) {
    persist(
      {
        ...config(),
        shortcuts: config().shortcuts.map((value) =>
          value.id === item.id
            ? { ...value, favorite: !value.favorite }
            : value,
        ),
      },
      item.favorite
        ? `${item.label} removed from favorites.`
        : `${item.label} added to favorites.`,
    );
  }
  function remove(item: Shortcut) {
    setUndoTarget(item);
    persist(
      {
        ...config(),
        shortcuts: config().shortcuts.filter((value) => value.id !== item.id),
      },
      `${item.label} removed.`,
    );
  }
  function undo() {
    const item = undoTarget();
    if (!item) return;
    persist(
      {
        ...config(),
        shortcuts: [...config().shortcuts, item].sort(
          (a, b) => a.order - b.order,
        ),
      },
      `${item.label} restored.`,
    );
    setUndoTarget(null);
  }
  function duplicate(item: Shortcut) {
    const copy: Shortcut = {
      ...item,
      id: freshId(),
      label: `${item.label} copy`,
      order: Math.max(0, ...config().shortcuts.map((value) => value.order)) + 1,
      favorite: false,
      source: 'user',
    };
    persist(
      { ...config(), shortcuts: [...config().shortcuts, copy] },
      `${item.label} duplicated.`,
    );
  }

  function downloadBackup() {
    const blob = new Blob([exportConfig(config())], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `start-page-settings-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(
      'Settings exported. The file includes saved shortcut and weather locations.',
    );
  }

  async function selectBackup(event: Event) {
    setImportValue(null);
    setImportError('');
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      setImportValue(parseConfig(JSON.parse(await file.text())));
    } catch (error) {
      setImportError(
        error instanceof Error
          ? `This file is not a valid settings backup: ${error.message}`
          : 'This file is not a valid settings backup.',
      );
    }
  }

  function applyBackup() {
    const incoming = importValue();
    if (!incoming) return;
    try {
      persist(
        importMode() === 'merge' ? mergeConfigs(config(), incoming) : incoming,
        importMode() === 'merge'
          ? 'Settings merged.'
          : 'Settings replaced from backup.',
      );
      setImportValue(null);
      if (importInput) importInput.value = '';
    } catch (error) {
      setImportError(
        error instanceof Error
          ? `Settings were not changed: ${error.message}`
          : 'Settings were not changed.',
      );
    }
  }

  function reset() {
    if (!window.confirm('Reset shortcuts and settings to their defaults?'))
      return;
    persist(createDefaultConfig(), 'Default settings restored.');
  }

  onMount(() => {
    const storage = browserStorage();
    const loaded = storage
      ? loadConfig(storage)
      : {
          config: createDefaultConfig(),
          recovered: false,
          migrated: false,
          notice: 'Browser storage is unavailable. Changes may not persist.',
        };
    setConfig(loaded.config);
    setStorageReadOnly(loaded.readOnly ?? false);
    setFamily(providerById(loaded.config.search.defaultProvider).family);
    if (loaded.notice) setNotice(loaded.notice);
    if (storage)
      void refreshWeather(
        false,
        loaded.config.weather.locations.find(
          ({ id }) => id === loaded.config.weather.activeLocationId,
        ),
      );
    setNow(new Date());
    const clockTimer = window.setInterval(() => setNow(new Date()), 30_000);
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key === '/' &&
        !target?.matches('input, textarea, select, [contenteditable="true"]') &&
        !settingsDialog?.open &&
        !shortcutDialog?.open
      ) {
        event.preventDefault();
        searchNode()?.focus();
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        searchNode()?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    onCleanup(() => {
      window.removeEventListener('keydown', handler);
      window.clearInterval(clockTimer);
      weatherAbort?.abort();
      cityAbort?.abort();
    });
  });

  return (
    <main class="page-shell">
      <div class="night-sky" aria-hidden="true">
        <span class="moon" />
        <span class="ridge ridge-back" />
        <span class="ridge ridge-front" />
      </div>
      <div class="content-frame">
        <header class="topline">
          <div class="clock-block">
            <time class="clock" dateTime={now().toISOString()}>
              {new Intl.DateTimeFormat('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              }).format(now())}
            </time>
            <span class="date-label">
              {new Intl.DateTimeFormat('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              }).format(now())}
            </span>
          </div>
          <div class="weather-widget" aria-label="Weather">
            <Show when={config().weather.locations.length > 1}>
              <button
                type="button"
                class="weather-arrow"
                aria-label="Previous weather location"
                onClick={() => moveWeatherLocation(-1)}
              >
                ‹
              </button>
            </Show>
            <span class="weather-mark" aria-hidden="true">
              {weather().snapshot
                ? weatherSymbol(weather().snapshot!.weatherCode)
                : '◌'}
            </span>
            <div class="weather-summary" aria-live="polite">
              <strong>{activeLocation().label}</strong>
              <Show
                when={weather().snapshot}
                fallback={
                  <span>
                    {weather().error
                      ? 'Weather unavailable'
                      : 'Checking weather'}
                  </span>
                }
              >
                <span>
                  {Math.round(weather().snapshot!.temperature)}°
                  {config().weather.units === 'metric' ? 'C' : 'F'} ·{' '}
                  {weatherDescription(weather().snapshot!.weatherCode)}
                </span>
                <small>
                  {weather().stale
                    ? 'Saved forecast · connection unavailable'
                    : `High ${Math.round(weather().snapshot!.high)}° · Low ${Math.round(weather().snapshot!.low)}°`}
                </small>
              </Show>
            </div>
            <Show when={config().weather.locations.length > 1}>
              <button
                type="button"
                class="weather-arrow"
                aria-label="Next weather location"
                onClick={() => moveWeatherLocation(1)}
              >
                ›
              </button>
            </Show>
            <button
              type="button"
              class="weather-refresh"
              aria-label="Refresh weather"
              onClick={() => void refreshWeather(true)}
            >
              ↻
            </button>
          </div>
          <button class="settings-trigger" type="button" onClick={openSettings}>
            <span aria-hidden="true">⚙</span>
            <span>Settings</span>
          </button>
        </header>

        <section class="search-stage" aria-labelledby="welcome-heading">
          <p class="welcome-line" id="welcome-heading">
            Good to see you.
          </p>
          <form class="search-rail" onSubmit={search} role="search">
            <label class="sr-only" for="start-search">
              Search the web or open a destination
            </label>
            <select
              class="provider-select"
              aria-label="Search provider"
              value={provider().id}
              onChange={(event) => setProvider(event.currentTarget.value)}
            >
              <For each={familyProviders()}>
                {(item) => <option value={item.id}>{item.label}</option>}
              </For>
            </select>
            <input
              ref={setSearchNode}
              id="start-search"
              type="search"
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
              placeholder={`Search with ${provider().label}…`}
              autocomplete="off"
            />
            <button
              class="submit-search"
              type="submit"
              aria-label={`Search with ${provider().label}`}
            >
              <span aria-hidden="true">↵</span>
            </button>
          </form>
          <div class="search-meta">
            <div
              class="family-switcher"
              role="group"
              aria-label="Search category"
            >
              <For each={searchFamilies}>
                {(item) => (
                  <button
                    type="button"
                    classList={{ selected: family() === item.id }}
                    onClick={() =>
                      setProvider(
                        searchProviders.find(
                          (candidate) => candidate.family === item.id,
                        )!.id,
                      )
                    }
                  >
                    {item.label}
                  </button>
                )}
              </For>
            </div>
            <span class="shortcut-hint">
              <kbd>/</kbd> to focus
            </span>
          </div>
          <p class="privacy-note">
            {provider().queryTemplate
              ? provider().privacyNote
              : `${provider().label} opens its homepage. Text stays in this field; enter your prompt on that site.`}
          </p>
        </section>

        <section class="favorites-section" aria-labelledby="favorites-heading">
          <div class="section-heading">
            <div>
              <h1 id="favorites-heading">Your shortcuts</h1>
              <p>A small shelf for the places you visit most.</p>
            </div>
            <div class="section-actions">
              <button
                class="quiet-button"
                type="button"
                onClick={() => setShowAll(!showAll())}
              >
                {showAll() ? 'Show favorites' : 'All shortcuts'}
              </button>
              <button
                class="add-button"
                type="button"
                onClick={() => openShortcut()}
              >
                <span aria-hidden="true">＋</span> Add
              </button>
            </div>
          </div>
          <Show
            when={!showAll()}
            fallback={
              <div class="catalogue">
                <div class="catalogue-tools">
                  <label class="sr-only" for="shortcut-filter">
                    Filter shortcuts
                  </label>
                  <input
                    id="shortcut-filter"
                    class="filter-input"
                    type="search"
                    placeholder="Find a shortcut"
                    value={filter()}
                    onInput={(event) => setFilter(event.currentTarget.value)}
                  />
                  <button
                    class="quiet-button"
                    type="button"
                    onClick={openSettings}
                  >
                    Settings & backup
                  </button>
                </div>
                <For each={groups()}>
                  {(group) => (
                    <section
                      class="shortcut-group"
                      aria-labelledby={`group-${group.id}`}
                    >
                      <h2 id={`group-${group.id}`}>
                        {group.label}
                        <span>{group.shortcuts.length}</span>
                      </h2>
                      <div class="shortcut-list">
                        <For each={group.shortcuts}>
                          {(item) => (
                            <ShortcutRow
                              shortcut={item}
                              onEdit={openShortcut}
                              onHide={hide}
                              onFavorite={toggleFavorite}
                              onRemove={remove}
                              onDuplicate={duplicate}
                              onMove={move}
                            />
                          )}
                        </For>
                      </div>
                    </section>
                  )}
                </For>
                <Show when={!groups().length}>
                  <p class="empty-state">
                    No shortcuts match that search. Try another name or add one.
                  </p>
                </Show>
                <Show when={config().shortcuts.some((item) => item.hidden)}>
                  <section class="shortcut-group hidden-group">
                    <h2>
                      Hidden{' '}
                      <span>
                        {
                          config().shortcuts.filter((item) => item.hidden)
                            .length
                        }
                      </span>
                    </h2>
                    <For
                      each={config().shortcuts.filter((item) => item.hidden)}
                    >
                      {(item) => (
                        <div class="hidden-shortcut">
                          <span>{item.label}</span>
                          <button
                            class="quiet-button"
                            type="button"
                            onClick={() => hide(item)}
                          >
                            Restore
                          </button>
                        </div>
                      )}
                    </For>
                  </section>
                </Show>
              </div>
            }
          >
            <nav class="favorite-shelf" aria-label="Favorite shortcuts">
              <For each={favorites().slice(0, 16)}>
                {(item) => (
                  <a
                    class="favorite-link"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={item.label}
                  >
                    <span class="favorite-glyph" aria-hidden="true">
                      {item.icon || item.label.slice(0, 1).toUpperCase()}
                    </span>
                    <span>{item.label}</span>
                  </a>
                )}
              </For>
              <Show when={!favorites().length}>
                <p class="empty-state">
                  Your shelf is clear. Add a shortcut to put a place here.
                </p>
              </Show>
            </nav>
          </Show>
        </section>
        <section class="quote-strip" aria-label="An original site reflection">
          <span class="quote-mark" aria-hidden="true">
            “
          </span>
          <blockquote>{dailyQuote()}</blockquote>
          <span class="quote-source">An original reflection</span>
          <button
            type="button"
            class="quote-next"
            onClick={() => setQuoteOffset((value) => value + 1)}
          >
            Next thought
          </button>
        </section>
        <footer class="page-footer">
          <span>Made for the next place you’re headed.</span>
          <a
            href="https://open-meteo.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Weather by Open-Meteo
          </a>
        </footer>
      </div>

      <Show when={notice()}>
        <div class="notice" role="status">
          {notice()}
          <Show when={undoTarget()}>
            <button type="button" onClick={undo}>
              Undo
            </button>
          </Show>
          <button
            class="dismiss-notice"
            type="button"
            aria-label="Dismiss notice"
            onClick={() => setNotice('')}
          >
            ×
          </button>
        </div>
      </Show>

      <dialog
        ref={settingsDialog}
        class="settings-dialog"
        aria-labelledby="settings-title"
        onClose={() => undefined}
      >
        <div class="dialog-heading">
          <div>
            <p class="dialog-kicker">Your browser</p>
            <h2 id="settings-title">Settings & backup</h2>
          </div>
          <button
            class="icon-button"
            type="button"
            aria-label="Close settings"
            onClick={() => settingsDialog?.close()}
          >
            ×
          </button>
        </div>
        <p class="dialog-copy">
          Your setup stays on this device. Keep a JSON copy if you want to move
          it later.
        </p>
        <div class="settings-summary">
          <span>{config().shortcuts.length} shortcuts</span>
          <span>{config().weather.locations.length} saved places</span>
          <span>{config().weather.units} units</span>
        </div>
        <section class="settings-block">
          <h3>Search</h3>
          <label for="default-provider">Default provider</label>
          <select
            id="default-provider"
            value={provider().id}
            onChange={(event) => setProvider(event.currentTarget.value)}
          >
            <For each={searchProviders}>
              {(item) => (
                <option value={item.id}>
                  {item.family} · {item.label}
                </option>
              )}
            </For>
          </select>
        </section>
        <section class="settings-block">
          <h3>Weather locations</h3>
          <label for="weather-units">Temperature</label>
          <select
            id="weather-units"
            value={config().weather.units}
            onChange={(event) =>
              changeWeatherUnits(
                event.currentTarget.value as 'metric' | 'imperial',
              )
            }
          >
            <option value="metric">Celsius</option>
            <option value="imperial">Fahrenheit</option>
          </select>
          <ul class="location-list">
            <For
              each={[...config().weather.locations].sort(
                (a, b) => a.order - b.order,
              )}
            >
              {(item, index) => (
                <li class="saved-place">
                  <div class="place-description">
                    <span>
                      {item.label}
                      {item.id === config().weather.activeLocationId ? (
                        <small class="active-tag">Current</small>
                      ) : null}
                    </span>
                    <small>
                      {item.latitude.toFixed(2)}, {item.longitude.toFixed(2)} ·{' '}
                      {item.timezone}
                    </small>
                  </div>
                  <div class="place-actions">
                    <Show when={item.id !== config().weather.activeLocationId}>
                      <button
                        type="button"
                        class="place-action"
                        onClick={() => {
                          if (
                            persist(
                              {
                                ...config(),
                                weather: {
                                  ...config().weather,
                                  activeLocationId: item.id,
                                },
                              },
                              `${item.label} is now active.`,
                            )
                          )
                            void refreshWeather(false, item);
                        }}
                      >
                        Show
                      </button>
                    </Show>
                    <button
                      type="button"
                      class="place-action"
                      aria-label={`Move ${item.label} up`}
                      disabled={index() === 0}
                      onClick={() => reorderWeatherLocation(item, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      class="place-action"
                      aria-label={`Move ${item.label} down`}
                      disabled={
                        index() === config().weather.locations.length - 1
                      }
                      onClick={() => reorderWeatherLocation(item, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      class="place-action"
                      onClick={() => renameWeatherLocation(item)}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      class="place-action remove-place"
                      onClick={() => removeWeatherLocation(item)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              )}
            </For>
          </ul>
          <form class="city-search" onSubmit={findCities}>
            <label for="city-search">Add a place</label>
            <div class="city-search-row">
              <input
                id="city-search"
                type="search"
                minlength="2"
                maxlength="80"
                placeholder="Search city name"
                value={cityQuery()}
                onInput={(event) => setCityQuery(event.currentTarget.value)}
              />
              <button
                class="secondary-button"
                type="submit"
                disabled={findingCities()}
              >
                {findingCities() ? 'Searching…' : 'Search places'}
              </button>
            </div>
          </form>
          <Show when={cityError()}>
            <p class="error-message" role="alert">
              {cityError()}
            </p>
          </Show>
          <Show when={cityResults().length > 0}>
            <ul class="city-results" aria-label="Place search results">
              <For each={cityResults()}>
                {(city) => (
                  <li>
                    <div>
                      <strong>{city.label}</strong>
                      <small>
                        {[city.region, city.country].filter(Boolean).join(', ')}
                      </small>
                    </div>
                    <button
                      class="secondary-button"
                      type="button"
                      onClick={() => addWeatherLocation(city)}
                    >
                      Add to saved places
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
        <section class="settings-block">
          <h3>Move or restore settings</h3>
          <div class="backup-actions">
            <button
              class="secondary-button"
              type="button"
              onClick={downloadBackup}
            >
              Export JSON
            </button>
            <button
              class="secondary-button"
              type="button"
              onClick={() => importInput?.click()}
            >
              Choose JSON file
            </button>
            <input
              ref={importInput}
              class="sr-only"
              type="file"
              accept="application/json,.json"
              onChange={selectBackup}
            />
          </div>
          <Show when={importValue()}>
            <div class="import-preview">
              <p>
                This file has {importValue()!.shortcuts.length} shortcuts and{' '}
                {importValue()!.weather.locations.length} saved weather
                locations:
              </p>
              <ul class="import-locations">
                <For each={importValue()!.weather.locations}>
                  {(location) => (
                    <li>
                      {location.label} — {location.latitude},{' '}
                      {location.longitude} · {location.timezone}
                    </li>
                  )}
                </For>
              </ul>
              <label for="import-mode">How should it be applied?</label>
              <select
                id="import-mode"
                value={importMode()}
                onChange={(event) =>
                  setImportMode(
                    event.currentTarget.value as 'replace' | 'merge',
                  )
                }
              >
                <option value="replace">Replace current settings</option>
                <option value="merge">Merge shortcuts and places</option>
              </select>
              <div class="backup-actions">
                <button class="add-button" type="button" onClick={applyBackup}>
                  Apply backup
                </button>
                <button
                  class="quiet-button"
                  type="button"
                  onClick={() => setImportValue(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </Show>
          <Show when={importError()}>
            <p class="error-message" role="alert">
              {importError()}
            </p>
          </Show>
        </section>
        <div class="settings-bottom">
          <button class="danger-button" type="button" onClick={reset}>
            Reset to defaults
          </button>
          <button
            class="add-button"
            type="button"
            onClick={() => settingsDialog?.close()}
          >
            Done
          </button>
        </div>
      </dialog>

      <dialog ref={shortcutDialog} class="editor-dialog">
        <form onSubmit={saveShortcut}>
          <div class="dialog-heading">
            <div>
              <p class="dialog-kicker">Shortcut</p>
              <h2>{draft().id ? 'Edit shortcut' : 'Add shortcut'}</h2>
            </div>
            <button
              class="icon-button"
              type="button"
              aria-label="Close shortcut editor"
              onClick={() => shortcutDialog?.close()}
            >
              ×
            </button>
          </div>
          <label for="shortcut-name">Name</label>
          <input
            id="shortcut-name"
            required
            maxlength="48"
            value={draft().label}
            onInput={(event) =>
              setDraft({ ...draft(), label: event.currentTarget.value })
            }
            placeholder="A clear name"
          />
          <label for="shortcut-url">Website address</label>
          <input
            id="shortcut-url"
            required
            value={draft().url}
            onInput={(event) =>
              setDraft({ ...draft(), url: event.currentTarget.value })
            }
            placeholder="example.com"
            inputmode="url"
          />
          <label for="shortcut-group">Group</label>
          <select
            id="shortcut-group"
            value={draft().groupId}
            onChange={(event) =>
              setDraft({ ...draft(), groupId: event.currentTarget.value })
            }
          >
            <For each={config().groups}>
              {(group) => <option value={group.id}>{group.label}</option>}
            </For>
          </select>
          <label class="check-label">
            <input
              type="checkbox"
              checked={draft().favorite}
              onChange={(event) =>
                setDraft({ ...draft(), favorite: event.currentTarget.checked })
              }
            />{' '}
            Show on my favorites shelf
          </label>
          <p class="form-help">Links must use HTTPS. They open in a new tab.</p>
          <div class="form-actions">
            <button
              class="quiet-button"
              type="button"
              onClick={() => shortcutDialog?.close()}
            >
              Cancel
            </button>
            <button class="add-button" type="submit">
              Save shortcut
            </button>
          </div>
        </form>
      </dialog>
    </main>
  );
}

function ShortcutRow(props: {
  shortcut: Shortcut;
  onEdit: (item: Shortcut) => void;
  onHide: (item: Shortcut) => void;
  onFavorite: (item: Shortcut) => void;
  onRemove: (item: Shortcut) => void;
  onDuplicate: (item: Shortcut) => void;
  onMove: (id: string, direction: number) => void;
}) {
  const [menuOpen, setMenuOpen] = createSignal(false);
  return (
    <article class="catalogue-row">
      <span class="row-glyph" aria-hidden="true">
        {props.shortcut.icon || props.shortcut.label.slice(0, 1).toUpperCase()}
      </span>
      <a href={props.shortcut.url} target="_blank" rel="noopener noreferrer">
        <span>{props.shortcut.label}</span>
        <small>
          {props.shortcut.url.replace(/^https:\/\//, '').replace(/\/$/, '')}
        </small>
      </a>
      <div class="row-controls" aria-label={`${props.shortcut.label} controls`}>
        <button
          type="button"
          aria-label={`Move ${props.shortcut.label} up`}
          onClick={() => props.onMove(props.shortcut.id, -1)}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={`Move ${props.shortcut.label} down`}
          onClick={() => props.onMove(props.shortcut.id, 1)}
        >
          ↓
        </button>
        <button
          type="button"
          aria-label={`Edit ${props.shortcut.label}`}
          onClick={() => props.onEdit(props.shortcut)}
        >
          Edit
        </button>
        <div class="more-menu">
          <button
            type="button"
            aria-expanded={menuOpen()}
            aria-label={`More options for ${props.shortcut.label}`}
            onClick={() => setMenuOpen(!menuOpen())}
          >
            •••
          </button>
          <Show when={menuOpen()}>
            <div class="menu-options">
              <button
                type="button"
                onClick={() => {
                  props.onDuplicate(props.shortcut);
                  setMenuOpen(false);
                }}
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => {
                  props.onFavorite(props.shortcut);
                  setMenuOpen(false);
                }}
              >
                {props.shortcut.favorite
                  ? 'Remove from favorites'
                  : 'Add to favorites'}
              </button>
              <button
                type="button"
                onClick={() => {
                  props.onHide(props.shortcut);
                  setMenuOpen(false);
                }}
              >
                Hide shortcut
              </button>
              <button
                type="button"
                onClick={() => {
                  props.onRemove(props.shortcut);
                  setMenuOpen(false);
                }}
              >
                Remove
              </button>
            </div>
          </Show>
        </div>
      </div>
    </article>
  );
}
