export const searchFamilyIds = ['web', 'ai', 'video', 'music'] as const;
export type SearchFamily = (typeof searchFamilyIds)[number];

export type SearchProvider = {
  id: string;
  label: string;
  family: SearchFamily;
  homepage: string;
  queryTemplate?: string;
  icon: string;
  privacyNote: string;
  enabledByDefault: boolean;
};

export const searchProviders: SearchProvider[] = [
  {
    id: 'google',
    label: 'Google',
    family: 'web',
    homepage: 'https://www.google.com/',
    queryTemplate: 'https://www.google.com/search?q={query}',
    icon: 'G',
    privacyNote: 'Search terms are sent to Google.',
    enabledByDefault: true,
  },
  {
    id: 'brave',
    label: 'Brave',
    family: 'web',
    homepage: 'https://search.brave.com/',
    queryTemplate: 'https://search.brave.com/search?q={query}',
    icon: 'B',
    privacyNote: 'Search terms are sent to Brave Search.',
    enabledByDefault: true,
  },
  {
    id: 'duckduckgo',
    label: 'DuckDuckGo',
    family: 'web',
    homepage: 'https://duckduckgo.com/',
    queryTemplate: 'https://duckduckgo.com/?q={query}',
    icon: 'D',
    privacyNote: 'Search terms are sent to DuckDuckGo.',
    enabledByDefault: true,
  },
  {
    id: 'bing',
    label: 'Bing',
    family: 'web',
    homepage: 'https://www.bing.com/',
    queryTemplate: 'https://www.bing.com/search?q={query}',
    icon: 'b',
    privacyNote: 'Search terms are sent to Microsoft Bing.',
    enabledByDefault: true,
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    family: 'ai',
    homepage: 'https://www.perplexity.ai/',
    queryTemplate: 'https://www.perplexity.ai/search?q={query}',
    icon: 'P',
    privacyNote: 'Your prompt is sent to Perplexity.',
    enabledByDefault: true,
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    family: 'ai',
    homepage: 'https://chatgpt.com/',
    queryTemplate: 'https://chatgpt.com/?q={query}&hints=search',
    icon: 'C',
    privacyNote: 'Your prompt is sent to ChatGPT.',
    enabledByDefault: true,
  },
  {
    id: 'copilot',
    label: 'Copilot',
    family: 'ai',
    homepage: 'https://copilot.microsoft.com/',
    queryTemplate:
      'https://www.bing.com/search?showconv=1&sendquery=1&q={query}',
    icon: 'M',
    privacyNote: 'Your prompt is sent to Microsoft Copilot.',
    enabledByDefault: true,
  },
  {
    id: 'mistral',
    label: 'Mistral Le Chat',
    family: 'ai',
    homepage: 'https://chat.mistral.ai/',
    queryTemplate: 'https://chat.mistral.ai/chat?q={query}',
    icon: 'L',
    privacyNote: 'Your prompt is sent to Mistral Le Chat.',
    enabledByDefault: true,
  },
  {
    id: 'grok',
    label: 'Grok',
    family: 'ai',
    homepage: 'https://grok.com/',
    queryTemplate: 'https://grok.com/?q={query}',
    icon: 'X',
    privacyNote: 'Your prompt is sent to Grok.',
    enabledByDefault: true,
  },
  {
    id: 'claude',
    label: 'Claude',
    family: 'ai',
    homepage: 'https://claude.ai/',
    queryTemplate: 'https://claude.ai/new?q={query}',
    icon: 'A',
    privacyNote: 'Your prompt is sent to Claude.',
    enabledByDefault: true,
  },
  {
    id: 'youtube',
    label: 'YouTube',
    family: 'video',
    homepage: 'https://www.youtube.com/',
    queryTemplate: 'https://www.youtube.com/results?search_query={query}',
    icon: '▶',
    privacyNote: 'Search terms are sent to YouTube.',
    enabledByDefault: true,
  },
  {
    id: 'skillshare',
    label: 'Skillshare',
    family: 'video',
    homepage: 'https://www.skillshare.com/',
    queryTemplate: 'https://www.skillshare.com/en/search?query={query}',
    icon: 'S',
    privacyNote: 'Search terms are sent to Skillshare.',
    enabledByDefault: true,
  },
  {
    id: 'udemy',
    label: 'Udemy',
    family: 'video',
    homepage: 'https://www.udemy.com/',
    queryTemplate: 'https://www.udemy.com/courses/search/?src=ukw&q={query}',
    icon: 'U',
    privacyNote: 'Search terms are sent to Udemy.',
    enabledByDefault: true,
  },
  {
    id: 'zenva',
    label: 'Zenva',
    family: 'video',
    homepage: 'https://academy.zenva.com/',
    queryTemplate: 'https://academy.zenva.com/search/?s={query}',
    icon: 'Z',
    privacyNote: 'Search terms are sent to Zenva Academy.',
    enabledByDefault: true,
  },
  {
    id: 'gamedev',
    label: 'GameDev.tv',
    family: 'video',
    homepage: 'https://www.gamedev.tv/',
    queryTemplate: 'https://www.gamedev.tv/courses/?query={query}',
    icon: 'G',
    privacyNote: 'Search terms are sent to GameDev.tv.',
    enabledByDefault: true,
  },
  {
    id: 'spotify',
    label: 'Spotify',
    family: 'music',
    homepage: 'https://open.spotify.com/',
    queryTemplate: 'https://open.spotify.com/search/{query}',
    icon: 'S',
    privacyNote: 'Search terms are sent to Spotify.',
    enabledByDefault: true,
  },
  {
    id: 'youtube-music',
    label: 'YouTube Music',
    family: 'music',
    homepage: 'https://music.youtube.com/',
    queryTemplate: 'https://music.youtube.com/search?q={query}',
    icon: '♪',
    privacyNote: 'Search terms are sent to YouTube Music.',
    enabledByDefault: true,
  },
  {
    id: 'soundcloud',
    label: 'SoundCloud',
    family: 'music',
    homepage: 'https://soundcloud.com/',
    queryTemplate: 'https://soundcloud.com/search?q={query}',
    icon: 'S',
    privacyNote: 'Search terms are sent to SoundCloud.',
    enabledByDefault: true,
  },
  {
    id: 'pixabay',
    label: 'Pixabay Music',
    family: 'music',
    homepage: 'https://pixabay.com/music/',
    queryTemplate: 'https://pixabay.com/music/search/{query}/',
    icon: 'P',
    privacyNote: 'Search terms are sent to Pixabay.',
    enabledByDefault: true,
  },
  {
    id: 'chosic',
    label: 'Chosic',
    family: 'music',
    homepage: 'https://www.chosic.com/free-music/all/',
    queryTemplate: 'https://www.chosic.com/free-music/all/?keyword={query}',
    icon: 'C',
    privacyNote: 'Search terms are sent to Chosic.',
    enabledByDefault: true,
  },
];

export const searchFamilies: Array<{ id: SearchFamily; label: string }> = [
  { id: 'web', label: 'Web' },
  { id: 'ai', label: 'AI' },
  { id: 'video', label: 'Video' },
  { id: 'music', label: 'Music' },
];

export function providerById(id: string): SearchProvider {
  return (
    searchProviders.find((provider) => provider.id === id) ??
    searchProviders[0]!
  );
}

export function providersFor(family: SearchFamily): SearchProvider[] {
  return searchProviders.filter((provider) => provider.family === family);
}

export function resolveFamilyDefault(
  search: { defaults: Record<SearchFamily, string> },
  family: SearchFamily,
): SearchProvider {
  const candidate = searchProviders.find(
    (provider) =>
      provider.id === search.defaults[family] && provider.family === family,
  );
  return candidate ?? providersFor(family)[0]!;
}

export function buildProviderUrl(
  provider: SearchProvider,
  rawQuery: string,
): string {
  const query = rawQuery.trim();
  if (!query || !provider.queryTemplate) return provider.homepage;
  return provider.queryTemplate.replaceAll(
    '{query}',
    encodeURIComponent(query),
  );
}
