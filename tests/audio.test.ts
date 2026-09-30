import { describe, expect, it } from 'vitest';
import {
  createAudioEngine,
  formatTime,
  nextIndex,
  prevIndex,
  trackVolume,
  type AudioLike,
} from '@/lib/audio/engine';
import type { PlaylistSong } from '@/lib/config/schema';

class FakeAudio implements AudioLike {
  volume = 1;
  loop = false;
  preload = 'auto';
  currentTime = 0;
  duration = NaN;
  paused = true;
  playCalls = 0;
  rejectPlay = false;
  listeners = new Map<string, Array<() => void>>();
  constructor(public src: string) {}
  play() {
    this.playCalls++;
    if (this.rejectPlay) return Promise.reject(new Error('blocked'));
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  addEventListener(type: string, fn: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  fire(type: string) {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
}

function setup() {
  const created: FakeAudio[] = [];
  const engine = createAudioEngine({
    createAudio: (src) => {
      const a = new FakeAudio(src);
      created.push(a);
      return a;
    },
  });
  return { engine, created };
}

const song = (id: string): PlaylistSong => ({
  id,
  name: id,
  url: `https://example.com/${id}.mp3`,
});
const songs = ['a', 'b', 'c'].map(song);
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('helpers', () => {
  it('trackVolume scales, clamps and applies low', () => {
    expect(trackVolume(10, false)).toBe(1);
    expect(trackVolume(5, false)).toBe(0.5);
    expect(trackVolume(10, true)).toBeCloseTo(0.1);
    expect(trackVolume(50, false)).toBe(1);
    expect(trackVolume(-3, false)).toBe(0);
  });

  it('nextIndex and prevIndex wrap and skip muted', () => {
    expect(nextIndex(songs, [], 0)).toBe(1);
    expect(nextIndex(songs, [], 2)).toBe(0);
    expect(nextIndex(songs, ['b'], 0)).toBe(2);
    expect(prevIndex(songs, [], 0)).toBe(2);
    expect(prevIndex(songs, ['b'], 2)).toBe(0);
    expect(nextIndex(songs, ['a', 'b', 'c'], 0)).toBe(-1);
    expect(prevIndex(songs, ['a', 'b', 'c'], 0)).toBe(-1);
    expect(nextIndex([], [], -1)).toBe(-1);
    expect(nextIndex(songs, [], -1)).toBe(0);
    expect(prevIndex(songs, [], -1)).toBe(2);
    expect(nextIndex([songs[0]], [], 0)).toBe(0);
  });

  it('formatTime formats m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
  });
});

describe('engine ambient mix', () => {
  it('does not create audio until asked', () => {
    const { created } = setup();
    expect(created).toHaveLength(0);
  });

  it('setLevel lazily creates and plays, level 0 pauses', () => {
    const { engine, created } = setup();
    engine.setLevel('rain', 4);
    expect(created).toHaveLength(1);
    expect(created[0].src).toBe('/audio/rain.mp3');
    expect(created[0].loop).toBe(true);
    expect(created[0].preload).toBe('none');
    expect(created[0].volume).toBeCloseTo(0.4);
    expect(created[0].paused).toBe(false);
    expect(engine.getState().mixPlaying).toBe(true);
    engine.setLevel('rain', 0);
    expect(created[0].paused).toBe(true);
    expect(engine.getState().mixPlaying).toBe(false);
    engine.setLevel('rain', 2);
    expect(created).toHaveLength(1);
  });

  it('setLow recalculates volume of playing tracks', () => {
    const { engine, created } = setup();
    engine.setLevel('rain', 10);
    engine.setLow(true);
    expect(created[0].volume).toBeCloseTo(0.1);
    engine.setLow(false);
    expect(created[0].volume).toBe(1);
  });

  it('toggleMix loads saved mix then stops', () => {
    const { engine, created } = setup();
    engine.toggleMix({ rain: 5, forest: 3 });
    expect(created).toHaveLength(2);
    expect(engine.getState().mixPlaying).toBe(true);
    engine.toggleMix({ rain: 5 });
    expect(created.every((a) => a.paused)).toBe(true);
    expect(engine.getState().mixPlaying).toBe(false);
  });

  it('a rejected play sets error without throwing', async () => {
    const { engine } = setup();
    const e = createAudioEngine({
      createAudio: (src) => {
        const a = new FakeAudio(src);
        a.rejectPlay = true;
        return a;
      },
    });
    expect(() => e.setLevel('rain', 5)).not.toThrow();
    await flush();
    expect(e.getState().error).toBeTruthy();
    expect(e.getState().levels.rain).toBeUndefined();
    expect(engine.getState().error).toBeUndefined();
  });

  it('stopAll pauses everything', () => {
    const { engine, created } = setup();
    engine.setPlaylist(songs, []);
    engine.setLevel('rain', 5);
    engine.playSong(0);
    engine.stopAll();
    expect(created.every((a) => a.paused)).toBe(true);
    expect(engine.getState().songIndex).toBe(-1);
    expect(engine.getState().songPlaying).toBe(false);
    expect(engine.getState().mixPlaying).toBe(false);
  });

  it('dispose pauses and notifies nobody afterwards', () => {
    const { engine, created } = setup();
    engine.setLevel('rain', 5);
    engine.dispose();
    expect(created[0].paused).toBe(true);
    engine.setLevel('forest', 5);
    expect(created).toHaveLength(1);
  });
});

describe('engine playlist', () => {
  it('togglePlaylist starts first playable song', () => {
    const { engine, created } = setup();
    engine.setPlaylist(songs, ['a']);
    engine.togglePlaylist();
    expect(engine.getState().songIndex).toBe(1);
    expect(created[0].src).toBe(songs[1].url);
    engine.togglePlaylist();
    expect(engine.getState().songPlaying).toBe(false);
    expect(created[0].paused).toBe(true);
  });

  it('next, prev and ended auto-advance', () => {
    const { engine, created } = setup();
    engine.setPlaylist(songs, []);
    engine.playSong(0);
    engine.next();
    expect(engine.getState().songIndex).toBe(1);
    engine.prev();
    expect(engine.getState().songIndex).toBe(0);
    created[0].fire('ended');
    expect(engine.getState().songIndex).toBe(1);
    expect(created[0].src).toBe(songs[1].url);
  });

  it('tracks time and duration, seek requires duration', () => {
    const { engine, created } = setup();
    engine.setPlaylist(songs, []);
    engine.playSong(0);
    engine.seek(5);
    expect(created[0].currentTime).toBe(0);
    created[0].duration = 120;
    created[0].fire('durationchange');
    created[0].currentTime = 3.4;
    created[0].fire('timeupdate');
    expect(engine.getState().duration).toBe(120);
    expect(engine.getState().position).toBe(3.4);
    engine.seek(50);
    expect(created[0].currentTime).toBe(50);
  });

  it('play rejection sets error and does not throw', async () => {
    const created: FakeAudio[] = [];
    const engine = createAudioEngine({
      createAudio: (src) => {
        const a = new FakeAudio(src);
        a.rejectPlay = true;
        created.push(a);
        return a;
      },
    });
    engine.setPlaylist(songs, []);
    expect(() => engine.playSong(0)).not.toThrow();
    await flush();
    expect(engine.getState().error).toBeTruthy();
    expect(engine.getState().songPlaying).toBe(false);
  });

  it('setPlaylist removing the current song stops it', () => {
    const { engine, created } = setup();
    engine.setPlaylist(songs, []);
    engine.playSong(1);
    engine.setPlaylist([songs[0], songs[2]], []);
    expect(engine.getState().songIndex).toBe(-1);
    expect(created[0].paused).toBe(true);
  });

  it('setPlaylist keeps playing and reindexes current song', () => {
    const { engine, created } = setup();
    engine.setPlaylist(songs, []);
    engine.playSong(2);
    engine.setPlaylist([songs[0], songs[2]], []);
    expect(engine.getState().songIndex).toBe(1);
    expect(created[0].paused).toBe(false);
  });

  it('setPlaylistVolume clamps and applies', () => {
    const { engine, created } = setup();
    engine.setPlaylist(songs, []);
    engine.playSong(0);
    engine.setPlaylistVolume(2);
    expect(created[0].volume).toBe(1);
    expect(engine.getState().playlistVolume).toBe(1);
  });
});
