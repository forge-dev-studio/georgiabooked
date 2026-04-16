import { describe, it, expect } from 'vitest';
import { arrestSlug } from '@lib/slug';

describe('arrestSlug', () => {
  it('generates lowercase hyphenated slug from name + county + date', () => {
    const slug = arrestSlug({
      name: 'John Smith',
      county: 'Hall',
      bookingDate: '2026-04-15',
    });
    expect(slug).toBe('john-smith-hall-county-2026-04-15');
  });

  it('strips punctuation', () => {
    expect(
      arrestSlug({ name: "O'Brien, Jane M.", county: 'Fulton', bookingDate: '2026-01-01' })
    ).toBe('obrien-jane-m-fulton-county-2026-01-01');
  });

  it('handles names with multiple spaces', () => {
    expect(
      arrestSlug({ name: 'John  James   Smith', county: 'Cobb', bookingDate: '2026-02-02' })
    ).toBe('john-james-smith-cobb-county-2026-02-02');
  });

  it('deduplicates collision with suffix', () => {
    const a = arrestSlug({ name: 'John Smith', county: 'Hall', bookingDate: '2026-04-15' });
    const b = arrestSlug({ name: 'John Smith', county: 'Hall', bookingDate: '2026-04-15' }, 2);
    expect(a).toBe('john-smith-hall-county-2026-04-15');
    expect(b).toBe('john-smith-hall-county-2026-04-15-2');
  });
});
