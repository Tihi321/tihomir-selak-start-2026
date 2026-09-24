# Start page 2026 — research and implementation plan

- Status: core dashboard and weather/quote foundation implemented locally; news, audio, preview, and production cutover remain
- Prepared: 24 September 2026
- Target: `https://start.tihomir-selak.from.hr/`
- New repository: `https://github.com/Tihi321/tihomir-selak-start-2026`
- Repository created: 24 September 2026
- Initial default branch: `master`
- Intended local path: `C:\projects\Personal\tihomir-selak-start-2026`
- Legacy site source: `C:\projects\Personal\astro-start-tab` / `Tihi321/astro-start-tab`
Supporting static CDN: `C:\projects\Personal\cdn` / `Tihi321/cdn`

## 1. Outcome and recommendation

Build a clean, local-first replacement for the current start page. Its primary job is to get Tihomir from a new tab to the right destination quickly: one excellent search/command input, a compact favorites shelf backed by an editable shortcut catalogue, multi-location weather, a concise news rail, and optional quote and focus audio.

Do not redesign around the current fixed page. Preserve useful behavior and existing browser data through a migration layer, but start the new codebase and layout cleanly.

The launch recommendation is:

1. A static Astro 7 site with one focused Solid island for stateful dashboard behavior.
2. A versioned, editable configuration model rather than shortcut markup spread through components.
3. Local browser storage plus JSON import/export at launch.
4. Open-Meteo weather for one or more saved locations, cached locally and never dependent on a location permission prompt.
5. A small local quote collection with graceful offline behavior.
6. A lazy, user-triggered focus-audio drawer after the core page is solid.
7. A compact, optional news rail backed by normalized JSON from the existing static CDN pipeline.
8. No vocabulary widget, cloud account, server-side application, or automatic cross-device sync in version 1.

`custom-new-tab` is not used and is out of scope. The replacement remains a frontend-only hosted site. The existing `cdn` repository may continue to provide static generated quote/news data, but it is not an application backend and must not become a source of accounts or secrets.

## 2. Required first step before implementation

**Open the new repository before any implementation work begins.**

The implementing agent must:

1. Open or clone `https://github.com/Tihi321/tihomir-selak-start-2026` at `C:\projects\Personal\tihomir-selak-start-2026`.
2. Open that repository as the active Codex workspace; do not implement from the coordination folder or from either legacy repository.
3. Copy this complete plan into the new repository at `.codex/tickets/start-site-2026/plan.md` so the implementation record travels with the code.
4. Read the complete plan and all repository instructions.
5. Invoke the global `implement` skill with the repository copy of this plan, as required by the machine instructions.
6. Verify `main` is clean and synchronized, then work on a feature branch such as `feat/start-page-foundation` unless the user explicitly requests direct work on `main`.
7. Treat `astro-start-tab` and `cdn` as read-only sources during the start-page implementation. If the CDN normalization work in this plan is approved, open `cdn` separately and make that supporting change in its own branch.

## 3. What exists today

### Repository and delivery baseline

- The live dashboard comes from `astro-start-tab`, not `custom-new-tab`.
- `astro-start-tab` is synchronized with `origin/master`; its latest inspected commit is `32492e6` from 10 March 2025.
- It uses Astro 4.5, Solid 1.8, styled-components, lodash, Node 18 in CI, and a third-party Netlify deploy action.
- The public directory is about 34.1 MB: about 25.0 MB of MP3 audio and 8.8 MB of images.
- `cdn` is synchronized with `origin/main` and already acts as a static scheduled content mirror. Its daily workflow fetches Bug, The Verge, and TechCrunch RSS, generates the daily quote/word files, and deploys the `public` directory to Netlify with cross-origin access enabled.
- The live CDN feeds were healthy and current when checked on 24 September 2026: all three returned HTTP 200 and contained articles from 23–24 September 2026.

### Live visual audit

The supplied 1893 px screenshot and a live review on 24 September 2026 show that the desktop page is recognizable and personal, but the visual hierarchy is weak: quote, weather, date, search, fifty shortcut tiles, custom shortcuts, feed controls, news, and audio all compete on one screen.

At an observed 549 px viewport:

- quote, weather, date, and the word widget collide in the header;
- only the first twelve shortcuts fit before the hover-dependent clipping boundary;
- the custom-shortcut control, feed controls, and news links crowd the same row;
- a large empty/opaque feed surface dominates the middle of the page;
- footer links remain pinned to the edges rather than following content;
- controls with no visible labels or accessible names are difficult to understand;
- the page has no horizontal document overflow at that width, but it is visually overlapping and functionally cramped.

