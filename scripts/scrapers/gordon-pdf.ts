import type { ArrestFacts } from '../extract-facts.ts';

// Gordon County (GA) Jail Media Report scraper.
//
// The Gordon Gazette (gordongazettega.com) publishes the Gordon County
// Sheriff's Office daily "Jail Media Report" as text-based PDFs hosted on
// Wix's static _files CDN. The index page is a Wix-rendered React shell; the
// PDF URLs live inside anchor tags in the server-rendered HTML next to a
// human-readable date heading (e.g. "Tuesday, April 14, 2026").
//
// Each PDF contains a two-column form laid out across N pages. Per page we
// see up to three inmate "blocks" with a fixed column layout:
//   - Name      (bold, x~180)  e.g. "CARROLL, KOLTON ALLEN"
//   - Name label (x~148.5) at the same y coordinate; used as anchor.
//   - Inmate No. value (x~84.5) at the same y.
//   - Race/Sex at x~380/440, label at x~346/409
//   - Process Date/Time, Arresting Agency, Arresting Officer, Address, Age,
//     Arrest Date/Time, Charges, Cash Bond, Property Bond all flow beneath.
// Pages are annotated with a section header at top ("INMATE(S) CURRENTLY
// BOOKED" vs "INMATE(S) BOOKED & RELEASED") that applies to the inmates on
// that page.
//
// The naive `.getText()` output collapses all columns into reading order,
// which destroys the per-inmate association, so we use pdfjs-dist directly
// to get positioned text items and reconstruct records by y-coordinate.

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const INDEX_URL = 'https://www.gordongazettega.com/arrests';
const PDF_BASE = 'https://www.gordongazettega.com/_files/';
const USER_AGENT =
  'Mozilla/5.0 (compatible; GeorgiaBookedBot/1.0; +https://georgiabooked.com/about)';
const REQUEST_SPACING_MS = 2000; // polite: 1 request per 2 seconds
const DEFAULT_MAX_DAYS = 7;

export interface FetchGordonOptions {
  maxDays?: number;
}

export interface GordonPdfLink {
  url: string;           // absolute PDF URL
  dateLabel: string;     // raw label, e.g. "Tuesday, April 14, 2026"
  reportDate: string;    // ISO date "2026-04-14"
}

export interface GordonInmate {
  name: string;                       // "Kolton Allen Carroll" (proper case)
  inmateNumber?: number;              // integer, optional
  bookingDate: string;                // YYYY-MM-DD from Arrest Date/Time, falls back to report date
  publishedAt: string;                // ISO with time when available
  charges: string[];                  // title-cased, ordered, deduped
  section: 'currently-booked' | 'booked-released' | 'unknown';
}

export async function fetchGordonArrests(
  opts: FetchGordonOptions = {}
): Promise<ArrestFacts[]> {
  const maxDays = Math.max(1, opts.maxDays ?? DEFAULT_MAX_DAYS);

  const links = await listPdfLinks();
  const recent = links.slice(0, maxDays);

  const results: ArrestFacts[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < recent.length; i++) {
    const link = recent[i];
    if (i > 0) await sleep(REQUEST_SPACING_MS);
    try {
      const buf = await downloadPdf(link.url);
      const inmates = await parseJailReportPdf(buf);
      for (const inmate of inmates) {
        const fact = toArrestFacts(inmate, link);
        if (!fact) continue;
        if (seen.has(fact.sourceId)) continue;
        seen.add(fact.sourceId);
        results.push(fact);
      }
    } catch (err) {
      console.warn(
        `[gordon] failed to process ${link.url} (${link.reportDate}):`,
        (err as Error).message
      );
    }
  }
  return results;
}

// -- Index page scraping --------------------------------------------------

