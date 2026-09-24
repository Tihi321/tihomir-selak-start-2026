# Legacy start page audit — 24 September 2026

Source inspected read-only: `C:\projects\Personal\astro-start-tab`. This note describes migration inputs; the old source is not an instruction to preserve every feature or URL.

## Existing shortcut inventory

`src/layouts/Shortcuts.astro` contains 50 fixed destinations. Classification for the new catalogue:

| Status | Legacy entries | Treatment |
| --- | --- | --- |
| Pin by default | Gmail, Google Calendar (`Kalendar`), Google Drive, Outlook, OneDrive, Messenger, LinkedIn, GitHub, Netlify, Webtools, YouTube, ChatGPT | Use the plan's 12 favorites; update Messenger to the user-approved Facebook Messages URL and use generic service URLs. |
| Include in grouped catalogue | arXiv (`Arix`), Skillshare, Udemy, GameDev.tv, SitePoint, Spotify, Udio, Suno, Claude, Gemini, Copilot, Pi, HuggingChat (`H Chat`), Le Chat, Perplexity, Talkpal, Character.AI, Eurosport | Correct labels, use service homepages, and leave unpinned unless the plan selects otherwise. |
| Optional migration suggestions | AITools, Games, Penpot, Trello, StackBlitz, Replit, Colab, Consensus (`Concensus`), Coursera, SoundCloud, Leonardo, Ideogram, Microsoft Designer/Image Creator, Clipdrop, Genmo, PixVerse, Luma, Kling, Websim | Keep only after URL and relevance checks; do not fill the first screen with them. |
| Exclude from committed defaults | Slack | Legacy URL contains a private workspace/channel path. A user may add a generic or personal Slack link locally. |

The new catalogue additionally needs user-requested services absent from the fixed list: Grok, You.com, Morphic, and editable direct YouTube channel links. Review Eurosport's current destination. Preserve custom links from browser storage if valid; never serialize them into committed defaults.

## Browser storage keys

| Key | Current shape/use | Migration approach |
| --- | --- | --- |
| `shortcuts` | JSON array of `{ name, url }` custom links | Validate label and `https:` URL, assign ids/group/order, deduplicate, import once, and report rejected entries. |
| `showcustomshortcuts` | Boolean string | Ignore as a layout preference; new catalogue is always reachable. |
| `searchpresets` | JSON object of named query strings | Preserve only if the new search UI supports named presets; never dispatch a stored value as a URL. |
| `ai-search-engine`, `text-search-engine`, `video-search-engine`, `music-search-engine` | Provider IDs | Map only verified provider IDs; use safe defaults for unavailable providers. |
| `bg-image-url` | Arbitrary image URL | Do not insert directly into CSS. Defer import until image-source validation and background customization exist. |
| `focus` | Boolean string | Map to an appearance preference only if the new UI retains that behavior. |
| `rss` | Cached raw feed data | Do not migrate article bodies; new news cache has a separate validated format. |
| `randomquote`, `englishquotes`, `randomword` | CDN content caches | Do not migrate; local quote fallback supersedes these, vocabulary is removed. |
| `beats`, `customsongs`, `audio-level`, `playlist-audio-volume`, `playlist-muted-songs` | Audio preferences and custom playlist | Defer until the user approves the optional focus-audio phase. |

The legacy application uses unrelated keys without a schema. The new site should read them on the same production origin before initializing its versioned configuration, write the new configuration atomically, and set a migration marker only after a successful save. A fresh local development origin will not contain that browser data, so migration tests need fixtures.

## Search behavior to avoid copying

The old default AI engine is `phind` in `Search.tsx` but `perplexity` in `SearchEngines.tsx`. Its route builders include undocumented AI prompt parameters, provider-specific tracking parameters, and a Zenva empty-query fallback to Udemy. Keep only tested query URL contracts; treat Gemini as a normal shortcut until a documented direct prompt route exists. The existing web search query encoders and YouTube search shape are useful starting references, not proof of current validity.

## CDN baseline

The old frontend fetches daily quote JSON and raw RSS through `cdn.tihomir-selak.from.hr` and caches them in browser storage. The `cdn` repository's build pipeline remains a separate workstream. The new frontend should consume the proposed normalized `news/index.json` only after that file is produced and verified, with cached/offline fallback and no article HTML in storage.

No source or license for the legacy night background was found in the legacy README or source references. Recreate the atmosphere with original CSS or obtain documented rights before copying that bitmap into the new repository.
