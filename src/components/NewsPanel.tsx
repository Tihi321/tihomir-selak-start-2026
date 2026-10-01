import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from 'solid-js';
import { newsSources } from '@/lib/config/schema';
import type { NewsConfig, NewsPreset } from '@/lib/config/schema';
import { NEWS_FEEDS, getNews } from '@/lib/news/rss';
import type { NewsItem } from '@/lib/news/rss';

type Props = {
  config: NewsConfig;
  onChange: (next: NewsConfig) => boolean;
  storage?: Storage;
};

type Status = 'loading' | 'ready' | 'error';

const COMPACT_LIMIT = 6;
const MAX_PRESETS = 12;
const QUERY_LIMIT = 80;
const NAME_LIMIT = 32;

function relativeTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const minutes = Math.round((now - time) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(time).toLocaleDateString('en', {
    day: 'numeric',
    month: 'short',
  });
}

function presetId(existing: NewsPreset[]): string {
  const taken = new Set(existing.map((preset) => preset.id));
  let id = '';
  do {
    id = `news-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  } while (taken.has(id));
  return id;
}

export default function NewsPanel(props: Props) {
  const [items, setItems] = createSignal<NewsItem[]>([]);
  const [status, setStatus] = createSignal<Status>('loading');
  const [stale, setStale] = createSignal(false);
  const [filter, setFilter] = createSignal('');
  const [showAll, setShowAll] = createSignal(false);
  const [naming, setNaming] = createSignal(false);
  const [presetName, setPresetName] = createSignal('');
  const [reload, setReload] = createSignal(0);

  createEffect(() => {
    const source = props.config.source;
    reload();
    const controller = new AbortController();
    setStatus('loading');
    setStale(false);
    setItems([]);
    void getNews(source, {
      storage: props.storage,
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      if ('error' in result) {
        setStatus('error');
        return;
      }
      setItems(result.items);
      setStale(result.stale);
      setStatus('ready');
    });
    onCleanup(() => controller.abort());
  });

  const query = () => filter().trim().toLowerCase();
  const filtered = createMemo(() => {
    const needle = query();
    if (!needle) return items();
    return items().filter(
      (item) =>
        item.title.toLowerCase().includes(needle) ||
        item.summary.toLowerCase().includes(needle),
    );
  });
  const visible = createMemo(() =>
    showAll() ? filtered() : filtered().slice(0, COMPACT_LIMIT),
  );
  const feed = () => NEWS_FEEDS[props.config.source];
  const canSave = () =>
    filter().trim().length > 0 && props.config.presets.length < MAX_PRESETS;

  const setSource = (source: NewsConfig['source']) => {
    if (source === props.config.source) return;
    if (props.onChange({ ...props.config, source })) setShowAll(false);
  };
  const toggleExpanded = () =>
    props.onChange({ ...props.config, expanded: !props.config.expanded });
  const savePreset = (event: SubmitEvent) => {
    event.preventDefault();
    const name = presetName().trim().slice(0, NAME_LIMIT);
    const q = filter().trim().slice(0, QUERY_LIMIT);
    if (!name || !q || props.config.presets.length >= MAX_PRESETS) return;
    const preset: NewsPreset = {
      id: presetId(props.config.presets),
      name,
      query: q,
    };
    if (
      props.onChange({
        ...props.config,
        presets: [...props.config.presets, preset],
      })
    ) {
      setNaming(false);
      setPresetName('');
    }
  };
  const removePreset = (id: string) =>
    props.onChange({
      ...props.config,
      presets: props.config.presets.filter((preset) => preset.id !== id),
    });

  return (
    <section
      class="news-panel tile-section focus-hide grid-12"
      aria-labelledby="news-heading"
    >
      <div class="tile-section__head">
        <h2 class="tile-section__label" id="news-heading">
          <svg
            class="tile-section__glyph"
            viewBox="0 0 16 16"
            width="14"
            height="14"
            aria-hidden="true"
          >
            <path
              d="M2 3.5h9v9H3.5A1.5 1.5 0 0 1 2 11zM11 6h3v5.5a1 1 0 0 1-1 1M4.5 6h4M4.5 8.5h4"
              fill="none"
            />
            <circle cx="4.7" cy="10.6" r="0.9" />
          </svg>
          News
        </h2>
        <div class="section-actions">
          <button
            class="quiet-button"
            type="button"
            aria-pressed={props.config.expanded}
            onClick={toggleExpanded}
          >
            {props.config.expanded ? 'Compact view' : 'Expanded view'}
          </button>
          <a
            class="quiet-button"
            href={feed().homepage}
            target="_blank"
            rel="noopener noreferrer"
          >
            {feed().label} site
          </a>
        </div>
      </div>
      <div class="tile-section__body">
        <div class="news-bar">
          <div class="family-switcher" role="group" aria-label="News source">
            <For each={newsSources}>
              {(source) => (
                <button
                  type="button"
                  classList={{ selected: props.config.source === source }}
                  aria-pressed={props.config.source === source}
                  onClick={() => setSource(source)}
                >
                  {NEWS_FEEDS[source].label}
                </button>
              )}
            </For>
          </div>

          <div class="news-tools">
            <label class="sr-only" for="news-filter">
              Filter news
            </label>
            <input
              id="news-filter"
              class="filter-input"
              type="search"
              maxLength={QUERY_LIMIT}
              placeholder="Filter headlines"
              value={filter()}
              onInput={(event) => {
                setFilter(event.currentTarget.value);
                setShowAll(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && filter()) {
                  event.preventDefault();
                  event.stopPropagation();
                  setFilter('');
                }
              }}
            />
            <Show
              when={naming()}
              fallback={
                <button
                  class="quiet-button"
                  type="button"
                  disabled={!canSave()}
                  title={
                    props.config.presets.length >= MAX_PRESETS
                      ? 'Remove a saved filter first'
                      : undefined
                  }
                  onClick={() => setNaming(true)}
                >
                  Save filter
                </button>
              }
            >
              <form class="news-name-form" onSubmit={savePreset}>
                <label class="sr-only" for="news-preset-name">
                  Filter name
                </label>
                <input
                  id="news-preset-name"
                  type="text"
                  maxLength={NAME_LIMIT}
                  placeholder="Name this filter"
                  value={presetName()}
                  ref={(element) => queueMicrotask(() => element.focus())}
                  onInput={(event) => setPresetName(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      setNaming(false);
                    }
                  }}
                />
                <button
                  class="secondary-button"
                  type="submit"
                  disabled={!presetName().trim() || !canSave()}
                >
                  Save
                </button>
                <button
                  class="quiet-button"
                  type="button"
                  onClick={() => setNaming(false)}
                >
                  Cancel
                </button>
              </form>
            </Show>
          </div>
        </div>

        <Show when={props.config.presets.length}>
          <ul class="news-presets" aria-label="Saved filters">
            <For each={props.config.presets}>
              {(preset) => (
                <li class="news-preset">
                  <button
                    class="news-preset__apply"
                    type="button"
                    title={preset.query}
                    onClick={() => {
                      setFilter(preset.query);
                      setShowAll(false);
                    }}
                  >
                    {preset.name}
                  </button>
                  <button
                    class="news-preset__remove"
                    type="button"
                    aria-label={`Remove saved filter ${preset.name}`}
                    onClick={() => removePreset(preset.id)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <p class="sr-only" role="status" aria-live="polite">
          {status() === 'ready' && query()
            ? `${filtered().length} of ${items().length} stories match.`
            : ''}
        </p>

        <Show when={status() === 'loading'}>
          <p class="empty-state" role="status">
            Loading {feed().label} news...
          </p>
        </Show>
        <Show when={status() === 'error'}>
          <p class="empty-state">
            Could not load {feed().label} news right now.{' '}
            <button
              class="quiet-button"
              type="button"
              onClick={() => setReload(reload() + 1)}
            >
              Try again
            </button>
          </p>
        </Show>
        <Show when={status() === 'ready'}>
          <Show when={stale()}>
            <p class="news-note mono">
              Showing saved headlines. The feed could not be refreshed.
            </p>
          </Show>
          <Show
            when={filtered().length}
            fallback={
              <p class="empty-state">
                {query()
                  ? 'No headlines match that filter.'
                  : 'No headlines available.'}
              </p>
            }
          >
            <ul
              class="news-list"
              classList={{ 'news-list--expanded': props.config.expanded }}
            >
              <For each={visible()}>
                {(item) => (
                  <li class="news-item">
                    <Show when={!props.config.expanded && item.image}>
                      {(image) => (
                        <img
                          class="news-item__thumb"
                          src={image()}
                          loading="lazy"
                          decoding="async"
                          alt=""
                          referrerpolicy="no-referrer"
                          width="64"
                          height="64"
                        />
                      )}
                    </Show>
                    <div class="news-item__text">
                      <a
                        class="news-item__title"
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {item.title}
                      </a>
                      <Show when={item.publishedAt}>
                        <time
                          class="news-item__time mono"
                          datetime={item.publishedAt}
                        >
                          {relativeTime(item.publishedAt)}
                        </time>
                      </Show>
                      <Show when={props.config.expanded && item.summary}>
                        <p class="news-item__summary">{item.summary}</p>
                      </Show>
                    </div>
                  </li>
                )}
              </For>
            </ul>
            <Show when={filtered().length > COMPACT_LIMIT}>
              <div class="section-actions news-more">
                <button
                  class="quiet-button"
                  type="button"
                  aria-expanded={showAll()}
                  onClick={() => setShowAll(!showAll())}
                >
                  {showAll() ? 'Show fewer' : `Show all (${filtered().length})`}
                </button>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </section>
  );
}
