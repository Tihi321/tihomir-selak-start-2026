import { ambientTracks, type TrackId } from '@/data/audio';
import type { PlaylistSong } from '@/lib/config/schema';

/** Minimal structural type of the HTMLAudioElement members the engine uses. */
export type AudioLike = {
  src: string;
  volume: number;
  loop: boolean;
  preload: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  play(): Promise<void> | void;
  pause(): void;
  load?(): void;
  removeAttribute?(name: string): void;
  addEventListener(type: string, fn: () => void): void;
};

export type AudioState = {
  levels: Partial<Record<TrackId, number>>;
  mixPlaying: boolean;
  low: boolean;
  songIndex: number;
  songPlaying: boolean;
  position: number;
  duration: number;
  playlistVolume: number;
  error?: string;
};

export type Mix = Partial<Record<TrackId, number>>;

export type AudioEngine = {
  getState(): AudioState;
  subscribe(fn: (s: AudioState) => void): () => void;
  setLow(low: boolean): void;
  setLevel(id: TrackId, level: number): void;
  applyMix(mix: Mix): void;
  stopMix(): void;
  toggleMix(savedMix: Mix): void;
  setPlaylist(songs: PlaylistSong[], muted: string[]): void;
  playSong(index: number): void;
  togglePlaylist(): void;
  next(): void;
  prev(): void;
  seek(seconds: number): void;
  setPlaylistVolume(v: number): void;
  stopPlaylist(): void;
  stopAll(): void;
  dispose(): void;
};

export type EngineOptions = { createAudio?: (src: string) => AudioLike };

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

export function trackVolume(level: number, low: boolean): number {
  return (clamp(level, 0, 10) / 10) * (low ? 0.1 : 1);
}

function step(
  songs: PlaylistSong[],
  muted: string[],
  from: number,
  dir: 1 | -1,
): number {
  const n = songs.length;
  if (n === 0) return -1;
  const start = from < 0 || from >= n ? (dir === 1 ? -1 : n) : from;
  for (let i = 1; i <= n; i++) {
    const idx = (((start + dir * i) % n) + n) % n;
    if (!muted.includes(songs[idx].id)) return idx;
  }
  return -1;
}

export function nextIndex(
  songs: PlaylistSong[],
  muted: string[],
  from: number,
): number {
  return step(songs, muted, from, 1);
}

export function prevIndex(
  songs: PlaylistSong[],
  muted: string[],
  from: number,
): number {
  return step(songs, muted, from, -1);
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const s = total % 60;
  return `${Math.floor(total / 60)}:${s < 10 ? '0' : ''}${s}`;
}

const FRIENDLY_ERROR =
  'Could not play this audio. Check the address, your connection, or browser autoplay settings.';

