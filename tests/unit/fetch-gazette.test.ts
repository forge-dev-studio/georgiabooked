import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchGazettePage, fetchAllGazettePosts, GazettePost } from '../../scripts/fetch-gazette';

describe('fetchGazettePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns posts array from WP REST response', async () => {
    const fakePosts: Partial<GazettePost>[] = [
      { id: 1, title: { rendered: 'John Smith' }, link: 'x', excerpt: { rendered: 'e' }, date: '2026-04-15T12:00:00', categories: [1] },
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['X-WP-TotalPages', '1']]),
      json: async () => fakePosts,
    } as unknown as Response);

    const { posts, totalPages } = await fetchGazettePage('https://thegeorgiagazette.com/wp-json/wp/v2/posts', 1, 10);
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe(1);
    expect(totalPages).toBe(1);
  });

  it('throws on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(fetchGazettePage('https://x', 1, 10)).rejects.toThrow(/500/);
  });
});

describe('fetchAllGazettePosts', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('paginates through all pages until limit reached', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      const page = Number(new URL(url).searchParams.get('page'));
      return {
        ok: true,
        headers: new Map([['X-WP-TotalPages', '3']]),
        json: async () => [
          { id: page * 10 + 1, title: { rendered: `P${page}A` }, link: 'x', excerpt: { rendered: '' }, date: '2026-01-01', categories: [] },
          { id: page * 10 + 2, title: { rendered: `P${page}B` }, link: 'x', excerpt: { rendered: '' }, date: '2026-01-01', categories: [] },
        ],
      } as unknown as Response;
    });
    const posts = await fetchAllGazettePosts('https://x/posts', 100, 2);
    expect(posts.length).toBe(6);
    expect(callCount).toBe(3);
  });
});
