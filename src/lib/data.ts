import fs from 'node:fs';
import path from 'node:path';
import type { ArrestRecord } from '../../scripts/merge.ts';

const DATA_PATH = path.resolve(process.cwd(), 'data/arrests.json');

export function loadArrests(): ArrestRecord[] {
  if (!fs.existsSync(DATA_PATH)) return [];
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  return JSON.parse(raw) as ArrestRecord[];
}

export function saveArrests(records: ArrestRecord[]): void {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(records, null, 2));
}

export function arrestsByCounty(records: ArrestRecord[], countyName: string): ArrestRecord[] {
  return records.filter((r) => r.county.toLowerCase() === countyName.toLowerCase());
}

export function recentArrests(records: ArrestRecord[], limit = 30): ArrestRecord[] {
  return records.slice(0, limit);
}

export function countyHotness(records: ArrestRecord[], sinceDays = 7): Map<string, number> {
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const counts = new Map<string, number>();
  for (const r of records) {
    const t = Date.parse(r.publishedAt);
    if (Number.isNaN(t) || t < cutoff) continue;
    counts.set(r.county, (counts.get(r.county) ?? 0) + 1);
  }
  return counts;
}

export function arrestsInLast24h(records: ArrestRecord[]): ArrestRecord[] {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return records.filter((r) => Date.parse(r.publishedAt) >= cutoff);
}
