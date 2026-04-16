import { describe, it, expect } from 'vitest';
import { counties, getCountyBySlug, getCountyByName, slugifyCounty } from '@lib/counties';

describe('counties', () => {
  it('has all 159 Georgia counties', () => {
    expect(counties).toHaveLength(159);
  });

  it('finds Hall County by slug', () => {
    const hall = getCountyBySlug('hall');
    expect(hall).toBeDefined();
    expect(hall?.name).toBe('Hall');
    expect(hall?.seat).toBe('Gainesville');
  });

  it('finds Fulton by variant name', () => {
    expect(getCountyByName('Fulton County')?.slug).toBe('fulton');
    expect(getCountyByName('fulton')?.slug).toBe('fulton');
  });

  it('returns undefined for unknown county', () => {
    expect(getCountyByName('Fakerton')).toBeUndefined();
  });

  it('slugifies county names consistently', () => {
    expect(slugifyCounty('DeKalb County')).toBe('dekalb');
    expect(slugifyCounty('Ben Hill')).toBe('ben-hill');
  });

  it('top 20 counties are marked as such', () => {
    const top20 = counties.filter((c) => c.top20);
    expect(top20).toHaveLength(20);
    expect(top20.map((c) => c.name)).toContain('Fulton');
    expect(top20.map((c) => c.name)).toContain('Gwinnett');
  });
});
