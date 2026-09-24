import type {
  Shortcut,
  ShortcutGroup,
  StartPageConfig,
} from '@/lib/config/schema';

export const defaultGroups: ShortcutGroup[] = [
  { id: 'daily', label: 'Daily', order: 0 },
  { id: 'work', label: 'Work & build', order: 1 },
  { id: 'ai', label: 'AI & chat', order: 2 },
  { id: 'create', label: 'Create & learn', order: 3 },
  { id: 'music', label: 'Music', order: 4 },
  { id: 'sports', label: 'Sports', order: 5 },
];

const entries: Array<[string, string, string, string, boolean]> = [
  ['gmail', 'Gmail', 'https://mail.google.com/', 'daily', true],
  [
    'calendar',
    'Google Calendar',
    'https://calendar.google.com/',
    'daily',
    true,
  ],
  ['drive', 'Google Drive', 'https://drive.google.com/', 'daily', true],
  ['outlook', 'Outlook', 'https://outlook.live.com/', 'daily', true],
  ['onedrive', 'OneDrive', 'https://onedrive.live.com/', 'daily', true],
  [
    'facebook-messages',
    'Facebook Messages',
    'https://www.facebook.com/messages/e2ee/',
    'daily',
    true,
  ],
  ['linkedin', 'LinkedIn', 'https://www.linkedin.com/', 'daily', true],
  ['github', 'GitHub', 'https://github.com/', 'work', true],
  ['netlify', 'Netlify', 'https://app.netlify.com/', 'work', true],
  [
    'webtools',
    'Webtools',
    'https://webtools.tihomir-selak.from.hr/',
    'work',
    true,
  ],
  ['youtube', 'YouTube', 'https://www.youtube.com/', 'create', true],
  ['chatgpt', 'ChatGPT', 'https://chatgpt.com/', 'ai', true],
  ['gemini', 'Gemini', 'https://gemini.google.com/', 'ai', false],
  ['copilot', 'Copilot', 'https://copilot.microsoft.com/', 'ai', false],
  ['claude', 'Claude', 'https://claude.ai/', 'ai', false],
  ['grok', 'Grok', 'https://grok.com/', 'ai', false],
  ['perplexity', 'Perplexity', 'https://www.perplexity.ai/', 'ai', false],
  ['le-chat', 'Le Chat', 'https://chat.mistral.ai/', 'ai', false],
  ['huggingchat', 'HuggingChat', 'https://huggingface.co/chat/', 'ai', false],
  ['you-com', 'You.com', 'https://you.com/', 'ai', false],
  ['pi', 'Pi', 'https://pi.ai/', 'ai', false],
  ['character-ai', 'Character.AI', 'https://character.ai/', 'ai', false],
  ['talkpal', 'Talkpal', 'https://talkpal.ai/', 'ai', false],
  ['morphic', 'Morphic', 'https://morphic.sh/', 'ai', false],
  ['arxiv', 'arXiv', 'https://arxiv.org/', 'work', false],
  ['gamedev-tv', 'GameDev.tv', 'https://www.gamedev.tv/', 'create', false],
  ['udemy', 'Udemy', 'https://www.udemy.com/', 'create', false],
  ['skillshare', 'Skillshare', 'https://www.skillshare.com/', 'create', false],
  ['sitepoint', 'SitePoint', 'https://www.sitepoint.com/', 'create', false],
  ['spotify', 'Spotify', 'https://open.spotify.com/', 'music', false],
  ['udio', 'Udio', 'https://www.udio.com/', 'music', false],
  ['suno', 'Suno', 'https://suno.com/', 'music', false],
  ['eurosport', 'Eurosport', 'https://www.eurosport.com/', 'sports', false],
];

export const defaultShortcuts: Shortcut[] = entries.map(
  ([id, label, url, groupId, favorite], order) => ({
    id,
    label,
    url,
    groupId,
    icon: label.slice(0, 1).toUpperCase(),
    order,
    hidden: false,
    favorite,
    source: 'default',
  }),
);

export const createDefaultConfig = (): StartPageConfig => ({
  version: 1,
  shortcuts: defaultShortcuts.map((shortcut) => ({ ...shortcut })),
  groups: defaultGroups.map((group) => ({ ...group })),
  search: { defaultProvider: 'google', recentProviders: [] },
  weather: {
    locations: [
      {
        id: 'osijek',
        label: 'Osijek',
        latitude: 45.5511,
        longitude: 18.6939,
        timezone: 'Europe/Zagreb',
        order: 0,
      },
    ],
    activeLocationId: 'osijek',
    units: 'metric',
  },
  appearance: { theme: 'night', background: 'quiet-night' },
  quote: { enabled: true },
  audio: { enabled: false, volume: 0.55 },
  updatedAt: new Date(0).toISOString(),
});
