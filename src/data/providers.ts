export type SearchFamily = 'web' | 'ai' | 'video' | 'music';

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
    icon: 'P',
    privacyNote: 'Opens Perplexity. Enter your prompt there.',
    enabledByDefault: true,
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    family: 'ai',
    homepage: 'https://chatgpt.com/',
    icon: 'C',
    privacyNote: 'Opens ChatGPT. Enter your prompt there.',
    enabledByDefault: true,
  },
  {
    id: 'copilot',
    label: 'Copilot',
    family: 'ai',
    homepage: 'https://copilot.microsoft.com/',
    icon: 'M',
    privacyNote: 'Opens Copilot. Enter your prompt there.',
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

export function buildProviderUrl(
  provider: SearchProvider,
  rawQuery: string,
): string {
  const query = rawQuery.trim();
  if (!query || !provider.queryTemplate) return provider.homepage;
  return provider.queryTemplate.replace('{query}', encodeURIComponent(query));
}
