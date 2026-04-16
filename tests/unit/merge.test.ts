import { describe, it, expect } from 'vitest';
import { mergeArrests, ArrestRecord } from '../../scripts/merge';

const base = (o: Partial<ArrestRecord>): ArrestRecord => ({
  slug: 'x',
  sourceId: 1,
  name: 'John Smith',
  county: 'Hall',
  charges: ['DUI'],
  bookingDate: '2026-04-14',
  publishedAt: '2026-04-15T00:00:00',
  sourceUrl: 'https://x',
  rewrite: 'text',
  severity: 'serious_misdemeanor',
  ...o,
});

describe('mergeArrests', () => {
  it('adds new records', () => {
    const existing: ArrestRecord[] = [];
    const incoming = [base({ slug: 'a', sourceId: 1 })];
    const merged = mergeArrests(existing, incoming);
    expect(merged).toHaveLength(1);
  });

  it('dedupes by sourceId - does not re-add existing', () => {
    const existing = [base({ slug: 'a', sourceId: 1 })];
    const incoming = [base({ slug: 'a', sourceId: 1, rewrite: 'SHOULD NOT OVERWRITE' })];
    const merged = mergeArrests(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].rewrite).toBe('text');
  });

  it('sorts by bookingDate desc then publishedAt desc', () => {
    const existing: ArrestRecord[] = [];
    const incoming = [
      base({ slug: 'old', sourceId: 1, bookingDate: '2026-01-01' }),
      base({ slug: 'new', sourceId: 2, bookingDate: '2026-04-14' }),
      base({ slug: 'mid', sourceId: 3, bookingDate: '2026-03-01' }),
    ];
    const merged = mergeArrests(existing, incoming);
    expect(merged.map((r) => r.slug)).toEqual(['new', 'mid', 'old']);
  });

  it('resolves slug collisions with suffix', () => {
    const existing = [base({ slug: 'john-smith-hall-county-2026-04-14', sourceId: 1 })];
    const incoming = [
      base({ slug: 'john-smith-hall-county-2026-04-14', sourceId: 2 }),
    ];
    const merged = mergeArrests(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.slug).sort()).toEqual([
      'john-smith-hall-county-2026-04-14',
      'john-smith-hall-county-2026-04-14-2',
    ]);
  });
});
