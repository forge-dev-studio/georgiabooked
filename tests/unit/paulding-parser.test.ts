import { describe, it, expect } from 'vitest';
import {
  parseIndexPage,
  parseDetailPage,
  extractName,
  extractBookingDate,
  extractCharges,
  normalizeName,
  parseDateString,
} from '../../scripts/scrapers/paulding';
import { parse as parseHTML } from 'node-html-parser';

// Frozen HTML snippets modeled after the Tyler NewWorld MVC interface at
// https://inmate.paulding.gov:9443/NewWorld.InmateInquiry/GA1100000

const FROZEN_INDEX_HTML = `
<html>
<body>
<table class="InmateList">
  <thead>
    <tr><th>Name</th><th>Subject Number</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><a href="/GA1100000/Inmate/Detail/-166253">SMITH, JOHN MICHAEL</a></td>
      <td>2024-00512</td>
    </tr>
    <tr>
      <td><a href="/GA1100000/Inmate/Detail/-167890">JONES, MARY ANN</a></td>
      <td>2024-00513</td>
    </tr>
    <tr>
      <td><a href="/GA1100000/Inmate/Detail/42001">DOE, JANE</a></td>
      <td>2024-00514</td>
    </tr>
  </tbody>
</table>
<div class="Pager">
  <a class="Previous" href="?Page=1">Previous</a>
  <span class="Current">2</span>
  <a class="Next" href="?InCustody=False&amp;Page=3">Next</a>
</div>
</body>
</html>`;

const FROZEN_INDEX_NO_NEXT = `
<html>
<body>
<table class="InmateList">
  <thead><tr><th>Name</th><th>Subject Number</th></tr></thead>
  <tbody>
    <tr>
      <td><a href="/GA1100000/Inmate/Detail/-166253">SMITH, JOHN MICHAEL</a></td>
      <td>2024-00512</td>
    </tr>
  </tbody>
</table>
<div class="Pager">
  <a class="Previous" href="?Page=1">Previous</a>
  <span class="Current">2</span>
</div>
</body>
</html>`;

const FROZEN_DETAIL_HTML = `
<html>
<body>
<div id="DemographicInformation">
  <h2 class="InmateName">SMITH, JOHN MICHAEL</h2>
  <div class="DemoRow">
    <span class="Label">Name</span>
    <span class="Value">SMITH, JOHN MICHAEL</span>
  </div>
  <div class="DemoRow">
    <span class="Label">Subject Number</span>
    <span class="Value">2024-00512</span>
  </div>
  <div class="DemoRow">
    <span class="Label">Age</span>
    <span class="Value">34</span>
  </div>
</div>
<div class="Booking">
  <h3>Booking #1</h3>
  <div class="BookingRow">
    <span class="Label">Booking Date</span>
    <span class="Value">4/10/2026 2:35 PM</span>
  </div>
  <div class="BookingCharges">
    <table>
      <tr>
        <th>ChargeDescription</th>
        <th>CrimeClass</th>
        <th>BondAmount</th>
      </tr>
      <tr>
        <td>POSSESSION OF MARIJUANA LESS THAN 1 OZ</td>
        <td>Misdemeanor</td>
        <td>$1,500.00</td>
      </tr>
      <tr>
        <td>DRIVING UNDER THE INFLUENCE</td>
        <td>Misdemeanor</td>
        <td>$3,000.00</td>
      </tr>
    </table>
  </div>
</div>
</body>
</html>`;

const FROZEN_DETAIL_MINIMAL = `
<html>
<body>
<div id="DemographicInformation">
  <h2 class="InmateName">JONES, MARY ANN</h2>
</div>
<div class="Booking">
  <div class="BookingRow">
    <span class="Label">Booking Date</span>
    <span class="Value">4/12/2026 9:15 AM</span>
  </div>
  <div class="BookingCharges">
    <table>
      <tr>
        <th>ChargeDescription</th>
        <th>CrimeClass</th>
      </tr>
      <tr>
        <td>THEFT BY SHOPLIFTING</td>
        <td>Misdemeanor</td>
      </tr>
    </table>
  </div>
</div>
</body>
</html>`;

// -- Index page tests -------------------------------------------------------