The live DOM exposes 50 fixed shortcuts. The quote and word data eventually load, but the first render can show empty areas while CDN data and the weather iframe initialize.

### Product and code audit

| Area | Current behavior | Problem to solve |
| --- | --- | --- |
| Search | Four modes with provider settings stored separately | Provider logic is a large switch statement; defaults disagree (`phind` in execution, `perplexity` in settings); several AI query links are undocumented or unstable |
| Shortcuts | 50 links hard-coded in `Shortcuts.astro` plus a separate custom list | No edit/reorder/category model for defaults; hover-only expansion; misspellings; a private Slack workspace path is committed publicly |
| Custom data | Stored under several unrelated `localStorage` keys | No schema/version, validation, backup, conflict handling, or migration path |
| Weather | A scaled Meteoblue iframe with absolute positioning | Layout collision, third-party UI/branding, poor failure state, more data than the page needs |
| Quotes/word | Fetched from personal CDN and cached | No error handling; blank states when the CDN fails; vocabulary is not central to the requested product |
| News | Three raw RSS feeds mirrored daily through the personal CDN | The source pipeline works, but the frontend downloads/parses large XML, stores article HTML in local storage, has no explicit freshness state, and devotes too much space to the result |
| Music | Ambient sounds and tracks shipped with the page | About 25 MB of audio; complex controls; no value until the user explicitly opens/starts it |
| Backgrounds | One base image plus twenty alternates | About 8.8 MB of images; URL clipboard workflow is unclear and permission-sensitive |
| Accessibility | Many image links lack alt text and buttons lack names | Keyboard, screen-reader, focus, contrast, and touch behavior need a deliberate rebuild |
| Delivery | Node 18, `yarn install`, third-party deploy action | Node 18 is end-of-life; no immutable install, test gate, preview workflow, or current runtime baseline |

Existing implementation defects to remove rather than migrate include the Zenva empty-query fallback to Udemy, `Arix`/`Concensus`/`Lofy`/`GERNES` spelling mistakes, the hard-coded Slack channel URL, unsafe/unvalidated custom URLs, `target="_blank"` links without a consistent rel policy, and ambiguous controls labelled only `show`, `+`, `-`, or colored circles.

## 4. Product scope

### Launch essentials

- One fast search/command input, focused by `/` and optionally `Ctrl/Cmd+K`.
- Data-driven provider selection with a visible current provider and recent providers.
- Twelve to sixteen frequent shortcuts, editable, reorderable, hideable, and grouped.
- Add/edit/remove shortcut dialog with URL validation and preview.
- Date, local time, current weather, daily high/low, and a compact condition icon.
- Multiple saved weather locations with previous/next arrows, an active location saved locally, and location management in settings.
- Quote of the day with a manual next-quote action.
- A compact news rail with Bug, The Verge, and TechCrunch source filters, a maximum of six visible headlines, freshness information, and a cached offline fallback.
- Settings for location, units, theme/background, default search provider, and shortcut behavior.
- Versioned local configuration, legacy-data migration, reset, JSON export, and JSON import.
- Keyboard navigation, useful focus states, touch targets, reduced motion, and offline fallbacks.
- `noindex, nofollow` unless public discovery is intentionally enabled later.

### Keep, but simplify

- Preserve the nocturnal illustrated atmosphere as the single visual anchor, using one optimized image rather than a twenty-image gallery at launch.
- Keep the four conceptual search families—web, AI, video, music—but show only providers with stable, verified URL contracts.
- Keep focus audio as an optional, lazy panel after the core dashboard is complete.
- Keep the existing personal CDN as a static content source, but consume small normalized JSON rather than parsing raw RSS in the browser.

### Remove from the launch surface

- The vocabulary/word-of-the-day widget.
- Public hard-coded private workspace/channel URLs.
- A fifty-item default shortcut wall.
- Search destinations whose query deep links cannot be verified.
- Automatic location permission prompts.
- Background import through clipboard reading.
- Audio autoplay or any audio download before the user opens the player.

### Defer until there is proven use

- Google Drive synchronization.
- Login/accounts or a custom backend.
- A full RSS reader, article-content view, or personalized recommendation system.
- Multiple background packs and user-uploaded media.
- Calendar, tasks, email counts, or other private-account integrations.

## 5. Search strategy and Gemini finding

Search providers must be a typed registry, not a switch statement. Each entry includes an id, label, category, homepage, optional query template, icon, privacy note, and `enabledByDefault` flag. Unit tests must verify URL encoding and empty-query behavior.

### Recommended launch set

