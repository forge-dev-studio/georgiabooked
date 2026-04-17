import { parse as parseHTML } from 'node-html-parser';
import type { ArrestFacts } from '../extract-facts.ts';

// Paulding County (GA) inmate scraper -- Tyler NewWorld MVC.
//
// The Paulding County Sheriff's Office exposes an inmate inquiry at
//   https://inmate.paulding.gov:9443/NewWorld.InmateInquiry/GA1100000
//
// Pure HTTP GET requests. No VIEWSTATE, no auth. The index page returns an
// HTML table with Name + SubjectNumber columns. Booking dates and charges
// require following each detail link.
//
// Detail URL pattern: /GA1100000/Inmate/Detail/<signedId>
// Detail page contains DemographicInformation, Booking blocks, and
// BookingCharges tables with ChargeDescription + CrimeClass columns.
//
// Pagination: <div class="Pager"> with <a class="Next" href="...&Page=N">

const BASE_URL = 'https://inmate.paulding.gov:9443/NewWorld.InmateInquiry';
const COUNTY_PATH = '/GA1100000';
const USER_AGENT =
  'Mozilla/5.0 (compatible; GeorgiaBookedBot/1.0; +https://georgiabooked.com/about)';
const SOURCE_ID_BASE = 30_000_000;
const REQUEST_SPACING_MS = 1000; // 1 req/sec, be polite

export interface FetchPauldingOptions {
  maxPages?: number;
}

export async function fetchPauldingArrests(
  opts: FetchPauldingOptions = {}
): Promise<ArrestFacts[]> {
  const maxPages = opts.maxPages ?? 10;

  // Build date range: last 7 days
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromStr = formatMDY(from);
  const toStr = formatMDY(now);

  const results: ArrestFacts[] = [];
  const seen = new Set<number>();
  let page = 1;

  while (page <= maxPages) {
    const indexUrl =
      `${BASE_URL}${COUNTY_PATH}?InCustody=False` +
      `&BookingFromDate=${encodeURIComponent(fromStr)}` +
      `&BookingToDate=${encodeURIComponent(toStr)}` +
      `&Page=${page}`;

    const indexHtml = await fetchPage(indexUrl);
    const { detailPaths, hasNext } = parseIndexPage(indexHtml);

    if (detailPaths.length === 0) break;

    for (const detailPath of detailPaths) {
      await sleep(REQUEST_SPACING_MS);

      const detailUrl = `${BASE_URL}${detailPath}`;
      try {
        const detailHtml = await fetchPage(detailUrl);
        const fact = parseDetailPage(detailHtml, detailPath, detailUrl);
        if (fact && !seen.has(fact.sourceId)) {
          seen.add(fact.sourceId);
          results.push(fact);
        }
      } catch (err) {
        console.warn(
          `[paulding] failed to fetch detail ${detailPath}:`,
          (err as Error).message
        );
      }
    }

    if (!hasNext) break;
    page++;
    await sleep(REQUEST_SPACING_MS);
  }

  return results;
}

// -- HTTP helpers -----------------------------------------------------------

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) {
    throw new Error(`[paulding] ${url} -> ${res.status} ${res.statusText}`);
  }
  return res.text();
}

// -- Index page parsing -----------------------------------------------------

export interface IndexParseResult {
  detailPaths: string[];   // e.g. ["/GA1100000/Inmate/Detail/-166253"]
  hasNext: boolean;
}

export function parseIndexPage(html: string): IndexParseResult {
  const root = parseHTML(html);

  // Each row links to a detail page. The href lives in an <a> tag inside
  // the table rows. Pattern: /GA1100000/Inmate/Detail/<id>
  const links = root.querySelectorAll('a[href*="/Inmate/Detail/"]');
  const detailPaths: string[] = [];
  const pathSet = new Set<string>();

  for (const link of links) {
    const href = link.getAttribute('href');
    if (!href) continue;
    // Normalize: keep just the path portion starting from /GA
    const match = href.match(/(\/GA\d+\/Inmate\/Detail\/-?\d+)/);
    if (match && !pathSet.has(match[1])) {
      pathSet.add(match[1]);
      detailPaths.push(match[1]);
    }
  }

  // Pagination: look for a "Next" link
  const nextLink = root.querySelector('.Pager a.Next') ||
    root.querySelector('a.Next');
  const hasNext = nextLink !== null;

  return { detailPaths, hasNext };
}

// -- Detail page parsing ----------------------------------------------------

export function parseDetailPage(
  html: string,
  detailPath: string,
  sourceUrl: string
): ArrestFacts | null {
  const root = parseHTML(html);

  // Extract signed ID from path
  const idMatch = detailPath.match(/\/Detail\/(-?\d+)/);
  if (!idMatch) return null;
  const signedId = parseInt(idMatch[1], 10);
  const sourceId = SOURCE_ID_BASE + Math.abs(signedId);

  // Name: inside #DemographicInformation or the page heading
  const name = extractName(root);
  if (!name) return null;

  // Booking date: from the first Booking block
  const bookingDate = extractBookingDate(root);

  // Charges: from BookingCharges table(s)
  const charges = extractCharges(root);

  const publishedAt = bookingDate
    ? `${bookingDate}T00:00:00-04:00`
    : new Date().toISOString();

  return {
    sourceId,
    name,
    county: 'Paulding',
    charges,
    bookingDate: bookingDate || new Date().toISOString().slice(0, 10),
    sourceUrl,
    mugshotUrl: undefined,
    publishedAt,
  };
}

