import type { ArrestFacts } from '../extract-facts.ts';

// CentralSquare Police-to-Citizen (P2C) scraper.
//
// The P2C frontend is an Angular SPA: the HTML shell is empty and all booking
// data is fetched from a JSON API on the same origin. Parsing the rendered DOM
// would require a headless browser, so we skip the HTML entirely and hit the
// JSON endpoints directly. (node-html-parser is still a project dependency for
// future P2C variants that serve server-rendered HTML.)
//
// Discovered endpoints (April 2026):
//   Coweta   (agencyId 145): POST /api/RecentArrests/145
//   Columbia (agencyId 526): POST /api/Inmates/526
//
// Both require an anti-forgery dance: GET a warm-up URL first to receive an
// `XSRF-TOKEN` cookie, then echo it back as the `x-xsrf-token` header on the
// POST. Without that header the server returns a 400 with an empty body.
//
// Record shape (RecentArrests endpoint):
//   { Id, FirstName, MiddleName, LastName, ArrestedDateTime, ImageId,
//     Charges: [{ Description, Sequence, BondAmount, BondType }], ... }
//   Top-level: { RecentArrests: [...], Total, ShowImages, ShowArrestedDate }
//
// Note: some agencies redact ArrestedDateTime (sends 0001-01-01 epoch) and
// mugshots (ImageId === 'noimage'). We fall back to the scrape date and skip
// the mugshot in that case.

const USER_AGENT =
  'Mozilla/5.0 (compatible; GeorgiaBookedBot/1.0; +https://georgiabooked.com/about)';

export type P2CEndpoint = 'RecentArrests' | 'Inmates';

export interface P2CConfig {
  county: string;            // e.g. "Coweta" (must match counties.ts name)
  baseUrl: string;           // e.g. "https://cowetacosoga.policetocitizen.com"
  agencyId: number;          // e.g. 145
  endpoint?: P2CEndpoint;    // defaults to RecentArrests, falls back to Inmates
  dateField?: string;        // sort key; defaults to ArrestedDateTime
}

export interface P2CCharge {
  Sequence: number;
  Description: string;
  BondAmount?: number;
  BondType?: string | null;
}

export interface P2CRecord {
  Id: number;
  FirstName?: string | null;
  MiddleName?: string | null;
  LastName?: string | null;
  ArrestedDateTime?: string | null;
  ConfinedDateTime?: string | null;
  BookedDateTime?: string | null;
  ImageId?: string | null;
  Charges?: P2CCharge[];
}

export interface P2CResponse {
  RecentArrests?: P2CRecord[];
  Inmates?: P2CRecord[];
  Records?: P2CRecord[];
  Total?: number;
  ShowImages?: boolean;
  ShowArrestedDate?: boolean;
}

export interface FetchP2COptions {
  limit?: number;            // max records to return; default 100
  pageSize?: number;         // per request; default 50
  sinceDays?: number;        // filter to bookings within N days
  endpoint?: P2CEndpoint;    // force endpoint, skip fallback
}

export async function fetchP2CArrests(
  county: string,
  baseUrl: string,
  agencyId: number,
  opts: FetchP2COptions = {}
): Promise<ArrestFacts[]> {
  const limit = opts.limit ?? 100;
  const pageSize = Math.min(opts.pageSize ?? 50, limit);

  const preferred: P2CEndpoint[] = opts.endpoint
    ? [opts.endpoint]
    : ['RecentArrests', 'Inmates'];

  let lastError: Error | null = null;
  for (const endpoint of preferred) {
    try {
      const records = await fetchAllPages(baseUrl, agencyId, endpoint, limit, pageSize);
      const facts = records
        .map((r) => toFacts(r, county, baseUrl))
        .filter((f): f is ArrestFacts => f !== null);

      if (opts.sinceDays !== undefined) {
        const cutoff = Date.now() - opts.sinceDays * 24 * 60 * 60 * 1000;
        return facts.filter((f) => Date.parse(f.publishedAt) >= cutoff);
      }
      return facts;
    } catch (err) {
      lastError = err as Error;
      // try next endpoint
    }
  }
  throw lastError ?? new Error(`[p2c] no endpoint succeeded for ${county}`);
}