describe('paulding parseIndexPage', () => {
  it('extracts detail paths from index HTML', () => {
    const result = parseIndexPage(FROZEN_INDEX_HTML);
    expect(result.detailPaths).toHaveLength(3);
    expect(result.detailPaths).toContain('/GA1100000/Inmate/Detail/-166253');
    expect(result.detailPaths).toContain('/GA1100000/Inmate/Detail/-167890');
    expect(result.detailPaths).toContain('/GA1100000/Inmate/Detail/42001');
  });

  it('detects hasNext when a Next pager link exists', () => {
    const result = parseIndexPage(FROZEN_INDEX_HTML);
    expect(result.hasNext).toBe(true);
  });

  it('returns hasNext=false when no Next link', () => {
    const result = parseIndexPage(FROZEN_INDEX_NO_NEXT);
    expect(result.hasNext).toBe(false);
  });

  it('deduplicates detail paths', () => {
    const dupeHtml = `
      <table>
        <tr><td><a href="/GA1100000/Inmate/Detail/-166253">A</a></td></tr>
        <tr><td><a href="/GA1100000/Inmate/Detail/-166253">A</a></td></tr>
      </table>`;
    const result = parseIndexPage(dupeHtml);
    expect(result.detailPaths).toHaveLength(1);
  });

  it('handles empty table gracefully', () => {
    const emptyHtml = '<html><body><table></table></body></html>';
    const result = parseIndexPage(emptyHtml);
    expect(result.detailPaths).toHaveLength(0);
    expect(result.hasNext).toBe(false);
  });
});

// -- Detail page tests ------------------------------------------------------

describe('paulding parseDetailPage', () => {
  const detailPath = '/GA1100000/Inmate/Detail/-166253';
  const sourceUrl = `https://inmate.paulding.gov:9443/NewWorld.InmateInquiry${detailPath}`;

  it('extracts name, booking date, charges from a full detail page', () => {
    const result = parseDetailPage(FROZEN_DETAIL_HTML, detailPath, sourceUrl);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('John Michael Smith');
    expect(result!.county).toBe('Paulding');
    expect(result!.bookingDate).toBe('2026-04-10');
    expect(result!.charges).toEqual([
      'Possession Of Marijuana Less Than 1 Oz',
      'Driving Under The Influence',
    ]);
    expect(result!.sourceId).toBe(30_000_000 + 166253);
    expect(result!.sourceUrl).toBe(sourceUrl);
    expect(result!.mugshotUrl).toBeUndefined();
  });

  it('handles positive signed IDs correctly', () => {
    const posPath = '/GA1100000/Inmate/Detail/42001';
    const result = parseDetailPage(FROZEN_DETAIL_HTML, posPath, sourceUrl);
    expect(result).not.toBeNull();
    expect(result!.sourceId).toBe(30_000_000 + 42001);
  });

  it('extracts from minimal detail page with InmateName heading', () => {
    const minPath = '/GA1100000/Inmate/Detail/-167890';
    const result = parseDetailPage(
      FROZEN_DETAIL_MINIMAL,
      minPath,
      sourceUrl
    );
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Mary Ann Jones');
    expect(result!.bookingDate).toBe('2026-04-12');
    expect(result!.charges).toEqual(['Theft By Shoplifting']);
  });

  it('returns null for invalid detail path', () => {
    const result = parseDetailPage(FROZEN_DETAIL_HTML, '/bad/path', sourceUrl);
    expect(result).toBeNull();
  });
});

// -- Name normalization tests -----------------------------------------------

describe('paulding normalizeName', () => {
  it('converts "LAST, FIRST MIDDLE" to "First Middle Last"', () => {
    expect(normalizeName('SMITH, JOHN MICHAEL')).toBe('John Michael Smith');
  });

  it('handles single first name', () => {
    expect(normalizeName('DOE, JANE')).toBe('Jane Doe');
  });

  it('handles already proper case with comma', () => {
    expect(normalizeName('Brown, David Lee')).toBe('David Lee Brown');
  });

  it('handles no-comma format', () => {
    expect(normalizeName('JOHN SMITH')).toBe('John Smith');
  });

  it('returns empty for empty input', () => {
    expect(normalizeName('')).toBe('');
  });
});

// -- Date parsing tests -----------------------------------------------------

describe('paulding parseDateString', () => {
  it('parses M/D/YYYY format', () => {
    expect(parseDateString('4/10/2026')).toBe('2026-04-10');
  });

  it('parses M/D/YYYY h:MM AM/PM format', () => {
    expect(parseDateString('4/10/2026 2:35 PM')).toBe('2026-04-10');
  });

  it('parses MM/DD/YYYY format', () => {
    expect(parseDateString('12/01/2025')).toBe('2025-12-01');
  });

  it('returns null for unparseable input', () => {
    expect(parseDateString('not a date')).toBeNull();
  });
});