| Family | Launch providers | Notes |
| --- | --- | --- |
| Web | Google, Brave, DuckDuckGo, Bing | Established query URLs; select one default |
| AI | Perplexity, ChatGPT Search, Copilot, Google AI Mode only after live verification | Keep only query routes that work while signed in and signed out; otherwise open the homepage |
| Video | YouTube | Learning platforms are better as shortcuts unless their search URLs pass tests |
| Music | Spotify, YouTube Music, SoundCloud | Open search results; do not embed tracking-heavy players by default |

### Providers to demote or re-verify

Claude, Gemini, Mistral/Le Chat, Grok, You.com, Morphic, and Phind remain useful destinations, but their prefilled-prompt URLs are not all documented public interfaces. Make them ordinary shortcuts unless an implementation-time browser test proves a stable query route. Skillshare, Udemy, Zenva, GameDev.tv, Pixabay Music, and Chosic should also become ordinary shortcuts unless Tihomir confirms they are active search habits.

### Gemini conclusion

Google officially documents entering `@gemini` in Chrome's address bar, pressing Tab or Space, and then typing the prompt. It does not document a stable public Gemini web-app query parameter suitable for this page. Therefore:

- keep a normal Gemini shortcut;
- do not ship a guessed `gemini.google.com/app?q=...` integration;
- offer Google AI Mode through the official `google.com/ai` entry point;
- optionally document Chrome's native `@gemini` shortcut in help/settings;
- add direct Gemini prompt dispatch only if Google later documents a supported route and automated/manual verification passes.

## 6. Shortcut model

Shortcuts should be data, not component markup.

Use a small favorites shelf plus a complete grouped catalogue. The favorites shelf keeps the first screen fast; opening “All shortcuts” exposes everything below without hiding it behind hover.

Proposed pinned favorites:

1. Gmail
2. Google Calendar
3. Google Drive
4. Outlook
5. OneDrive
6. Facebook Messages
7. LinkedIn
8. GitHub
9. Netlify
10. Webtools
11. YouTube
12. ChatGPT

Proposed full catalogue:

- **Google**: Gmail, Google Calendar, Google Drive, YouTube, Gemini.
- **Microsoft**: Outlook, OneDrive, Copilot.
- **Communication/social**: LinkedIn and Facebook Messages. Replace `messenger.com` with the user-approved `https://www.facebook.com/messages/e2ee/` destination. Do not preserve the legacy Messenger URL as a default.
- **Build/research**: GitHub, Netlify, Webtools, arXiv. Correct the legacy `Arix` label to `arXiv`.
- **Video/learning**: YouTube, GameDev.tv, Udemy, Skillshare, SitePoint, plus user-added direct YouTube channel links.
- **Music**: Spotify, Udio, Suno.
- **AI/chatbots**: ChatGPT, Gemini, Claude, Copilot, Grok, Perplexity, Le Chat, HuggingChat, You.com, Pi, Character.AI, Talkpal, and Morphic. Keep Phind only if the implementation-time availability/query audit passes.
- **Sports**: Eurosport.

Use generic service homepages for defaults; never commit a private account, workspace, channel, document, or dashboard route. Preserve additional existing links as an optional migration catalogue so the user can add them without retyping. Catalogue membership and pinned status are independent, so a service can remain available without consuming the main view.

Each shortcut should have:

```ts
type Shortcut = {
  id: string;
  label: string;
  url: string;
  groupId: string;
  icon?: string;
  order: number;
  hidden?: boolean;
  source: 'default' | 'user' | 'migrated';
};
```

Required behavior:

- add, edit, duplicate, remove, hide, and reorder;
- keyboard and pointer reordering, with simple move buttons as the accessible baseline;
- URL normalization restricted to `https:` and intentionally approved protocols such as `mailto:`;
- generated letter/icon fallback when no local icon exists;
- search/filter across shortcut names and groups;
- undo for destructive shortcut removal within the current session;
- export/import without including browser history or other unrelated local data.

## 7. Storage and synchronization decision

### Launch choice: local-first configuration

Use one schema-versioned configuration document behind a storage adapter. Store small settings in `localStorage`; move only large future media to IndexedDB. The application must not scatter new state across ad-hoc keys.

```ts
type StartPageConfigV1 = {
  version: 1;
  shortcuts: Shortcut[];
  groups: ShortcutGroup[];
  search: SearchPreferences;
  weather: WeatherPreferences;
  appearance: AppearancePreferences;
  quote: QuotePreferences;
  audio: AudioPreferences;
  updatedAt: string;
};

type WeatherPreferences = {
  locations: WeatherLocation[];
  activeLocationId: string;
  units: 'metric' | 'imperial';
};

type WeatherLocation = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  timezone: string;
  order: number;
};
```

