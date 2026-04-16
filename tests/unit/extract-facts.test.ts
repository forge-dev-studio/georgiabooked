import { describe, it, expect } from 'vitest';
import { extractFacts } from '../../scripts/extract-facts';
import type { GazettePost } from '../../scripts/fetch-gazette';

describe('extractFacts', () => {
  it('extracts name, charges, county, date from typical post', () => {
    const post: GazettePost = {
      id: 42,
      date: '2026-04-15T08:30:00',
      slug: 'john-smith',
      link: 'https://thegeorgiagazette.com/john-smith/',
      title: { rendered: 'John Smith' },
      excerpt: { rendered: '<p>John Smith was booked at the Hall County Jail on April 14, 2026. Charges: DUI, Speeding.</p>' },
      content: { rendered: '<p>Full writeup...</p>' },
      categories: [12],
      _embedded: {
        'wp:term': [[{ id: 12, name: 'Hall County', taxonomy: 'category' }]],
      },
    };

    const facts = extractFacts(post);
    expect(facts).toMatchObject({
      sourceId: 42,
      name: 'John Smith',
      county: 'Hall',
      charges: expect.arrayContaining(['DUI', 'Speeding']),
      bookingDate: '2026-04-14',
      sourceUrl: 'https://thegeorgiagazette.com/john-smith/',
    });
  });

  it('returns null when county cannot be identified', () => {
    const post: GazettePost = {
      id: 1,
      date: '2026-01-01',
      slug: 's',
      link: 'x',
      title: { rendered: 'Jane Doe' },
      excerpt: { rendered: '<p>No county mentioned</p>' },
      content: { rendered: '' },
      categories: [999],
      _embedded: { 'wp:term': [[{ id: 999, name: 'Uncategorized', taxonomy: 'category' }]] },
    };
    expect(extractFacts(post)).toBeNull();
  });

  it('parses charge list from excerpt HTML', () => {
    const post: GazettePost = {
      id: 1,
      date: '2026-02-02',
      slug: 's',
      link: 'x',
      title: { rendered: 'Jane Doe' },
      excerpt: { rendered: '<p>Jane Doe booked at Fulton County Jail on February 1, 2026. Charges: Aggravated Assault, Possession of Cocaine, Speeding.</p>' },
      content: { rendered: '' },
      categories: [5],
      _embedded: { 'wp:term': [[{ id: 5, name: 'Fulton County', taxonomy: 'category' }]] },
    };
    const facts = extractFacts(post)!;
    expect(facts.charges).toEqual(['Aggravated Assault', 'Possession of Cocaine', 'Speeding']);
  });

  it('falls back to post date when excerpt has no explicit date', () => {
    const post: GazettePost = {
      id: 1,
      date: '2026-03-15T12:00:00',
      slug: 's',
      link: 'x',
      title: { rendered: 'Joe Blow' },
      excerpt: { rendered: '<p>Joe Blow booked at Cobb County Jail. Charges: Speeding.</p>' },
      content: { rendered: '' },
      categories: [8],
      _embedded: { 'wp:term': [[{ id: 8, name: 'Cobb County', taxonomy: 'category' }]] },
    };
    expect(extractFacts(post)!.bookingDate).toBe('2026-03-15');
  });
});
