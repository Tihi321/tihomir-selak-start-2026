# Tihomir Selak Start

A quiet, local-first start page for search, saved shortcuts, weather, a compact news rail, a daily quote, and optional focus audio.

The current local foundation includes typed local configuration, search providers, editable shortcuts, multi-location weather, and a tiny offline collection of original reflections. Compact news, optional focus audio, and deployment setup remain later phases.

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

Weather uses the Open-Meteo forecast and geocoding APIs only after the page opens, with locally saved places, a manual refresh, a short timeout, and cached stale-data fallback. The page never asks for geolocation. The quote shelf is a small set of original reflections, clearly labeled as such. News is planned to use normalized static JSON from the existing personal CDN rather than RSS parsing in the browser.

## Checks

```sh
yarn format:check
yarn check
yarn test
yarn build
yarn test:e2e
```

The project is a static Astro site intended for Netlify previews. Production hosting and the custom domain are not configured by this foundation work.
