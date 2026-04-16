import type { APIRoute } from 'astro';

const SITE = 'https://forge-dev-studio.github.io/georgiabooked';

export const GET: APIRoute = () =>
  new Response(
    `User-agent: *
Allow: /
Disallow: /takedown
Disallow: /og/

Sitemap: ${SITE}/sitemap-index.xml
`,
    { headers: { 'Content-Type': 'text/plain' } }
  );