Launch requirements:

- validate every load and import against a schema;
- preserve a last-known-good copy before applying an import;
- export a human-readable JSON file with version and timestamp;
- offer merge and replace import modes;
- show precise validation errors without partially applying invalid data;
- never include secrets, tokens, browsing history, or automatically collected location history in exports; saved city coordinates are part of the user's explicit configuration and must be clearly shown in the export preview;
- migrate the old origin's known keys once, then record migration completion;
- retain a reset-to-defaults action with a confirmation step.

### Why Google Drive is not phase 1

Google Drive's `appDataFolder` is a technically suitable private place for configuration and uses the narrow `drive.appdata` scope. It still requires a Google Cloud project, OAuth client registration/consent, token lifecycle handling, offline/conflict behavior, and privacy documentation. That is too much complexity for a single-user launch feature.

If cross-device sync is requested after local use is validated, implement it as an optional adapter behind the same configuration interface:

1. Google sign-in is opt-in and never blocks local use.
2. Request only `drive.appdata`.
3. Store one versioned JSON configuration file.
4. Use revision/ETag or `updatedAt` conflict checks; never silently overwrite newer data.
5. Keep import/export as an account-independent recovery path.
6. Document how to disconnect and delete the stored configuration.

## 8. Weather, quote, news, and audio

### Weather

Use Open-Meteo's forecast API. Its non-commercial free API requires no account or API key and permits up to 10,000 calls per day, with attribution and no uptime guarantee.

Implementation rules:

- default to a manually configured city such as Osijek; store city label, latitude, longitude, timezone, and order;
- support multiple saved locations in local storage, with add, rename, reorder, and remove actions;
- show previous and next arrow buttons beside the active location and save `activeLocationId` so refresh restores the same place;
- wrap from the last location to the first and vice versa; when only one location exists, hide or disable both arrows without leaving dead space;
- make the arrow controls keyboard accessible and announce the newly selected location and weather summary to assistive technology;
- swipe navigation may be added on touch devices only as an enhancement; visible arrow controls remain the baseline;
- offer city search through Open-Meteo geocoding only when the settings UI is open, show country/region in ambiguous results, and require explicit selection before saving;
- do not request browser geolocation unless the user explicitly selects “Use my current location”;
- request only current temperature, apparent temperature, weather code, daily high/low, precipitation chance, sunrise/sunset if used, and timezone;
- cache successful responses for 15 minutes and display the last successful result when offline;
- show a compact unavailable state without collapsing layout;
- link attribution to Open-Meteo and its underlying data sources;
- keep all weather rendering native to the page rather than embedding an iframe.

### Quote

- Keep a small, licensed/verified local quote set in the repository so the feature works offline.
- Rotate deterministically by local date and allow a user-triggered next quote.
- If the personal CDN remains an optional source, time it out, validate the payload, and fall back locally.
- Store author/source notes and remove quotes with uncertain attribution.
- Keep the quote visually quiet; it should not compete with search.

### News

Keep news as a compact awareness feature, not a reader. The existing `cdn` repository remains the recommended source because it already fetches the three feeds successfully on a schedule and publishes with CORS. A static mirror is more reliable and private than adding an unknown RSS-to-JSON service, and it preserves the frontend-only architecture.

Recommended CDN improvement, performed in a separate `cdn` branch only when implementation reaches this phase:

1. Fetch Bug, The Verge, and TechCrunch on a schedule; start with every six hours and adjust only if Netlify/GitHub usage makes that impractical.
2. Parse and normalize feeds during the CDN build rather than in the browser.
3. Publish a small `news/index.json` with `generatedAt`, per-source `fetchedAt`, source status, and at most ten recent items per source.
4. Each item contains only `id`, `source`, `title`, `url`, `publishedAt`, optional `imageUrl`, and an optional short plain-text summary. Do not ship full article HTML.
5. Validate `https:` article/image URLs, strip markup, cap field lengths, deduplicate by canonical URL, and sort by publication time.
6. If one source fails, retain the last known valid data for that source and mark it stale. Fail the generation only when no valid current or fallback data exists.
7. Keep raw RSS endpoints temporarily for backward compatibility; the new frontend consumes JSON.
8. Upgrade the CDN workflow from Node 18, use an immutable install, and replace the unpinned legacy deployment path during that separate repository task.

Frontend behavior:

- show source tabs for All, Bug, The Verge, and TechCrunch;
- show four headlines by default and no more than six in expanded mode;
- display source, relative publication time, and a visible “updated” time;
- open articles in a new tab with the appropriate rel attributes;
- cache the last valid normalized response and show it with a stale label when offline;
- provide refresh as a user action, rate-limited locally; do not poll in the background;
- let the user hide the entire news module or disable individual sources in settings;
- do not store article bodies or build a personal reading history.

