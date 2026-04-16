import 'dotenv/config';
import { fetchAllGazettePosts } from './fetch-gazette.ts';
import { extractFacts } from './extract-facts.ts';
import { rewriteArrest, createGeminiClient, createClaudeClient } from './rewrite.ts';
import { mergeArrests, type ArrestRecord } from './merge.ts';
import { loadArrests, saveArrests } from '../src/lib/data.ts';
import { arrestSlug } from '../src/lib/slug.ts';
import { classifyWorst } from '../src/lib/severity.ts';

async function main() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!anthropicKey && !geminiKey) {
    throw new Error('ANTHROPIC_API_KEY or GEMINI_API_KEY required');
  }
  const apiUrl = process.env.GAZETTE_API_URL ?? 'https://thegeorgiagazette.com/wp-json/wp/v2/posts';
  const batchSize = Number(process.env.INGEST_BATCH_SIZE ?? 100);

  console.log(`[ingest] fetching up to ${batchSize} posts from ${apiUrl}`);
  const posts = await fetchAllGazettePosts(apiUrl, batchSize, 50);
  console.log(`[ingest] received ${posts.length} posts`);

  const existing = loadArrests();
  const existingIds = new Set(existing.map((r) => r.sourceId));

  const newFacts = posts
    .filter((p) => !existingIds.has(p.id))
    .map(extractFacts)
    .filter((f): f is NonNullable<typeof f> => f !== null);

  console.log(`[ingest] ${newFacts.length} new arrests to rewrite`);

  const client = anthropicKey
    ? createClaudeClient(anthropicKey)
    : createGeminiClient(geminiKey!);
  console.log(`[ingest] using ${anthropicKey ? 'Claude Haiku 4.5' : 'Gemini 2.5 Flash'}`);
  const newRecords: ArrestRecord[] = [];
  for (const facts of newFacts) {
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
      console.log(`[ingest] rewrote: ${facts.name} (${facts.county})`);
    } catch (err) {
      console.error(`[ingest] failed to rewrite ${facts.name}:`, err);
    }
  }

  const merged = mergeArrests(existing, newRecords);
  saveArrests(merged);
  console.log(`[ingest] wrote ${merged.length} total records (${newRecords.length} new)`);
}

main().catch((err) => {
  console.error('[ingest] fatal:', err);
  process.exit(1);
});
