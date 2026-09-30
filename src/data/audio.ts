export const trackIds = [
  'forest',
  'rain',
  'waves',
  'campfire',
  'relax',
  'lofi',
  'synthwave',
] as const;

export type TrackId = (typeof trackIds)[number];

export type AmbientTrack = {
  id: TrackId;
  label: string;
  group: 'sfx' | 'genre';
  src: string;
};

export const ambientTracks: AmbientTrack[] = [
  { id: 'forest', label: 'Forest', group: 'sfx', src: '/audio/forest.mp3' },
  { id: 'rain', label: 'Rain', group: 'sfx', src: '/audio/rain.mp3' },
  { id: 'waves', label: 'Waves', group: 'sfx', src: '/audio/waves.mp3' },
  {
    id: 'campfire',
    label: 'Campfire',
    group: 'sfx',
    src: '/audio/campfire.mp3',
  },
  { id: 'relax', label: 'Relax', group: 'genre', src: '/audio/just-relax.mp3' },
  { id: 'lofi', label: 'Lo-fi', group: 'genre', src: '/audio/lofi-beats.mp3' },
  {
    id: 'synthwave',
    label: 'Synthwave',
    group: 'genre',
    src: '/audio/shadowy-figure.mp3',
  },
];
