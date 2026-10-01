# Tihomir Selak Start

A quiet, local-first start page for search, saved shortcuts, weather, RSS news, a daily quote, a word of the day, a focus mode, and optional ambient audio and a playlist.

The page includes typed local configuration, 27 search providers grouped into Web, AI, Video and Music (each group remembers its own default provider), editable shortcuts, multi-location weather, RSS news, a word of the day, ambient sound mixing, a personal playlist and focus mode.

## Run locally

Requirements: Node 24 and Corepack.

```sh
corepack enable
yarn install --immutable
yarn dev
```

Open the local URL printed by Astro. Settings live in this browser and do not require an account.

## Configuration and privacy

The browser stores one validated, versioned configuration document plus a last-known-good backup. Settings can be exported to JSON and restored locally. Import validation completes before saved data changes. Shortcut and search destinations open in new tabs with safe link attributes. No analytics, account sync, automatic location lookup, or private workspace links are included.

Weather uses the Open-Meteo forecast and geocoding APIs only after the page opens, with locally saved places, a manual refresh, a short timeout, and cached stale-data fallback. The page never asks for geolocation. The quote falls back to a small set of original reflections, clearly labeled as such.

## Checks

```sh
yarn format:check
yarn check
yarn test
yarn build
yarn test:e2e
```

The project is a static Astro site intended for Netlify previews. Production hosting and the custom domain are not configured by this foundation work.

## Backgrounds, quotes and default links

- Background photos in `public/backgrounds/` are reused from the owner's earlier astro-start-tab project.
- The quote above the search box comes from the personal CDN (`cdn.tihomir-selak.from.hr`): the daily quote, and "Next" draws from the cached quote list. When the CDN is unreachable it falls back to cached data and then to the original local reflections.
- Slack (`https://app.slack.com/client/T03TQ1AE0/C01R9LA2UTW`) is a committed default favorite. Stored version 1 settings are upgraded to version 2 on load, which also updates the default Facebook Messages link and adds Slack if it is missing.
- Favorites can be removed with the × on a tile and reordered by dragging, or with `Alt+Arrow` keys on a focused tile. The order is stored per favorite (`favoriteOrder`) and does not change the group order in All shortcuts.

## News, word of the day and focus mode

- News is read in the browser from RSS/Atom mirrors on the personal CDN (`https://cdn.tihomir-selak.from.hr/rss/bug.xml`, `verge.xml`, `techcrunch.xml`). The `cdn` repo refreshes those files daily and serves them with `Access-Control-Allow-Origin: *`. Feeds are cached for an hour with a stale fallback. Text is shown as plain text (never as HTML) and only HTTPS links and images are kept. You can filter headlines, save filters as presets, and switch between compact and expanded views.
- The word of the day comes from `https://cdn.tihomir-selak.from.hr/daily/vocabulary-word-eng.json`, cached per day. It can be switched off in settings.
- Focus mode (header button or `Ctrl+'`) hides the shortcuts and news so only the search stays.

## Audio

- Seven ambient tracks (forest, rain, waves, campfire, relax, lofi, synthwave) are bundled in `public/audio/` and mixed with per-track sliders. The mix can be saved, loaded and cleared, with a low/high volume switch.
- A personal playlist takes HTTPS audio URLs (name plus address). Songs can be muted or removed, and the player has previous, play/pause, next, a timeline and a volume slider.
- Nothing ever plays automatically. Audio is created only after you act, and it keeps playing while the Sound drawer is closed.
- Shortcuts: `Ctrl+Alt+1` previous, `Ctrl+Alt+2` play/pause, `Ctrl+Alt+3` next, `Ctrl+Alt+4` stop all, `Ctrl+Alt+5` start or stop the saved mix. They are ignored while typing in a field.
- Stored settings from version 2 are upgraded to version 3 on load, which adds the per-type search defaults, news, word of the day, focus and audio sections.