### Audio

- Build the player only after the core dashboard passes its acceptance checks.
- Open it in a side or bottom drawer on explicit user action.
- Lazy-load both code and media; download no track until play is requested.
- Keep ambient presets separate from music tracks.
- Start with no more than three optimized audio assets and record their licenses/sources.
- Prefer compressed, loop-safe assets served from the personal CDN or optimized local files; set a launch audio budget below 8 MB total.
- Preserve volume and last selection locally, but never autoplay.
- Offer Spotify, YouTube Music, or SoundCloud search as external actions rather than embedded third-party players.

## 9. Visual direction

### Concept: quiet night desk

The current purple city illustration is the recognizable personal element. Keep that atmosphere, but make the page feel like a calm desk at night rather than a translucent control wall. Search is the central instrument; time/weather and quote are peripheral context; shortcuts are an ordered shelf.

Use one atmospheric background and one structured foreground plane. Avoid a grid of identical glass cards, excessive blur, decorative status labels, or motion on every item.

### Initial tokens

- `--night-950: #0E1020` — page foundation and strongest text background.
- `--plum-800: #30213E` — sampled from the illustrated night scene.
- `--mist-100: #F2F4F6` — primary text and light surfaces.
- `--mist-400: #AEB9C7` — secondary text.
- `--signal-400: #67D1D0` — focus, selected provider, and live state.
- `--amber-400: #EFB56B` — weather warning or one warm secondary accent.

Typography:

- self-host `Archivo` variable for controls, labels, time, and shortcut text, maintaining family continuity with the other personal sites;
- use self-hosted `Literata` only for the quote if the extra font remains within the performance budget; otherwise use Archivo throughout;
- keep control text at 15–17 px and never hide core controls below 14 px;
- use tabular numerals for time and temperature without turning all metadata into monospace.

### Desktop layout

```text
┌────────────────────────────────────────────────────────────────────┐
│  12:17 · Wed 24 Sep             ‹  Osijek  20°  Clear  ›   Settings│
│                                                                    │
│             “Once we accept our limits…” — Einstein               │
│                                                                    │
│       [ Google ▼ ]  Search or type a command…              [↵]    │
│       Web · AI · Video · Music         / focuses search            │
│                                                                    │
│  Daily        Work / build          AI            Create / learn   │
│  Gmail        GitHub                ChatGPT       YouTube           │
│  Calendar     Netlify               Gemini        + Add shortcut    │
│  Drive        Slack                 Perplexity                      │
│                                                                    │
│  News  All · Bug · Verge · TechCrunch        Updated 12:05         │
│  Headline one · Headline two · Headline three · Headline four       │
│                                                                    │
│  [Focus audio]                                      [Edit shortcuts]│
└────────────────────────────────────────────────────────────────────┘
```

Alignment is predominantly left-aligned. The search rail may be centered within a maximum-width column, but labels, groups, settings, and shortcut text should follow a consistent left edge.

### Mobile layout

```text
┌──────────────────────────────┐
│ 12:17       ‹ Osijek 20° › ⚙ │
│ Wed 24 Sep                  │
│                              │
│ [Google ▼]                   │
│ [Search or command…      ↵]  │
│ Web  AI  Video  Music        │
│                              │
│ Daily                        │
│ Gmail  Calendar  Drive       │
│ Work / build                 │
│ GitHub Netlify Slack         │
│ AI                           │
│ ChatGPT Gemini Perplexity    │
│                              │
│ News  All · Bug · Verge      │
│ Headline one                 │
│ Headline two                 │
│                              │
│ “Quote…”                     │
│ [Focus audio] [Edit]         │
└──────────────────────────────┘
```

On narrow screens, weather becomes one line with previous/next location buttons, news becomes a short two-headline list with source tabs that can horizontally scroll inside their own control, the quote moves below news, and shortcut groups scroll vertically rather than clipping or expanding on hover. Nothing uses absolute positioning for primary layout.

### Design self-critique

A dark glass-card dashboard would repeat the current problem and resemble a generic generated productivity UI. A bright editorial layout would ignore the existing night-time identity and the way the page is used. The revised direction keeps one genuinely personal asset—the nocturnal city—while replacing glass-card clutter with a disciplined search rail and shortcut shelf. Visual boldness is spent on the atmosphere; controls remain quiet and legible.

## 10. Technical architecture

### Foundation