async function fetchAllPages(
  baseUrl: string,
  agencyId: number,
  endpoint: P2CEndpoint,
  limit: number,
  pageSize: number
): Promise<P2CRecord[]> {
  const token = await warmUpXsrfToken(baseUrl, endpoint);
  const sortKey = endpoint === 'RecentArrests' ? 'ArrestedDateTime' : 'ConfinedDateTime';
  const url = `${trimSlash(baseUrl)}/api/${endpoint}/${agencyId}`;

  const all: P2CRecord[] = [];
  for (let skip = 0; skip < limit; skip += pageSize) {
    const take = Math.min(pageSize, limit - skip);
    const body = {
      FilterOptionsParameters: { IntersectionSearch: true, SearchText: '', Parameters: [] },
      IncludeCount: true,
      PagingOptions: {
        SortOptions: [{ Name: sortKey, SortDirection: 'Descending', Sequence: 1 }],
        Take: take,
        Skip: skip,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-xsrf-token': token.value,
        Cookie: token.cookie,
        Referer: `${trimSlash(baseUrl)}/${endpoint}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`[p2c] ${endpoint} ${agencyId} ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as P2CResponse;
    const batch = data.RecentArrests ?? data.Inmates ?? data.Records ?? [];
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < take) break;
    await sleep(750);
  }
  return all;
}

interface XsrfToken {
  value: string;
  cookie: string;
}

async function warmUpXsrfToken(baseUrl: string, endpoint: P2CEndpoint): Promise<XsrfToken> {
  const res = await fetch(`${trimSlash(baseUrl)}/${endpoint}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
  });
  const setCookie = getSetCookieHeader(res);
  const parsed = parseCookies(setCookie);
  const token = parsed['XSRF-TOKEN'];
  if (!token) {
    throw new Error(`[p2c] no XSRF-TOKEN cookie from ${baseUrl}/${endpoint}`);
  }
  // Server-side anti-forgery validation also requires the request-verification
  // cookie (.AspNetCore.Antiforgery.*) to be echoed back.
  const cookie = Object.entries(parsed)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  return { value: token, cookie };
}

function getSetCookieHeader(res: Response): string[] {
  // Node 18+ returns a single 'set-cookie' entry joined by commas; use
  // getSetCookie() where available for correct splitting.
  const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === 'function') {
    return anyHeaders.getSetCookie();
  }
  const raw = res.headers.get('set-cookie');
  return raw ? raw.split(/,(?=[^;]+=)/) : [];
}

function parseCookies(setCookieLines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of setCookieLines) {
    const [pair] = line.split(';');
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name) out[name] = value;
  }
  return out;
}

// -- Record normalization -------------------------------------------------

export function toFacts(
  record: P2CRecord,
  county: string,
  baseUrl: string
): ArrestFacts | null {
  const name = composeName(record);
  if (!name) return null;

  const charges = (record.Charges ?? [])
    .slice()
    .sort((a, b) => (a.Sequence ?? 0) - (b.Sequence ?? 0))
    .map((c) => toTitleCase((c.Description ?? '').trim()))
    .filter((c) => c.length > 0);

  const rawDate =
    record.ArrestedDateTime ?? record.ConfinedDateTime ?? record.BookedDateTime ?? null;
  const parsed = rawDate ? Date.parse(rawDate) : NaN;
  // P2C sends epoch year 0001 when a date is redacted; treat <= 1970 as absent.
  const validDate =
    !Number.isNaN(parsed) && parsed > Date.parse('1970-01-01T00:00:00Z');

  const today = new Date().toISOString();
  const bookingDate = validDate ? rawDate!.slice(0, 10) : today.slice(0, 10);
  const publishedAt = validDate ? new Date(parsed).toISOString() : today;

  const sourceId = p2cSourceId(county, name, bookingDate);
  const sourceUrl = `${trimSlash(baseUrl)}/RecentArrests`;

  const imageId = record.ImageId && record.ImageId !== 'noimage' ? record.ImageId : null;
  const mugshotUrl = imageId
    ? `${trimSlash(baseUrl)}/api/Inmate/Image/${encodeURIComponent(imageId)}`
    : undefined;

  return {
    sourceId,
    name,
    county,
    charges,
    bookingDate,
    sourceUrl,
    mugshotUrl,
    publishedAt,
  };
}

function composeName(r: P2CRecord): string {
  const parts = [r.FirstName, r.MiddleName, r.LastName]
    .map((p) => (p ?? '').trim())
    .filter((p) => p.length > 0)
    .map((p) => p.replace(/,/g, ''));
  if (parts.length === 0) return '';
  return parts.map(toTitleCase).join(' ').replace(/\s+/g, ' ').trim();
}

function toTitleCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.replace(/\b[\p{L}'`-]+/gu, (word) => {
    // Preserve Roman-numeral suffixes (I, II, III, IV, V)
    if (/^(i{1,3}|iv|v|vi{0,3})$/i.test(word) && word.length <= 4) {
      return word.toUpperCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

// Stable 31-bit positive hash of a string.
export function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Prefix P2C sourceIds with 10_000_000 so they can't collide with Gazette
// WordPress post IDs (which live in the 3M+ range and climb).
export function p2cSourceId(county: string, name: string, bookingDate: string): number {
  return 10_000_000 + hashCode(`${county}-${name}-${bookingDate}`);
}

function trimSlash(u: string): string {
  return u.endsWith('/') ? u.slice(0, -1) : u;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
