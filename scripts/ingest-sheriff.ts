import 'dotenv/config';
import { allScrapers, type ScraperSource } from './scrapers/index.ts';
import type { ArrestFacts } from './extract-facts.ts';
import { rewriteArrest, createGeminiClient, createClaudeClient } from './rewrite.ts';
import { mergeArrests, type ArrestRecord } from './merge.ts';
import { loadArrests, saveArrests } from '../src/lib/data.ts';
import { arrestSlug } from '../src/lib/slug.ts';
import { classifyWorst } from '../src/lib/severity.ts';

const CHECKPOINT_INTERVAL = 20;
const SCRAPER_CONCURRENCY = 3;

interface CountyStats {
  fetched: number;
  new: number;
  rewritten: number;
  errors: number;
  blocked: boolean;
  blockReason?: string;
}

async function main() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!anthropicKey && !geminiKey) {
    throw new Error('ANTHROPIC_API_KEY or GEMINI_API_KEY required');
  }
  const batchSize = Number(process.env.INGEST_BATCH_SIZE ?? 100);

  console.log(`[sheriff-ingest] running ${allScrapers.length} scrapers, limit=${batchSize}/county`);

  const scrapeResults = await runWithConcurrency(
    allScrapers,
    SCRAPER_CONCURRENCY,
    async (scraper) => {
      const stats: CountyStats = {
        fetched: 0,
        new: 0,
        rewritten: 0,
        errors: 0,
        blocked: false,
      };
      try {
        const facts = await scraper.fetch(batchSize);
        stats.fetched = facts.length;
        console.log(`[sheriff-ingest] ${scraper.source}: fetched ${facts.length}`);
        return { scraper, facts, stats };
      } catch (err) {
        stats.blocked = true;
        stats.blockReason = (err as Error).message;
        console.error(`[sheriff-ingest] ${scraper.source}: FAILED - ${stats.blockReason}`);
        return { scraper, facts: [] as ArrestFacts[], stats };
      }
    }
  );

  // Merge scraped facts with existing records, skip sourceIds already present.
  let existing = loadArrests();
  const existingIds = new Set(existing.map((r) => r.sourceId));

  const pending: Array<{ scraper: ScraperSource; facts: ArrestFacts }> = [];
  for (const { scraper, facts, stats } of scrapeResults) {
    for (const f of facts) {
      if (existingIds.has(f.sourceId)) continue;
      pending.push({ scraper, facts: f });
      stats.new += 1;
    }
  }

  console.log(`[sheriff-ingest] ${pending.length} new records to rewrite`);

  const client = anthropicKey
    ? createClaudeClient(anthropicKey)
    : createGeminiClient(geminiKey!);
  console.log(`[sheriff-ingest] using ${anthropicKey ? 'Claude Haiku 4.5' : 'Gemini 2.5 Flash'}`);

  const statsByCounty = new Map<string, CountyStats>();
  for (const r of scrapeResults) statsByCounty.set(r.scraper.county, r.stats);

  let newRecordsBuffer: ArrestRecord[] = [];
  let committedSinceCheckpoint = 0;

  for (const { scraper, facts } of pending) {
    const stats = statsByCounty.get(scraper.county)!;
    try {
      const rewrite = await rewriteArrest(facts, client);
      const severity = classifyWorst(facts.charges);
      newRecordsBuffer.push({
        slug: arrestSlug({
          name: facts.name,
          county: facts.county,
          bookingDate: facts.bookingDate,
        }),
        sourceId: facts.sourceId,
        name: facts.name,
        county: facts.county,
        charges: facts.charges,
        bookingDate: facts.bookingDate,
        publishedAt: facts.publishedAt,
        sourceUrl: facts.sourceUrl,
        mugshotUrl: facts.mugshotUrl,
        rewrite,
        severity,
      });
      stats.rewritten += 1;
      committedSinceCheckpoint += 1;
      console.log(`[sheriff-ingest] rewrote: ${facts.name} (${facts.county})`);
    } catch (err) {
      stats.errors += 1;
      console.error(`[sheriff-ingest] failed to rewrite ${facts.name}:`, err);
    }

    if (committedSinceCheckpoint >= CHECKPOINT_INTERVAL) {
      existing = mergeArrests(existing, newRecordsBuffer);
      saveArrests(existing);
      console.log(`[sheriff-ingest] checkpoint saved (${existing.length} total records)`);
      newRecordsBuffer = [];
      committedSinceCheckpoint = 0;
    }
  }

  // Final flush.
  if (newRecordsBuffer.length > 0) {
    existing = mergeArrests(existing, newRecordsBuffer);
    saveArrests(existing);
  }

  // Summary line.
  const parts: string[] = [];
  for (const scraper of allScrapers) {
    const s = statsByCounty.get(scraper.county)!;
    const suffix = s.blocked ? ` (blocked: ${s.blockReason ?? 'unknown'})` : '';
    parts.push(`${scraper.county}: ${s.rewritten} new${suffix}`);
  }
  console.log(`[sheriff-ingest] ${parts.join(', ')}, total records in file: ${existing.length}`);
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIdx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = nextIdx++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

main().catch((err) => {
  console.error('[sheriff-ingest] fatal:', err);
  process.exit(1);
});
