import type { GazettePost } from './fetch-gazette.ts';
import { getCountyByName } from '../src/lib/counties.ts';

export interface ArrestFacts {
  sourceId: number;
  name: string;
  county: string;
  charges: string[];
  bookingDate: string;
  sourceUrl: string;
  mugshotUrl?: string;
  publishedAt: string;
}

export function extractFacts(post: GazettePost): ArrestFacts | null {
  const name = decodeHTMLEntities(stripHTML(post.title.rendered)).trim();
  if (!name) return null;

  const county = extractCounty(post);
  if (!county) return null;

  const excerptText = stripHTML(post.excerpt.rendered);
  const charges = extractCharges(excerptText);
  const bookingDate = extractBookingDate(excerptText) ?? post.date.slice(0, 10);

  return {
    sourceId: post.id,
    name,
    county,
    charges,
    bookingDate,
    sourceUrl: post.link,
    mugshotUrl: post.jetpack_featured_media_url,
    publishedAt: post.date,
  };
}

function extractCounty(post: GazettePost): string | null {
  const terms = post._embedded?.['wp:term']?.flat() ?? [];
  for (const term of terms) {
    if (term.taxonomy !== 'category') continue;
    const county = getCountyByName(term.name);
    if (county) return county.name;
  }
  const excerpt = stripHTML(post.excerpt.rendered);
  const match = excerpt.match(/\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)\s+County\b/);
  if (match) {
    const county = getCountyByName(match[1]);
    if (county) return county.name;
  }
  return null;
}

function extractCharges(excerpt: string): string[] {
  const match =
    excerpt.match(/Reason\(?s?\)?\s+For\s+Booking\s*:?\s*([^]*?)(?=\s*(?:Name\s*:|Date\s+of\s+Booking|$))/i) ??
    excerpt.match(/[Cc]harges?\s*:?\s*([^.]+)/);
  if (!match) return [];
  return match[1]
    .split(/[,;\n]|\s{2,}|\band\b/)
    .map((c) => c.trim())
    .filter((c) => c.length > 2 && c.length < 200);
}

function extractBookingDate(excerpt: string): string | null {
  const slashDate = excerpt.match(/Date\s+of\s+Booking\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i) ??
    excerpt.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slashDate) {
    const mm = slashDate[1].padStart(2, '0');
    const dd = slashDate[2].padStart(2, '0');
    return `${slashDate[3]}-${mm}-${dd}`;
  }
  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  };
  const m = excerpt.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (!m) return null;
  const mm = months[m[1].toLowerCase()];
  const dd = m[2].padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

function stripHTML(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeHTMLEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}