- Astro 7.3.x or the latest stable Astro 7 patch at implementation time.
- Static output; no server adapter, database, or API routes for version 1.
- Node 24 LTS and Yarn 4.9.2, matching the new personal-site projects.
- Strict TypeScript.
- Astro for the document shell and static metadata.
- One Solid application island for search, shortcuts, settings, multi-location weather, compact news state, and migration; a separately lazy audio island is acceptable.
- Plain scoped/global CSS with tokens; no styled-components and no lodash for trivial operations.
- Zod or an equivalently small schema validator for imported and migrated configuration.
- Playwright plus axe for behavioral, responsive, and accessibility tests.

Keep dependencies minimal. Do not add a state library unless the configuration/migration logic becomes demonstrably clearer with it.

### Suggested structure

```text
.codex/
  tickets/start-site-2026/
    plan.md
    handoff.md
    screenshots/
src/
  assets/
    background/
    fonts/
    icons/
  components/
    AppShell.astro
    Meta.astro
    StartDashboard.tsx
    AudioDrawer.tsx
  data/
    defaults.ts
    providers.ts
    quotes.json
  features/
    config/
    search/
    shortcuts/
    weather/
    quote/
    news/
    audio/
  pages/
    index.astro
  styles/
    global.css
    tokens.css
  lib/
    urls.ts
    storage.ts
    migration.ts
    schema.ts
public/
  favicon.svg
  robots.txt
tests/
  accessibility.spec.ts
  config.spec.ts
  migration.spec.ts
  responsive.spec.ts
  search-providers.spec.ts
astro.config.mjs
netlify.toml
playwright.config.ts
package.json
```

### Security and privacy

- Use a restrictive, tested Content Security Policy that permits only the APIs/assets actually used.
- Do not commit account-specific URLs, OAuth tokens, API keys, or personal location history.
- Validate imported files and URLs before use.
- Use `noopener noreferrer` for external new tabs.
- Do not read the clipboard automatically.
- Do not enable analytics, ad scripts, or third-party embeds by default.
- Keep the weather location manual and coarse unless the user opts into geolocation.
- Document every external request and make weather, quote, news, and audio modules work or fail gracefully without it.

## 11. Implementation phases

### Phase 0 — open the repository and establish a safe baseline

1. Complete every item in section 2, including opening the new repository as the active workspace.
2. Record the repository URL, clone path, default branch, and initial commit in this plan or `handoff.md`.
3. Create the implementation branch.
4. Capture the live legacy page at 1440 × 1000, 768 × 1024, and 390 × 844.
5. Record the current production URL, response headers, robots behavior, deployed asset size, and important local-storage keys.
6. Verify a clean install/build of the new repository seed before adding application code.

Exit criteria: the new repository is open in Codex, the plan is present inside it, the legacy repositories are untouched, and the initial branch/build state is recorded.

### Phase 1 — audit and migration contract

1. Inventory all fifty legacy shortcuts and classify them as launch default, optional catalogue, private/account-specific, stale, or remove.
2. Browser-test every proposed query URL while signed out and signed in where practical.
3. Build a provider test table with final URL, empty-query behavior, encoding behavior, and verification date.
4. Define `StartPageConfigV1` and the old-key migration map.
5. Add unit fixtures for `shortcuts`, `searchpresets`, provider keys, background URL, focus, weather locations, and audio preferences.
6. Record the existing CDN feed contract, current workflow cadence, and last-success/failure behavior before proposing its normalized JSON addition.
7. Preserve same-origin configuration on production cutover; also provide a pre-cutover export action in the legacy site if needed.

Exit criteria: every retained shortcut/search provider has an explicit status, and legacy browser data can be migrated without guesswork.

### Phase 2 — scaffold the current foundation

1. Add Astro 7, Solid, schema validation, formatting, checking, and test dependencies.
2. Configure static output, `site`, strict TypeScript, sitemap disabled unless intentionally required, and a `noindex` robots policy.
3. Add Yarn 4.9.2 through Corepack and pin Node 24.
4. Add scripts for `dev`, `check`, `build`, `preview`, `format`, `format:check`, `test`, and `test:e2e`.
5. Add `netlify.toml` with build/publish settings and initial security headers.

Exit criteria: the empty application shell builds reproducibly with an immutable install.

### Phase 3 — configuration and local data

1. Implement typed defaults, config schema, local adapter, last-known-good backup, and version upgrades.
2. Implement one-time migration from legacy storage keys.
3. Build import/export with merge/replace preview and validation errors.
4. Implement multiple weather locations, active-location persistence, reorder/remove behavior, and cache namespacing by location id.
5. Build reset-to-defaults and local data summary.
6. Add tests for malformed JSON, unsupported versions, invalid URLs, duplicate ids, missing active weather location, migration idempotence, and storage failures.

