import type { Severity } from '../src/lib/severity.ts';

export interface ArrestRecord {
  slug: string;
  sourceId: number;
  name: string;
  county: string;
  charges: string[];
  bookingDate: string;
  publishedAt: string;
  sourceUrl: string;
  mugshotUrl?: string;
  rewrite: string;
  severity: Severity;
}

export function mergeArrests(existing: ArrestRecord[], incoming: ArrestRecord[]): ArrestRecord[] {
  const bySourceId = new Map<number, ArrestRecord>();
  for (const r of existing) bySourceId.set(r.sourceId, r);

  const usedSlugs = new Set<string>(existing.map((r) => r.slug));
  for (const r of incoming) {
    if (bySourceId.has(r.sourceId)) continue;
    let slug = r.slug;
    let i = 2;
    while (usedSlugs.has(slug)) {
      slug = `${r.slug}-${i}`;
      i++;
    }
    usedSlugs.add(slug);
    bySourceId.set(r.sourceId, { ...r, slug });
  }

  const merged = Array.from(bySourceId.values());
  merged.sort((a, b) => {
    if (a.bookingDate !== b.bookingDate) return b.bookingDate.localeCompare(a.bookingDate);
    return b.publishedAt.localeCompare(a.publishedAt);
  });
  return merged;
}
