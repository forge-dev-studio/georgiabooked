import { parse as parseHTML } from 'node-html-parser';
import type { ArrestFacts } from '../extract-facts.ts';

// Clayton County (GA) inmate scraper -- legacy CGI interface.
//
// The Clayton County Sheriff's Office publishes a jail booking report via a
// plain CGI script at:
//   https://weba.claytoncountyga.gov/sjiinqcgi-bin/wsj210r.pgm?days=N&rtype=F
//
// Pure HTTP GET. No auth, no cookies, no viewstate. Returns a flex-based div
// layout (not a real <table>) with columns: Docket Number (link inside <a>),
// Intake Date/Time (inside <time>), Release Date/Time, Name, Age, Charge,
// Bond Amount.
//
// Each data row is a <div class="table-row"> with 7 child <div class="cell">
// elements. The header row has class "header-row" and is skipped.
//
// We scrape the index page directly -- no need to follow detail links since
// all required fields are present in the main listing.

const CGI_BASE = 'https://weba.claytoncountyga.gov/sjiinqcgi-bin/wsj210r.pgm';
const USER_AGENT =
  'Mozilla/5.0 (compatible; GeorgiaBookedBot/1.0; +https://georgiabooked.com/about)';
const SOURCE_ID_BASE = 40_000_000;

export interface FetchClaytonOptions {
  days?: number;   // lookback window; default 14
}

export async function fetchClaytonArrests(
  opts: FetchClaytonOptions = {}
): Promise<ArrestFacts[]> {
  const days = opts.days ?? 14;
  const url = `${CGI_BASE}?days=${days}&rtype=F`;

  const html = await fetchPage(url);
  return parseClaytonTable(html);
}

// -- HTTP helper ------------------------------------------------------------

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) {
    throw new Error(`[clayton] ${url} -> ${res.status} ${res.statusText}`);
  }
  return res.text();
}

// -- Table parsing ----------------------------------------------------------

export interface ClaytonRow {
  docketNumber: string;
  intakeDate: string;       // raw from the table
  releaseDate: string;      // raw from the table
  name: string;             // raw "LASTNAME FIRSTNAME" format
  age: string;
  charge: string;
  bondAmount: string;
}

export function parseClaytonTable(html: string): ArrestFacts[] {
  const root = parseHTML(html);
  const rows = extractTableRows(root);

  // Group rows by docket number. Each docket may have multiple charge rows.
  const grouped = groupByDocket(rows);

  const results: ArrestFacts[] = [];
  const seen = new Set<number>();

  for (const [docket, group] of grouped) {
    const first = group[0];
    const name = normalizeClaytonName(first.name);
    if (!name) continue;

    const bookingDate = parseIntakeDate(first.intakeDate);
    const charges = group
      .map((r) => r.charge.trim())
      .filter((c) => c.length > 0)
      .map((c) => toTitleCase(c));

    // Dedupe charges
    const uniqueCharges: string[] = [];
    const chargeSet = new Set<string>();
    for (const c of charges) {
      const key = c.toLowerCase();
      if (!chargeSet.has(key)) {
        chargeSet.add(key);
        uniqueCharges.push(c);
      }
    }

    const numericDocket = extractNumericDocket(docket);
    const sourceId = SOURCE_ID_BASE + numericDocket;

    if (seen.has(sourceId)) continue;
    seen.add(sourceId);

    const sourceUrl = `${CGI_BASE}?days=14&rtype=F`;
    const publishedAt = bookingDate
      ? `${bookingDate}T00:00:00-04:00`
      : new Date().toISOString();

    results.push({
      sourceId,
      name,
      county: 'Clayton',
      charges: uniqueCharges,
      bookingDate: bookingDate || new Date().toISOString().slice(0, 10),
      sourceUrl,
      mugshotUrl: undefined,
      publishedAt,
    });
  }

  return results;
}

