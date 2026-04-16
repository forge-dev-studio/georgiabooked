import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://georgiabooked.com',
  integrations: [
    tailwind({ applyBaseStyles: false }),
    sitemap({ filter: (page) => !page.includes('/takedown') }),
  ],
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  vite: {
    ssr: { noExternal: ['satori'] },
  },
});