Exit criteria: configuration is durable, portable, validated, and recoverable without an account.

### Phase 4 — search and shortcuts

1. Build the search rail with provider chip, family switcher, keyboard focus, and form semantics.
2. Implement provider registry and URL construction tests.
3. Build the pinned favorites shelf and grouped full catalogue from section 6, with edit, add, hide, remove, reorder, filter, and empty states.
4. Add locally bundled icons or accessible letter fallbacks.
5. Implement settings as a drawer/dialog with focus trapping, escape behavior, and return focus.
6. Test search and shortcut behavior with keyboard, pointer, touch-sized controls, and JavaScript error recovery.

Exit criteria: the page delivers its two primary jobs—search and shortcut navigation—without weather, quote, audio, or network access.

### Phase 5 — visual system, weather, and quote

1. Implement the quiet-night token system, responsive layout, and optimized hero background.
2. Add saved-location management, previous/next arrows, active-location persistence, and the cached Open-Meteo adapter.
3. Add local quote rotation and optional validated CDN fallback.
4. Add clear skeleton, offline, stale-data, and unavailable states that reserve layout space.
5. Verify no overlap or clipping at every target width and at 200% zoom.

Exit criteria: multiple saved places can be added and moved through with arrows, and weather/quote add context without delaying or shifting the core dashboard.

### Phase 6 — compact news and CDN normalization

1. Open `C:\projects\Personal\cdn` separately only for this supporting task and create a dedicated branch.
2. Add the normalized `news/index.json` generator and freshness/error metadata described in section 8.
3. Upgrade the relevant CDN workflow runtime/install/deployment steps without changing unrelated CDN content.
4. Verify all three sources, one-source failure fallback, stale-data behavior, output size, CORS, and the live CDN path.
5. In the start-page repository, add the source tabs, four-headline default view, expanded six-headline view, visibility settings, cache, stale label, and manual refresh.
6. Keep raw RSS endpoints working until the legacy page is retired.

Exit criteria: current headlines remain visible with one feed unavailable, the frontend parses no raw RSS or article HTML, and the news module can be hidden without leaving layout gaps.

### Phase 7 — optional focus audio

1. Confirm the user still wants the player after reviewing the core preview.
2. Implement the lazy drawer and three optimized presets.
3. Add play/pause, volume, track selection, keyboard labels, loop behavior, and reduced-motion-compatible visualization if any.
4. Verify that no media downloads before explicit interaction and that autoplay never occurs.

Exit criteria: audio is optional, understandable, licensed, and does not affect initial load performance.

### Phase 8 — verification and documentation

Automated checks:

- immutable install, format, type/Astro check, unit tests, production build;
- provider URL and empty-query contract tests;
- legacy migration and import/export round trips;
- shortcut URL validation and ordering;
- axe scan with no serious or critical violations;
- responsive browser tests at 320, 390, 768, 1024, and 1440 px;
- no horizontal overflow or primary-element overlap;
- keyboard path through search, shortcuts, settings, and audio;
- weather success, location switching, missing active location, timeout, malformed response, cached/offline, and unavailable states;
- quote local fallback when the network is unavailable;
- news normalization, source filtering, feed failure, freshness, cached/offline, and hidden-module states;
- no audio request before player interaction;
- correct robots, canonical, favicon, manifest, headers, and 404 behavior.

Manual checks:

- desktop and mobile screenshot critique;
- 200% zoom and Windows high-contrast/forced-colors review;
- reduced-motion review;
- slow/offline network behavior;
- signed-out behavior for every default external destination;
- Facebook Messages opens the approved `facebook.com/messages/e2ee/` destination;
- local configuration survival across refresh, deploy preview, and production cutover expectations.

Update the README with purpose, live URL, screenshot, setup, configuration schema, import/export, weather locations, news/CDN relationship, privacy/external requests, tests, and deployment.

### Phase 9 — Netlify preview and production cutover

1. Import the new GitHub repository into a new Netlify project.
2. Use `yarn build`, publish `dist`, Node 24, and Deploy Previews.
3. Keep GitHub Actions as the quality gate; prefer Netlify's Git connection for deployment rather than the legacy third-party action.
4. Verify the temporary Netlify URL before attaching the custom domain.
5. Export current production configuration and confirm the same-origin migration plan.
6. Attach `start.tihomir-selak.from.hr`, verify HTTPS, headers, CSP, weather attribution, and all core actions.
7. Monitor for failed API calls and migration problems without adding invasive analytics.
8. Keep `astro-start-tab` unarchived until production behavior, configuration migration, and rollback are verified.
9. Tag/archive the legacy repository only after explicit user approval.