export function extractName(root: ReturnType<typeof parseHTML>): string {
  // Try the demographic information section first
  const demoDiv = root.querySelector('#DemographicInformation');
  if (demoDiv) {
    // Name is typically in a label/value pair or a heading
    const nameLabel = demoDiv.querySelectorAll('.Label, label, th, dt');
    for (const lbl of nameLabel) {
      if (/^name$/i.test(lbl.text.trim())) {
        const val = lbl.nextElementSibling;
        if (val) {
          const raw = val.text.trim();
          if (raw) return normalizeName(raw);
        }
      }
    }
    // Fallback: look for a prominent text node inside demo div
    const headings = demoDiv.querySelectorAll('h1, h2, h3, .Name, .InmateName');
    for (const h of headings) {
      const raw = h.text.trim();
      if (raw && raw.length > 2) return normalizeName(raw);
    }
  }

  // Fallback: page title or heading
  const headings = root.querySelectorAll('h1, h2, .page-title, .InmateName');
  for (const h of headings) {
    const raw = h.text.trim();
    // Skip generic headings
    if (raw && raw.length > 2 && !/inmate|detail|inquiry/i.test(raw)) {
      return normalizeName(raw);
    }
  }

  return '';
}

export function extractBookingDate(
  root: ReturnType<typeof parseHTML>
): string | null {
  // Look for booking date in Booking blocks
  const bookingDivs = root.querySelectorAll('.Booking, .BookingDetail, [class*="Booking"]');
  for (const div of bookingDivs) {
    const labels = div.querySelectorAll('.Label, label, th, dt');
    for (const lbl of labels) {
      if (/book.*date/i.test(lbl.text.trim())) {
        const val = lbl.nextElementSibling;
        if (val) {
          const parsed = parseDateString(val.text.trim());
          if (parsed) return parsed;
        }
      }
    }
  }

  // Broader search: any text matching date patterns after "Booking Date"
  const allText = root.text;
  const dateMatch = allText.match(
    /Booking\s*(?:Date)?[:\s]*(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i
  );
  if (dateMatch) {
    return parseDateString(dateMatch[1]);
  }

  return null;
}

export function extractCharges(root: ReturnType<typeof parseHTML>): string[] {
  const charges: string[] = [];

  // BookingCharges table(s) with ChargeDescription column
  const chargeTables = root.querySelectorAll(
    '.BookingCharges table, table.BookingCharges, [class*="BookingCharges"] table, [class*="Charge"] table'
  );

  for (const table of chargeTables) {
    const rows = table.querySelectorAll('tr');
    // Find the column index for ChargeDescription
    let descIdx = -1;
    if (rows.length > 0) {
      const headers = rows[0].querySelectorAll('th');
      headers.forEach((th, i) => {
        if (/charge\s*desc/i.test(th.text.trim())) descIdx = i;
      });
    }

    // If we found the header, extract from that column
    const dataRows = rows.slice(descIdx >= 0 ? 1 : 0);
    for (const row of dataRows) {
      const cells = row.querySelectorAll('td');
      if (descIdx >= 0 && cells.length > descIdx) {
        const charge = cells[descIdx].text.trim();
        if (charge && charge.length > 1) charges.push(toTitleCase(charge));
      } else {
        // Fallback: look for any cell that looks like a charge description
        for (const cell of cells) {
          const text = cell.text.trim();
          if (text && text.length > 3 && /[A-Za-z]/.test(text) && !/^\d+$/.test(text)) {
            charges.push(toTitleCase(text));
            break; // take first text-like cell per row
          }
        }
      }
    }
  }

  // Fallback: look for charge items in list format
  if (charges.length === 0) {
    const chargeItems = root.querySelectorAll(
      '.ChargeDescription, [class*="ChargeDescription"], .charge-description'
    );
    for (const item of chargeItems) {
      const text = item.text.trim();
      if (text && text.length > 1) charges.push(toTitleCase(text));
    }
  }

  // Dedupe while preserving order
  const seen = new Set<string>();
  return charges.filter((c) => {
    const key = c.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// -- Name normalization -----------------------------------------------------

export function normalizeName(raw: string): string {
  // Input may be "LAST, FIRST MIDDLE" or "FIRST MIDDLE LAST" or "Last, First"
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Check for "LAST, FIRST MIDDLE" format
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
    if (parts.length >= 2) {
      const last = parts[0];
      const firstMiddle = parts.slice(1).join(' ').replace(/\s+/g, ' ').trim();
      return toTitleCase(`${firstMiddle} ${last}`).replace(/\s+/g, ' ').trim();
    }
  }

  return toTitleCase(trimmed).replace(/\s+/g, ' ').trim();
}

// -- Date parsing -----------------------------------------------------------

export function parseDateString(raw: string): string | null {
  // Handles: "M/D/YYYY", "M/D/YYYY h:MM AM/PM", "MM/DD/YYYY h:MM:SS AM/PM"
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

// -- Utility ----------------------------------------------------------------

function toTitleCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.replace(/\b[\p{L}'`-]+/gu, (word) => {
    if (/^(i{1,3}|iv|v|vi{0,3})$/i.test(word) && word.length <= 4) {
      return word.toUpperCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

function formatMDY(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
