import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  Show,
  type Component,
} from 'solid-js';
import { ambientTracks, type TrackId } from '@/data/audio';
import type { AudioEngine } from '@/lib/audio/engine';
import { formatTime } from '@/lib/audio/engine';
import {
  normalizeShortcutUrl,
  playlistSongSchema,
  type AudioConfig,
  type PlaylistSong,
} from '@/lib/config/schema';

type Props = {
  engine: AudioEngine;
  config: AudioConfig;
  onChange: (next: AudioConfig) => boolean;
  open: boolean;
};

const MAX_SONGS = 100;

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'song';
}

function uniqueId(name: string, songs: PlaylistSong[]): string {
  const base = slugify(name);
  const taken = new Set(songs.map((s) => s.id));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

const AudioPanel: Component<Props> = (props) => {
  const [state, setState] = createSignal(props.engine.getState());
  const [status, setStatus] = createSignal('');
  const [name, setName] = createSignal('');
  const [url, setUrl] = createSignal('');
  const [formError, setFormError] = createSignal('');

  const unsubscribe = props.engine.subscribe((s) => setState(s));
  onCleanup(unsubscribe);

  createEffect(() => props.engine.setLow(props.config.low));
  createEffect(() =>
    props.engine.setPlaylist(props.config.playlist, props.config.muted),
  );
  createEffect(() =>
    props.engine.setPlaylistVolume(props.config.playlistVolume),
  );

  const level = (id: TrackId) => state().levels[id] ?? 0;
  const current = () => props.config.playlist[state().songIndex];

  function currentMix() {
    const mix: AudioConfig['mix'] = {};
    for (const track of ambientTracks) {
      const value = level(track.id);
      if (value > 0) mix[track.id] = value;
    }
    return mix;
  }

  function persist(next: AudioConfig, message: string) {
    setStatus(props.onChange(next) ? message : 'Could not save changes');
  }

  function addSong(event: SubmitEvent) {
    event.preventDefault();
    setFormError('');
    if (props.config.playlist.length >= MAX_SONGS) {
      setFormError(`The playlist can hold up to ${MAX_SONGS} songs.`);
      return;
    }
    let normalized: string;
    try {
      normalized = normalizeShortcutUrl(url());
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Enter a valid address.',
      );
      return;
    }
    const parsed = playlistSongSchema.safeParse({
      id: uniqueId(name(), props.config.playlist),
      name: name(),
      url: normalized,
    });
    if (!parsed.success) {
      setFormError(
        name().trim()
          ? 'Enter a valid HTTPS address.'
          : 'Enter a name for the song.',
      );
      return;
    }
    const ok = props.onChange({
      ...props.config,
      playlist: [...props.config.playlist, parsed.data],
    });
    if (ok) {
      setName('');
      setUrl('');
      setStatus('Song added');
    } else {
      setFormError('Could not save the song.');
    }
  }

  function removeSong(song: PlaylistSong) {
    persist(
      {
        ...props.config,
        playlist: props.config.playlist.filter((s) => s.id !== song.id),
        muted: props.config.muted.filter((id) => id !== song.id),
      },
      'Song removed',
    );
  }

  function toggleMute(song: PlaylistSong) {
    const isMuted = props.config.muted.includes(song.id);
    persist(
      {
        ...props.config,
        muted: isMuted
          ? props.config.muted.filter((id) => id !== song.id)
          : [...props.config.muted, song.id],
      },
      isMuted ? 'Song unmuted' : 'Song muted',
    );
  }

  const sliderRow = (group: 'sfx' | 'genre') => (
    <For each={ambientTracks.filter((t) => t.group === group)}>
      {(track) => (
        <div class="audio-row">
          <span class="audio-row-label">{track.label}</span>
          <input
            type="range"
            class="range"
            min="0"
            max="10"
            step="0.1"
            value={level(track.id)}
            aria-label={`${track.label} volume`}
            onInput={(e) =>
              props.engine.setLevel(track.id, Number(e.currentTarget.value))
            }
          />
          <output class="mono audio-value">{level(track.id).toFixed(1)}</output>
        </div>
      )}
    </For>
  );

  return (
    <div
      id="audio-drawer"
      class="audio-drawer"
      role="region"
      aria-label="Sound"
      hidden={!props.open}
    >
      <section class="audio-section">
        <h3 class="mono audio-kicker">Ambient</h3>
        {sliderRow('sfx')}
      </section>

      <section class="audio-section">
        <h3 class="mono audio-kicker">Genre</h3>
        {sliderRow('genre')}
      </section>

      <section class="audio-section">
        <h3 class="mono audio-kicker">Options</h3>
        <div class="audio-actions">
          <button
            type="button"
            class="secondary-button"
            onClick={() =>
              persist({ ...props.config, mix: currentMix() }, 'Mix saved')
            }
          >
            Save
          </button>
          <button
            type="button"
            class="secondary-button"
            onClick={() => {
              props.engine.applyMix(props.config.mix);
              setStatus('Mix loaded');
            }}
          >
            Load
          </button>
          <button
            type="button"
            class="secondary-button"
            onClick={() => {
              props.engine.stopMix();
              persist({ ...props.config, mix: {} }, 'Mix cleared');
            }}
          >
            Clear
          </button>
          <button
            type="button"
            class="secondary-button"
            onClick={() => {
              props.engine.stopAll();
              setStatus('Stopped');
            }}
          >
            Stop
          </button>
          <button
            type="button"
            class="secondary-button"
            aria-pressed={props.config.low}
            onClick={() =>
              persist(
                { ...props.config, low: !props.config.low },
                props.config.low ? 'High volume' : 'Low volume',
              )
            }
          >
            {props.config.low ? 'Low' : 'High'}
          </button>
        </div>
        <p class="form-help audio-status" role="status" aria-live="polite">
          {status()}
        </p>
      </section>

      <section class="audio-section">
        <h3 class="mono audio-kicker">Playlist</h3>
        <p class="audio-now" aria-live="polite">
          {current()?.name ?? 'Nothing playing'}
        </p>
        <Show when={state().error}>
          <p class="error-message" role="alert">
            {state().error}
          </p>
        </Show>
        <div class="audio-transport">
          <button
            type="button"
            class="icon-button"
            aria-label="Previous song"
            onClick={() => props.engine.prev()}
          >
            ⏮
          </button>
          <button
            type="button"
            class="icon-button"
            aria-label={state().songPlaying ? 'Pause' : 'Play'}
            onClick={() => props.engine.togglePlaylist()}
          >
            {state().songPlaying ? '⏸' : '▶'}
          </button>
          <button
            type="button"
            class="icon-button"
            aria-label="Next song"
            onClick={() => props.engine.next()}
          >
            ⏭
          </button>
        </div>
        <div class="audio-row audio-timeline">
          <span class="mono audio-value">{formatTime(state().position)}</span>
          <input
            type="range"
            class="range"
            min="0"
            max={state().duration || 0}
            step="1"
            value={state().position}
            disabled={!(state().duration > 0)}
            aria-label="Playback position"
            onInput={(e) => props.engine.seek(Number(e.currentTarget.value))}
          />
          <span class="mono audio-value">{formatTime(state().duration)}</span>
        </div>
        <div class="audio-row">
          <span class="audio-row-label">Volume</span>
          <input
            type="range"
            class="range"
            min="0"
            max="1"
            step="0.01"
            value={state().playlistVolume}
            aria-label="Playlist volume"
            onInput={(e) =>
              props.engine.setPlaylistVolume(Number(e.currentTarget.value))
            }
            onChange={(e) =>
              props.onChange({
                ...props.config,
                playlistVolume: Number(e.currentTarget.value),
              })
            }
          />
          <output class="mono audio-value">
            {Math.round(state().playlistVolume * 100)}%
          </output>
        </div>

        <Show
          when={props.config.playlist.length > 0}
          fallback={<p class="form-help">No songs yet. Add one below.</p>}
        >
          <ul class="audio-songs">
            <For each={props.config.playlist}>
              {(song, index) => (
                <li
                  class="audio-song"
                  classList={{
                    'is-current': index() === state().songIndex,
                    'is-muted': props.config.muted.includes(song.id),
                  }}
                >
                  <button
                    type="button"
                    class="quiet-button audio-song-play"
                    onClick={() => props.engine.playSong(index())}
                  >
                    {song.name}
                  </button>
                  <button
                    type="button"
                    class="quiet-button"
                    aria-pressed={props.config.muted.includes(song.id)}
                    aria-label={`Mute ${song.name}`}
                    onClick={() => toggleMute(song)}
                  >
                    Mute
                  </button>
                  <button
                    type="button"
                    class="icon-button audio-remove"
                    aria-label={`Remove ${song.name}`}
                    onClick={() => removeSong(song)}
                  >
                    ×
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <form class="audio-add" onSubmit={addSong} novalidate>
          <h4 class="mono audio-kicker">Add song</h4>
          <label class="sr-only" for="audio-add-name">
            Song name
          </label>
          <input
            id="audio-add-name"
            type="text"
            placeholder="Name"
            maxLength={80}
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
          />
          <label class="sr-only" for="audio-add-url">
            Song address
          </label>
          <input
            id="audio-add-url"
            type="text"
            placeholder="https://example.com/song.mp3"
            value={url()}
            onInput={(e) => setUrl(e.currentTarget.value)}
          />
          <Show when={formError()}>
            <p class="error-message" role="alert">
              {formError()}
            </p>
          </Show>
          <button type="submit" class="add-button">
            Add
          </button>
        </form>
      </section>
    </div>
  );
};

export default AudioPanel;
