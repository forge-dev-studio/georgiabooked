export interface GazettePost {
  id: number;
  date: string;
  slug: string;
  link: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  content: { rendered: string };
  categories: number[];
  jetpack_featured_media_url?: string;
  _embedded?: {
    'wp:term'?: Array<Array<{ id: number; name: string; taxonomy: string }>>;
  };
}

export interface GazetteCategory {
  id: number;
  name: string;
  slug: string;
}

const USER_AGENT = 'GeorgiaBookedBot/1.0 (+https://georgiabooked.com/about)';

export async function fetchGazettePage(
  baseUrl: string,
  page: number,
  perPage: number
): Promise<{ posts: GazettePost[]; totalPages: number }> {
  const url = new URL(baseUrl);
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('_embed', '1');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Gazette fetch failed: ${res.status}`);

  const totalPagesHeader = res.headers.get('X-WP-TotalPages') ?? '1';
  const totalPages = Number(totalPagesHeader);
  const posts = (await res.json()) as GazettePost[];
  return { posts, totalPages };
}

export async function fetchAllGazettePosts(
  baseUrl: string,
  maxPosts: number,
  perPage = 50
): Promise<GazettePost[]> {
  const all: GazettePost[] = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && all.length < maxPosts) {
    const { posts, totalPages: tp } = await fetchGazettePage(baseUrl, page, perPage);
    all.push(...posts);
    totalPages = tp;
    page += 1;
    if (posts.length < perPage) break;
    await sleep(500);
  }
  return all.slice(0, maxPosts);
}

export async function fetchCategories(apiBase: string): Promise<GazetteCategory[]> {
  const all: GazetteCategory[] = [];
  let page = 1;
  while (true) {
    const url = new URL(`${apiBase}/categories`);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) throw new Error(`Categories fetch failed: ${res.status}`);
    const batch = (await res.json()) as GazetteCategory[];
    all.push(...batch);
    if (batch.length < 100) break;
    page += 1;
    await sleep(500);
  }
  return all;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
