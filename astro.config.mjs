import { defineConfig } from 'astro/config';
import solid from '@astrojs/solid-js';

export default defineConfig({
  site: 'https://start.tihomir-selak.from.hr',
  output: 'static',
  integrations: [solid()],
  devToolbar: { enabled: false },
  build: { format: 'directory' },
});