## 12. Acceptance criteria

The local implementation is complete when:

- the work was performed from the opened `tihomir-selak-start-2026` repository, not a legacy or coordination directory;
- Astro 7.x builds a fully static `dist/` on Node 24 with an immutable Yarn install;
- search and shortcuts work with no network connection after initial load;
- defaults live in one typed data registry rather than component markup;
- no private account/workspace URL is committed;
- every enabled search provider has a verified, tested URL contract;
- Gemini is a shortcut unless a documented and verified direct prompt route exists;
- users can add, edit, hide, remove, reorder, export, import, merge, replace, and reset shortcuts/settings;
- malformed or newer-version config cannot corrupt the saved configuration;
- legacy local data migrates once and the migration is tested/idempotent;
- weather uses Open-Meteo with caching, attribution, multiple locally saved places, previous/next arrows, persisted active location, and a graceful unavailable state;
- quote content works offline and has source/attribution review;
- news is compact, optional, source-filterable, limited to six visible headlines, backed by normalized CDN JSON, and shows freshness/stale state;
- vocabulary does not occupy the launch surface;
- no audio file downloads before user action and the launch audio budget is below 8 MB;
- no overlap, clipping, or horizontal overflow occurs at 320, 390, 768, 1024, or 1440 px;
- search, shortcuts, settings, and optional audio are fully keyboard usable with visible focus;
- automated accessibility checks have no serious or critical violations;
- reduced motion, 200% zoom, offline, and API-failure behavior are manually reviewed;
- the site ships with `noindex, nofollow` unless the user changes that decision;
- README, deployment notes, configuration recovery, multi-location weather, and the CDN news relationship are documented;
- GitHub Actions passes, a Netlify Deploy Preview is reviewed, and the legacy production site remains available until cutover.

## 13. Approval gates

Ask the user before:

- enabling Google Drive/OAuth or any account-based sync;
- requesting browser geolocation;
- enabling analytics, error telemetry, third-party embeds, or account integrations;
- publishing private/account-specific shortcut URLs;
- changing the supporting CDN schedule to a cadence that materially increases hosting/build usage;
- attaching the production domain or replacing the live Netlify site;
- archiving `astro-start-tab` or changing the legacy deployment;
- enabling indexing;
- using audio or imagery without a documented license/source.

## 14. Research sources

Product and repository audit:

- [Live start page](https://start.tihomir-selak.from.hr/)
- [Legacy dashboard repository](https://github.com/Tihi321/astro-start-tab)
- [Supporting static CDN repository](https://github.com/Tihi321/cdn)
- Local source, assets, Git history, build workflow, and live responsive behavior inspected on 24 September 2026.

Platform references:

- [Open-Meteo free weather API](https://open-meteo.com/)
- [Open-Meteo pricing, limits, and attribution](https://open-meteo.com/en/pricing)
- [Google Drive application data folder](https://developers.google.com/workspace/drive/api/guides/appdata)
- [Google Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Google's documented Gemini shortcut in Chrome](https://support.google.com/chrome/answer/14886647)
- [Google Search AI Mode](https://support.google.com/websearch/answer/16011537)
- [Astro 7.3 release](https://astro.build/blog/astro-730/)
- [Astro Solid integration](https://docs.astro.build/en/guides/integrations-guide/solid-js/)
- [Node.js release status](https://nodejs.org/en/about/previous-releases)
- [WCAG 2.2](https://www.w3.org/TR/wcag22/)

## 15. Execution prompt for Codex or another coding agent

Run from the new repository root only after it has been opened as the active workspace:

```text
Implement the complete plan at .codex/tickets/start-site-2026/plan.md. Read the whole plan and every applicable repository instruction before editing. Invoke the global implement skill with this plan. Work phase by phase in C:\projects\Personal\tihomir-selak-start-2026; do not implement in the coordination folder or astro-start-tab. Treat astro-start-tab and C:\projects\Personal\cdn as read-only sources until the plan reaches the separately approved CDN normalization phase; if that phase proceeds, open the CDN repository separately and use its own branch. Use the frontend-design skill for the visual implementation. Preserve legacy same-origin browser configuration through a tested schema migration, keep the product local-first, support multiple locally saved weather places with arrow navigation, and retain compact news through normalized CDN JSON. Do not add Google Drive/OAuth, automatic geolocation, analytics, production DNS changes, or legacy archival without explicit approval. Build and verify locally, capture desktop and mobile screenshots for critique, and run every verification named in the plan.
```