export function extractTableRows(
  root: ReturnType<typeof parseHTML>
): ClaytonRow[] {
  const rows: ClaytonRow[] = [];

  // The page uses a flex-based div layout. Data rows are <div class="table-row">
  // (without the "header-row" class). Each row has 7 child <div class="cell">
  // elements in column order: Docket, Intake, Release, Name, Age, Charge, Bond.
  const allRows = root.querySelectorAll('.table-row');

  for (const rowDiv of allRows) {
    // Skip the header row
    if (rowDiv.classList.contains('header-row')) continue;

    const cells = rowDiv.querySelectorAll('.cell');
    if (cells.length < 5) continue;

    // Docket number: inside an <a> tag in the first cell
    const docketLink = cells[0].querySelector('a');
    const docketNumber = docketLink
      ? docketLink.text.trim()
      : cells[0].text.trim();

    // Intake date: may be inside a <time> element
    const timeEl = cells[1].querySelector('time');
    const intakeDate = timeEl
      ? timeEl.text.replace(/<br\s*\/?>/gi, ' ').trim()
      : cells[1].text.trim();

    // Release date (cell 2), Name (cell 3), Age (cell 4), Charge (cell 5), Bond (cell 6)
    const releaseDate = cells.length > 2 ? cells[2].text.trim() : '';
    const name = cells.length > 3 ? cells[3].text.trim() : '';
    const age = cells.length > 4 ? cells[4].text.trim() : '';
    const charge = cells.length > 5 ? cells[5].text.trim() : '';
    const bondAmount = cells.length > 6 ? cells[6].text.trim() : '';

    if (!docketNumber || !name) continue;

    rows.push({
      docketNumber,
      intakeDate,
      releaseDate,
      name,
      age,
      charge,
      bondAmount,
    });
  }

  // Fallback: try traditional <table> if no flex rows found (older markup)
  if (rows.length === 0) {
    const tables = root.querySelectorAll('table');
    for (const table of tables) {
      const trs = table.querySelectorAll('tr');
      for (const tr of trs) {
        const ths = tr.querySelectorAll('th');
        if (ths.length > 0) continue; // skip header

        const tds = tr.querySelectorAll('td');
        if (tds.length < 5) continue;

        rows.push({
          docketNumber: tds[0].text.trim(),
          intakeDate: tds[1].text.trim(),
          releaseDate: tds.length > 2 ? tds[2].text.trim() : '',
          name: tds.length > 3 ? tds[3].text.trim() : tds[2].text.trim(),
          age: tds.length > 4 ? tds[4].text.trim() : tds[3].text.trim(),
          charge: tds.length > 5 ? tds[5].text.trim() : tds[4].text.trim(),
          bondAmount: tds.length > 6 ? tds[6].text.trim() : '',
        });
      }
    }
  }

  return rows;
}

export function groupByDocket(
  rows: ClaytonRow[]
): Map<string, ClaytonRow[]> {
  const map = new Map<string, ClaytonRow[]>();
  for (const row of rows) {
    if (!row.docketNumber) continue;
    const existing = map.get(row.docketNumber);
    if (existing) {
      existing.push(row);
    } else {
      map.set(row.docketNumber, [row]);
    }
  }
  return map;
}

// -- Name normalization -----------------------------------------------------

export function normalizeClaytonName(raw: string): string {
  // Input: "LASTNAME FIRSTNAME" or "LASTNAME FIRSTNAME MIDDLE"
  // Output: "Firstname Middle Lastname"
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // If it contains a comma, treat as "LAST, FIRST MIDDLE"
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
    if (parts.length >= 2) {
      const last = parts[0];
      const firstMiddle = parts.slice(1).join(' ').replace(/\s+/g, ' ').trim();
      return toTitleCase(`${firstMiddle} ${last}`).replace(/\s+/g, ' ').trim();
    }
  }

  // "LASTNAME FIRSTNAME [MIDDLE]" format -- split on spaces
  const parts = trimmed.split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 1) {
    return toTitleCase(parts[0]);
  }
  if (parts.length >= 2) {
    const last = parts[0];
    const rest = parts.slice(1).join(' ');
    return toTitleCase(`${rest} ${last}`).replace(/\s+/g, ' ').trim();
  }

  return toTitleCase(trimmed);
}

// -- Date parsing -----------------------------------------------------------

export function parseIntakeDate(raw: string): string | null {
  // Handles: "MM/DD/YYYY HH:MM", "M/D/YYYY", "YYYY-MM-DD", etc.
  const mdyMatch = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdyMatch) {
    return `${mdyMatch[3]}-${mdyMatch[1].padStart(2, '0')}-${mdyMatch[2].padStart(2, '0')}`;
  }
  const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return isoMatch[0];
  }
  return null;
}

// -- Docket number extraction -----------------------------------------------

export function extractNumericDocket(docket: string): number {
  // Strip non-numeric characters and parse. If empty, hash the string.
  const digits = docket.replace(/\D/g, '');
  if (digits) {
    const num = parseInt(digits, 10);
    if (!isNaN(num) && num > 0) return num;
  }
  // Fallback: hash
  return hashCode(docket);
}

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
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