export function createAudioEngine(options: EngineOptions = {}): AudioEngine {
  const make =
    options.createAudio ??
    ((src: string) => new Audio(src) as unknown as AudioLike);

  const tracks = new Map<TrackId, AudioLike>();
  let songs: PlaylistSong[] = [];
  let muted: string[] = [];
  let player: AudioLike | null = null;
  let disposed = false;
  let lastSecond = -1;
  const listeners = new Set<(s: AudioState) => void>();

  let state: AudioState = {
    levels: {},
    mixPlaying: false,
    low: false,
    songIndex: -1,
    songPlaying: false,
    position: 0,
    duration: 0,
    playlistVolume: 0.7,
  };

  function emit(patch: Partial<AudioState>) {
    state = { ...state, ...patch };
    state.mixPlaying = Object.values(state.levels).some((v) => (v ?? 0) > 0);
    for (const fn of [...listeners]) fn(state);
  }

  function safePlay(el: AudioLike, onFail?: () => void) {
    const fail = () => {
      onFail?.();
      emit({ error: FRIENDLY_ERROR });
    };
    try {
      const result = el.play();
      if (result && typeof result.catch === 'function') result.catch(fail);
    } catch {
      fail();
    }
  }

  function setLevel(id: TrackId, level: number) {
    if (disposed) return;
    const lv = Math.round(clamp(level, 0, 10) * 100) / 100;
    let el = tracks.get(id);
    if (lv > 0) {
      if (!el) {
        const track = ambientTracks.find((t) => t.id === id);
        if (!track) return;
        el = make(track.src);
        el.preload = 'none';
        el.loop = true;
        tracks.set(id, el);
      }
      el.volume = trackVolume(lv, state.low);
      const wasPaused = el.paused;
      emit({ levels: { ...state.levels, [id]: lv }, error: undefined });
      if (wasPaused) {
        safePlay(el, () => {
          const levels = { ...state.levels };
          delete levels[id];
          emit({ levels });
        });
      }
    } else {
      el?.pause();
      const levels = { ...state.levels };
      delete levels[id];
      emit({ levels });
    }
  }

  function stopMix() {
    for (const el of tracks.values()) el.pause();
    emit({ levels: {} });
  }

  function applyMix(mix: Mix) {
    for (const t of ambientTracks) setLevel(t.id, mix[t.id] ?? 0);
  }

  function playSong(index: number) {
    if (disposed) return;
    const song = songs[index];
    if (!song) return;
    const el = ensurePlayer();
    lastSecond = -1;
    el.src = song.url;
    el.currentTime = 0;
    el.volume = state.playlistVolume;
    emit({
      songIndex: index,
      songPlaying: true,
      position: 0,
      duration: 0,
      error: undefined,
    });
    safePlay(el, () => emit({ songPlaying: false }));
  }

  function ensurePlayer(): AudioLike {
    if (player) return player;
    const el = make('');
    el.preload = 'none';
    el.loop = false;
    el.volume = state.playlistVolume;
    el.addEventListener('ended', () => {
      const idx = nextIndex(songs, muted, state.songIndex);
      if (idx < 0) emit({ songPlaying: false, position: 0 });
      else playSong(idx);
    });
    el.addEventListener('timeupdate', () => {
      // Notify at most once per whole second.
      const second = Math.floor(el.currentTime || 0);
      if (second !== lastSecond) {
        lastSecond = second;
        emit({ position: el.currentTime || 0 });
      }
    });
    el.addEventListener('durationchange', () => {
      emit({ duration: Number.isFinite(el.duration) ? el.duration : 0 });
    });
    el.addEventListener('error', () => {
      if (el.src) emit({ songPlaying: false, error: FRIENDLY_ERROR });
    });
    player = el;
    return el;
  }

  function releaseElement(el: AudioLike) {
    el.pause();
    if (el.removeAttribute) el.removeAttribute('src');
    else el.src = '';
    el.load?.();
  }

  function stopPlaylist() {
    if (player) releaseElement(player);
    lastSecond = -1;
    emit({ songIndex: -1, songPlaying: false, position: 0, duration: 0 });
  }

  return {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    setLow(low) {
      if (state.low === low) return;
      for (const [id, el] of tracks) {
        el.volume = trackVolume(state.levels[id] ?? 0, low);
      }
      emit({ low });
    },
    setLevel,
    applyMix,
    stopMix,
    toggleMix(savedMix) {
      if (state.mixPlaying) stopMix();
      else applyMix(savedMix);
    },
    setPlaylist(nextSongs, nextMuted) {
      const current = songs[state.songIndex];
      songs = nextSongs;
      muted = nextMuted;
      if (!current) return;
      const idx = nextSongs.findIndex((s) => s.id === current.id);
      if (idx < 0) stopPlaylist();
      else if (idx !== state.songIndex) emit({ songIndex: idx });
    },
    playSong,
    togglePlaylist() {
      if (disposed) return;
      if (!songs[state.songIndex]) {
        const idx = nextIndex(songs, muted, -1);
        if (idx >= 0) playSong(idx);
        return;
      }
      const el = ensurePlayer();
      if (state.songPlaying) {
        el.pause();
        emit({ songPlaying: false });
      } else {
        emit({ songPlaying: true, error: undefined });
        safePlay(el, () => emit({ songPlaying: false }));
      }
    },
    next() {
      const idx = nextIndex(songs, muted, state.songIndex);
      if (idx >= 0) playSong(idx);
    },
    prev() {
      const idx = prevIndex(songs, muted, state.songIndex);
      if (idx >= 0) playSong(idx);
    },
    seek(seconds) {
      if (!player || !(state.duration > 0)) return;
      const t = clamp(seconds, 0, state.duration);
      player.currentTime = t;
      emit({ position: t });
    },
    setPlaylistVolume(v) {
      const vol = clamp(v, 0, 1);
      if (player) player.volume = vol;
      if (vol !== state.playlistVolume) emit({ playlistVolume: vol });
    },
    stopPlaylist,
    stopAll() {
      stopMix();
      stopPlaylist();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const el of tracks.values()) releaseElement(el);
      tracks.clear();
      if (player) releaseElement(player);
      player = null;
      listeners.clear();
    },
  };
}
