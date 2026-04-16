import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://georgiabooked.com',
  integrations: [
    tailwind({ applyBaseStyles: false }),
    sitemap({
      filter: (page) => !page.includes('/takedown') && !page.includes('/og/'),
      changefreq: 'hourly',
      priority: 0.8,
      serialize(item) {
        if (item.url.endsWith('/')) item.priority = 1.0;
        else if (item.url.includes('/counties/')) item.priority = 0.9;
        else if (item.url.includes('/arrests/')) item.priority = 0.8;
        return item;
      },
    }),
  ],
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  vite: {
    ssr: { noExternal: ['satori'] },
    resolve: {
      alias: {
        '@lib': new URL('./src/lib', import.meta.url).pathname,
        '@components': new URL('./src/components', import.meta.url).pathname,
        '@layouts': new URL('./src/layouts', import.meta.url).pathname,
      },
    },
  },
});
