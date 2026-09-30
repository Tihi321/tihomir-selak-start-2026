import { defineConfig, fontProviders } from 'astro/config';
import solid from '@astrojs/solid-js';

export default defineConfig({
  site: 'https://start.tihomir-selak.from.hr',
  output: 'static',
  integrations: [solid()],
  devToolbar: { enabled: false },
  build: { format: 'directory' },
  vite: {
    build: {
      // CSP is script-src 'self': never inline small processed scripts.
      assetsInlineLimit: 0,
    },
  },
  fonts: [
    {
      name: 'Archivo',
      cssVariable: '--font-archivo',
      provider: fontProviders.fontsource(),
      styles: ['normal'],
      weights: ['100 900'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: ['Arial', 'sans-serif'],
    },
    {
      name: 'Martian Mono',
      cssVariable: '--font-martian-mono',
      provider: fontProviders.fontsource(),
      styles: ['normal'],
      weights: ['300 700'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: ['ui-monospace', 'monospace'],
    },
  ],
});