export async function listPdfLinks(): Promise<GordonPdfLink[]> {
  const res = await fetch(INDEX_URL, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) {
    throw new Error(`[gordon] index ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  return parseIndexHtml(html);
}

export function parseIndexHtml(html: string): GordonPdfLink[] {
  // The Wix page lists each report as an <a> whose href points at the PDF
  // and whose visible text is the date label. The server-rendered HTML is
  // minified, so positions are reliable anchors: every PDF URL in the
  // document is immediately followed (at a later offset) by its date label
  // in the same anchor.
  const pdfRe = /(?:\/_files\/)?ugd\/4b5a67_[a-f0-9]+\.pdf/g;
  const dateRe =
    />([A-Z][a-z]+,?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})</g;

  const pdfs: { pos: number; path: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = pdfRe.exec(html)) !== null) {
    pdfs.push({ pos: m.index, path: m[0].replace(/^\/_files\//, '') });
  }
  const dates: { pos: number; text: string }[] = [];
  while ((m = dateRe.exec(html)) !== null) {
    dates.push({ pos: m.index, text: m[1] });
  }

  // Pair each date with the nearest preceding PDF. The anchor markup wraps
  // both so the PDF URL appears before its date label.
  const out: GordonPdfLink[] = [];
  const usedPdfs = new Set<number>();
  for (const date of dates) {
    let best = -1;
    for (let i = 0; i < pdfs.length; i++) {
      if (usedPdfs.has(i)) continue;
      if (pdfs[i].pos > date.pos) break;
      best = i;
    }
    if (best < 0) continue;
    usedPdfs.add(best);
    const iso = parseDateLabel(date.text);
    if (!iso) continue;
    out.push({
      url: `${PDF_BASE}${pdfs[best].path}`,
      dateLabel: date.text,
      reportDate: iso,
    });
  }

  // Most-recent first.
  out.sort((a, b) => (a.reportDate < b.reportDate ? 1 : -1));
  return out;
}

function parseDateLabel(label: string): string | null {
  // "Tuesday, April 14, 2026" or "Friday March 27, 2026" (no comma)
  const m = label.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i
  );
  if (!m) return null;
  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  };
  const mm = months[m[1].toLowerCase()];
  const dd = m[2].padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

// -- PDF download + parse -------------------------------------------------

async function downloadPdf(url: string): Promise<Uint8Array> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/pdf',
    },
  });
  if (!res.ok) {
    throw new Error(`[gordon] pdf ${url} -> ${res.status}`);
  }
  const ab = await res.arrayBuffer();
  return new Uint8Array(ab);
}

interface PositionedItem {
  str: string;
  x: number;
  y: number;
}

export async function parseJailReportPdf(data: Uint8Array): Promise<GordonInmate[]> {
  const doc = await getDocument({ data, verbosity: 0 }).promise;
  try {
    const inmates: GordonInmate[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = collectItems(content.items as Array<{ str: string; transform: number[] }>);
      inmates.push(...parseInmatesFromPage(items));
    }
    return inmates;
  } finally {
    await doc.destroy();
  }
}

function collectItems(
  raw: Array<{ str: string; transform: number[] }>
): PositionedItem[] {
  const out: PositionedItem[] = [];
  for (const it of raw) {
    const s = (it.str ?? '').trim();
    if (!s) continue;
    out.push({ str: s, x: it.transform[4], y: it.transform[5] });
  }
  return out;
}

export function parseInmatesFromPage(items: PositionedItem[]): GordonInmate[] {
  // "Name" label anchors: x ≈ 148.5, str === "Name". Each one marks the top
  // of an inmate block; the block extends down until the next anchor.
  const anchors = items
    .filter((it) => it.str === 'Name' && Math.abs(it.x - 148.5) < 4)
    .map((it) => it.y)
    .sort((a, b) => b - a); // top of page first (largest y)

  if (anchors.length === 0) return [];

  // Section boundaries: header at top of page OR in-page switch.
  const sectionHeaders = items
    .filter((it) => /^INMATE\(S\)/i.test(it.str))
    .map((it) => ({ y: it.y, section: classifySectionHeader(it.str) }))
    .sort((a, b) => b.y - a.y);

  const inmates: GordonInmate[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const topY = anchors[i];
    const bottomY = i + 1 < anchors.length ? anchors[i + 1] : -Infinity;
    // blockItems: items whose y is in (bottomY, topY + tiny] so we keep the
    // header labels (at y = topY) but not labels from the next block.
    const blockItems = items.filter((it) => it.y <= topY + 1 && it.y > bottomY + 1);
    inmates.push(parseInmateBlock(blockItems, topY, sectionHeaders));
  }
  return inmates;
}

function classifySectionHeader(s: string): 'currently-booked' | 'booked-released' | 'unknown' {
  const t = s.toUpperCase();
  if (t.includes('BOOKED') && t.includes('RELEASED')) return 'booked-released';
  if (t.includes('CURRENTLY')) return 'currently-booked';
  return 'unknown';
}

function parseInmateBlock(
  block: PositionedItem[],
  topY: number,
  sectionHeaders: Array<{ y: number; section: 'currently-booked' | 'booked-released' | 'unknown' }>
): GordonInmate {
  // Raw "LAST, FIRST MIDDLE" name is at x~180 same y as the Name label.
  const nameItem = block.find(
    (it) => Math.abs(it.y - topY) < 2 && Math.abs(it.x - 180) < 4
  );
  const rawName = nameItem?.str ?? '';
  const name = rawName ? normalizeName(rawName) : '';

  // Inmate number at x~84.5 same y.
  const inmateItem = block.find(
    (it) => Math.abs(it.y - topY) < 2 && Math.abs(it.x - 84.5) < 4 && /^\d+$/.test(it.str)
  );
  const inmateNumber = inmateItem ? Number(inmateItem.str) : undefined;

  // Arrest date/time: the LABEL is at x≈32 and str includes "Arrest Date".
  // The VALUE (date) sits ~1-2pt above/below on the same line at x≈140-152.
  const arrestLabel = block.find(
    (it) => /Arrest\s+Date/i.test(it.str) && !/Process/i.test(it.str) && it.x < 50
  );
  let arrestIso: string | null = null;
  let arrestTime: string | null = null;
  if (arrestLabel) {
    const lineItems = block.filter((it) => Math.abs(it.y - arrestLabel.y) < 3);
    const dateItem = lineItems.find((it) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(it.str));
    const timeItem = lineItems.find((it) => /^\d{1,2}:\d{2}$/.test(it.str));
    if (dateItem) arrestIso = mdyToIso(dateItem.str);
    if (timeItem) arrestTime = timeItem.str;
  }

  // Charges: items at x≈32-34, between the "Charges" label (y~565) and the
  // next "Cash Bond"/"Property Bond"/next block boundary. We select any item
  // in the block where x is in the charges column and the string is not one
  // of the known labels, and exclude money-like strings.
  const chargeItems = block
    .filter((it) => it.x >= 30 && it.x <= 40 && !isKnownLabel(it.str) && !isMoney(it.str) && !isNoBond(it.str))
    .filter((it) => /[A-Z]/.test(it.str)) // must contain letters
    .sort((a, b) => b.y - a.y); // top to bottom within block

  const rawCharges = chargeItems.map((it) => it.str);
  const charges = normalizeCharges(rawCharges);

  // Which section header governs this block: most recent (higher y) header
  // whose y is >= topY.
  let section: GordonInmate['section'] = 'unknown';
  for (const sh of sectionHeaders) {
    if (sh.y >= topY) {
      section = sh.section;
    } else {
      break; // sorted desc; further entries are below this block
    }
  }

  const bookingDate = arrestIso ?? '';
  const publishedAt = arrestIso
    ? buildPublishedAt(arrestIso, arrestTime)
    : new Date().toISOString();

  return {
    name,
    inmateNumber,
    bookingDate,
    publishedAt,
    charges,
    section,
  };
}

function mdyToIso(s: string): string | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

function buildPublishedAt(iso: string, time: string | null): string {
  if (!time) return `${iso}T00:00:00.000Z`;
  // Treat as America/New_York (GA) local time. Convert by constructing a
  // Date with the offset baked in. Use an approximation: GA observes EST/EDT
  // roughly UTC-5/UTC-4. We can avoid tz libraries by emitting with a -0400
  // offset most of the year; since this is just a display timestamp we fall
  // back to -0400.
  return `${iso}T${time}:00-04:00`;
}

function isKnownLabel(s: string): boolean {
  const labels = new Set([
    'Name',
    'Inmate No.',
    'Race',
    'Sex',
    'Process Date / Time',
    'Arresting Agency',
    'Arresting Officer',
    'Address',
    'Age at booking',
    'Arrest Date / Time',
    'Charges',
    'Cash Bond',
    'Property Bond',
  ]);
  if (labels.has(s)) return true;
  if (/^INMATE\(S\)/i.test(s)) return true;
  return false;
}

function isMoney(s: string): boolean {
  return /^\$[\d,]+(?:\.\d{1,2})?$/.test(s);
}

function isNoBond(s: string): boolean {
  return /^\*+\s*NO\s+BOND\s*\*+$/i.test(s) || /^\*+\s*NO\s+BOND\s*$/i.test(s);
}

export function normalizeCharges(raw: string[]): string[] {
  return raw
    .map((c) => c.replace(/\s+/g, ' ').trim())
    .map((c) => fixSplitLetters(c))
    .filter((c) => c.length > 2)
    .map((c) => toTitleCase(c));
}

// PDF text extraction sometimes introduces a spurious space around single
// letters because of kerning or embedded font oddities. Examples we've seen
// in real Gordon County reports:
//   "ENFORCEMENT O FFICERS" -> "ENFORCEMENT OFFICERS"
//   "TRAFFIC-CONTROL D EVICES" -> "TRAFFIC-CONTROL DEVICES"
//   "PASSENGE R VEHICLES" -> "PASSENGER VEHICLES"
// The natural English articles "A" and "I" must be preserved, so we only
// merge when the joined word is in a small denylist of known fragments or
// when the left-hand fragment is clearly a split suffix (>=4 letters, ends
// with no vowel at the join point).
function fixSplitLetters(s: string): string {
  // Join "X YYYY" where YYYY begins with a consonant cluster that cannot
  // begin a valid English word (FF, RR, etc.). Preserves articles "A"/"I".
  let out = s.replace(/\b([B-HJ-Z])\s+([A-Z]{2,})\b/g, (match, a: string, b: string) => {
    const bStart = b.slice(0, 2).toUpperCase();
    const invalidStart = /^(FF|FS|MM|MN|PP|RR|TT|GG|DG|BD|KS|MR|NN|LL)/.test(bStart);
    if (invalidStart) return a + b;
    const known = ['EVICES', 'EHICLES', 'FFICERS', 'FFICER'];
    if (known.includes(b)) return a + b;
    return match;
  });
  // Specific known split: "PASSENGE R VEHICLES" -> "PASSENGER VEHICLES".
  // Only target this exact fragment to avoid false joins on real words.
  out = out.replace(/\bPASSENGE\s+R\s+VEHICLES?\b/gi, 'PASSENGER VEHICLES');
  return out;
}

export function normalizeName(raw: string): string {
  // Input: "CARROLL, KOLTON ALLEN"  -> "Kolton Allen Carroll"
  //        "HONG, ALVIN DOI CHIH"   -> "Alvin Doi Chih Hong"
  //        "HAMILTON, DELMAR"       -> "Delmar Hamilton"
  //        "JACKSON, III, BERNARD MONTAY" -> "Bernard Montay Jackson III"
  const parts = raw.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length < 2) {
    return toTitleCase(raw);
  }

  // Roman numeral suffixes (Jr, Sr, I-VIII) sometimes sit in their own
  // comma-separated slot, e.g. "JACKSON, III, BERNARD MONTAY". Absorb them
  // into the last-name block.
  const suffixRe = /^(?:JR|SR|I{1,3}|IV|V|VI{0,3}|VIII)\.?$/i;
  let last = parts[0];
  let restStart = 1;
  while (restStart < parts.length && suffixRe.test(parts[restStart])) {
    last += ' ' + parts[restStart];
    restStart++;
  }

  const firstMiddle = parts.slice(restStart).join(' ').replace(/\s+/g, ' ').trim();
  if (!firstMiddle) {
    return toTitleCase(last);
  }
  return toTitleCase(`${firstMiddle} ${last}`).replace(/\s+/g, ' ').trim();
}

function toTitleCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.replace(/\b[\p{L}'`-]+/gu, (word) => {
    if (/^(i{1,3}|iv|v|vi{0,3})$/i.test(word) && word.length <= 4) {
      return word.toUpperCase();
    }
    // short forms Mc, Mac should keep mixed case: McBee -> McBee
    if (/^mc\p{L}+/iu.test(word) && word.length > 2) {
      return 'Mc' + word.charAt(2).toUpperCase() + word.slice(3);
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

// -- ArrestFacts shaping --------------------------------------------------

function toArrestFacts(
  inmate: GordonInmate,
  link: GordonPdfLink
): ArrestFacts | null {
  if (!inmate.name) return null;

  const bookingDate = inmate.bookingDate || link.reportDate;
  const publishedAt = inmate.publishedAt || `${bookingDate}T00:00:00.000Z`;

  const sourceId = inmate.inmateNumber
    ? 20_000_000 + inmate.inmateNumber
    : 20_000_000 + hashCode(`${inmate.name}|${bookingDate}`);

  return {
    sourceId,
    name: inmate.name,
    county: 'Gordon',
    charges: inmate.charges,
    bookingDate,
    sourceUrl: link.url,
    mugshotUrl: undefined, // PDF images are embedded; out of scope.
    publishedAt,
  };
}

export function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
