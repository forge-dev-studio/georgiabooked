import 'dotenv/config';
import { fetchAllGazettePosts } from './fetch-gazette.ts';
import { extractFacts } from './extract-facts.ts';
import { rewriteArrest, createGeminiClient } from './rewrite.ts';
import { mergeArrests, type ArrestRecord } from './merge.ts';
import { loadArrests, saveArrests } from '../src/lib/data.ts';
import { arrestSlug } from '../src/lib/slug.ts';
import { classifyWorst } from '../src/lib/severity.ts';

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is required');
  const apiUrl = process.env.GAZETTE_API_URL ?? 'https://thegeorgiagazette.com/wp-json/wp/v2/posts';
  const MAX_POSTS = 5000;

  console.log(`[backfill] fetching up to ${MAX_POSTS} posts`);
  const posts = await fetchAllGazettePosts(apiUrl, MAX_POSTS, 50);
  console.log(`[backfill] received ${posts.length} posts`);

  const existing = loadArrests();
  const existingIds = new Set(existing.map((r) => r.sourceId));
  const newFacts = posts
    .filter((p) => !existingIds.has(p.id))
    .map(extractFacts)
    .filter((f): f is NonNullable<typeof f> => f !== null);

  const client = createGeminiClient(apiKey);
  const newRecords: ArrestRecord[] = [];
  let count = 0;
  for (const facts of newFacts) {
    count++;
    try {
      const rewrite = await rewriteArrest(facts, client);
      const severity = classifyWorst(facts.charges);
      newRecords.push({
        slug: arrestSlug({ name: facts.name, county: facts.county, bookingDate: facts.bookingDate }),
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
      if (count % 25 === 0) {
        const partial = mergeArrests(existing, newRecords);
        saveArrests(partial);
        console.log(`[backfill] checkpoint: ${newRecords.length} rewritten`);
      }
    } catch (err) {
      console.error(`[backfill] failed: ${facts.name}`, err);
    }
  }

  const merged = mergeArrests(existing, newRecords);
  saveArrests(merged);
  console.log(`[backfill] done. total: ${merged.length} records`);
}

main().catch((err) => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
