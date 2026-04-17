import { describe, it, expect } from 'vitest';
import {
  parseClaytonTable,
  extractTableRows,
  groupByDocket,
  normalizeClaytonName,
  parseIntakeDate,
  extractNumericDocket,
} from '../../scripts/scrapers/clayton';

// Frozen HTML snippet modeled after the actual Clayton County CGI jail report
// flex-based div layout at:
// https://weba.claytoncountyga.gov/sjiinqcgi-bin/wsj210r.pgm?days=2&rtype=F

const FROZEN_48HR_TABLE = `
<html>
<body>
<section class="table-container">
  <h2>14 DAY DOCKET BOOK</h2>
  <div class="table-row header-row" role="row">
    <div class="cell w-10" role="columnheader">Docket Number</div>
    <div class="cell w-10" role="columnheader">Intake Date and Time</div>
    <div class="cell w-10" role="columnheader">Release Date and Time</div>
    <div class="cell w-25" role="columnheader">Name</div>
    <div class="cell w-5" role="columnheader">Age</div>
    <div class="cell w-23" role="columnheader">Charge</div>
    <div class="cell w-22" role="columnheader">Bond Amount</div>
  </div>
  <div class="table-row row-alt" role="row">
    <div class="cell w-10" role="cell">
      <a href="/sjiinqcgi-bin/wsj205r.pgm?dkt=2026001234&le=1&inmname=JOHNSON+ROBERT" aria-label="View details for Docket 2026001234">
        2026001234
      </a>
    </div>
    <div class="cell w-10" role="cell">
      <time datetime="04/14/2026">04/14/2026 <br>08:30 AM</time>
    </div>
    <div class="cell w-10" role="cell">
      <span class="badge-notready">*IN JAIL*</span>
    </div>
    <div class="cell w-25" role="cell">JOHNSON ROBERT JAMES</div>
    <div class="cell w-5" role="cell"><span aria-label="Age 29">29</span></div>
    <div class="cell w-23" role="cell">DRIVING UNDER INFLUENCE OF ALCOHOL</div>
    <div class="cell w-22" role="cell">$2,500.00</div>
  </div>
  <div class="table-row" role="row">
    <div class="cell w-10" role="cell">
      <a href="/sjiinqcgi-bin/wsj205r.pgm?dkt=2026001234&le=2">2026001234</a>
    </div>
    <div class="cell w-10" role="cell">
      <time datetime="04/14/2026">04/14/2026 <br>08:30 AM</time>
    </div>
    <div class="cell w-10" role="cell">
      <span class="badge-notready">*IN JAIL*</span>
    </div>
    <div class="cell w-25" role="cell">JOHNSON ROBERT JAMES</div>
    <div class="cell w-5" role="cell"><span aria-label="Age 29">29</span></div>
    <div class="cell w-23" role="cell">RECKLESS DRIVING</div>
    <div class="cell w-22" role="cell">$1,000.00</div>
  </div>
  <div class="table-row row-alt" role="row">
    <div class="cell w-10" role="cell">
      <a href="/sjiinqcgi-bin/wsj205r.pgm?dkt=2026001235&le=1">2026001235</a>
    </div>
    <div class="cell w-10" role="cell">
      <time datetime="04/13/2026">04/13/2026 <br>02:22 PM</time>
    </div>
    <div class="cell w-10" role="cell">04/14/2026 06:00 AM</div>
    <div class="cell w-25" role="cell">WILLIAMS SARAH MARIE</div>
    <div class="cell w-5" role="cell"><span aria-label="Age 35">35</span></div>
    <div class="cell w-23" role="cell">THEFT BY SHOPLIFTING</div>
    <div class="cell w-22" role="cell">$500.00</div>
  </div>
  <div class="table-row" role="row">
    <div class="cell w-10" role="cell">
      <a href="/sjiinqcgi-bin/wsj205r.pgm?dkt=2026001236&le=1">2026001236</a>
    </div>
    <div class="cell w-10" role="cell">
      <time datetime="04/14/2026">04/14/2026 <br>10:10 PM</time>
    </div>
    <div class="cell w-10" role="cell">
      <span class="badge-notready">*IN JAIL*</span>
    </div>
    <div class="cell w-25" role="cell">BROWN DAVID</div>
    <div class="cell w-5" role="cell"><span aria-label="Age 42">42</span></div>
    <div class="cell w-23" role="cell">AGGRAVATED ASSAULT</div>
    <div class="cell w-22" role="cell">$25,000.00</div>
  </div>
</section>
</body>
</html>`;

const FROZEN_EMPTY_TABLE = `
<html>
<body>
<section class="table-container">
  <h2>14 DAY DOCKET BOOK</h2>
  <div class="table-row header-row" role="row">
    <div class="cell w-10" role="columnheader">Docket Number</div>
    <div class="cell w-10" role="columnheader">Intake Date and Time</div>
    <div class="cell w-10" role="columnheader">Release Date and Time</div>
    <div class="cell w-25" role="columnheader">Name</div>
    <div class="cell w-5" role="columnheader">Age</div>
    <div class="cell w-23" role="columnheader">Charge</div>
    <div class="cell w-22" role="columnheader">Bond Amount</div>
  </div>
</section>
</body>
</html>`;

// -- Full pipeline tests ----------------------------------------------------

describe('clayton parseClaytonTable', () => {
  it('parses a 48-hour table into ArrestFacts', () => {
    const results = parseClaytonTable(FROZEN_48HR_TABLE);
    expect(results).toHaveLength(3);
  });

  it('groups multi-charge dockets into a single record', () => {
    const results = parseClaytonTable(FROZEN_48HR_TABLE);
    const johnson = results.find((r) => r.name.includes('Johnson'));
    expect(johnson).toBeDefined();
    expect(johnson!.charges).toHaveLength(2);
    expect(johnson!.charges).toContain('Driving Under Influence Of Alcohol');
    expect(johnson!.charges).toContain('Reckless Driving');
  });

  it('normalizes names from "LASTNAME FIRSTNAME" to proper case', () => {
    const results = parseClaytonTable(FROZEN_48HR_TABLE);
    const names = results.map((r) => r.name);
    expect(names).toContain('Robert James Johnson');
    expect(names).toContain('Sarah Marie Williams');
    expect(names).toContain('David Brown');
  });

  it('extracts booking dates correctly', () => {
    const results = parseClaytonTable(FROZEN_48HR_TABLE);
    const johnson = results.find((r) => r.name === 'Robert James Johnson');
    expect(johnson!.bookingDate).toBe('2026-04-14');

    const williams = results.find((r) => r.name === 'Sarah Marie Williams');
    expect(williams!.bookingDate).toBe('2026-04-13');
  });

  it('assigns sourceIds with 40M base offset', () => {
    const results = parseClaytonTable(FROZEN_48HR_TABLE);
    for (const r of results) {
      expect(r.sourceId).toBeGreaterThanOrEqual(40_000_000);
    }
    // Verify the offset is applied: docket 2026001234 -> 40M + 2026001234
    const johnson = results.find((r) => r.name === 'Robert James Johnson');
    expect(johnson!.sourceId).toBe(40_000_000 + 2026001234);
  });

  it('sets county to Clayton', () => {
    const results = parseClaytonTable(FROZEN_48HR_TABLE);
    for (const r of results) {
      expect(r.county).toBe('Clayton');
    }
  });

  it('handles empty table gracefully', () => {
    const results = parseClaytonTable(FROZEN_EMPTY_TABLE);
    expect(results).toHaveLength(0);
  });

  it('computes correct sourceId from docket number', () => {
    const results = parseClaytonTable(FROZEN_48HR_TABLE);
    const johnson = results.find((r) => r.name === 'Robert James Johnson');
    expect(johnson!.sourceId).toBe(40_000_000 + 2026001234);
  });
});

// -- Row extraction tests ---------------------------------------------------

describe('clayton extractTableRows', () => {
  it('extracts all data rows, skipping headers', () => {
    const { parse } = require('node-html-parser');
    const root = parse(FROZEN_48HR_TABLE);
    const rows = extractTableRows(root);
    expect(rows).toHaveLength(4); // 4 rows (Johnson has 2 charge rows)
    expect(rows[0].docketNumber).toBe('2026001234');
    expect(rows[0].name).toBe('JOHNSON ROBERT JAMES');
    expect(rows[0].charge).toBe('DRIVING UNDER INFLUENCE OF ALCOHOL');
  });
});

// -- Grouping tests ---------------------------------------------------------

describe('clayton groupByDocket', () => {
  it('groups rows with same docket number', () => {
    const rows = [
      { docketNumber: '100', intakeDate: '', releaseDate: '', name: 'A', age: '', charge: 'C1', bondAmount: '' },
      { docketNumber: '100', intakeDate: '', releaseDate: '', name: 'A', age: '', charge: 'C2', bondAmount: '' },
      { docketNumber: '200', intakeDate: '', releaseDate: '', name: 'B', age: '', charge: 'C3', bondAmount: '' },
    ];
    const grouped = groupByDocket(rows);
    expect(grouped.size).toBe(2);
    expect(grouped.get('100')!).toHaveLength(2);
    expect(grouped.get('200')!).toHaveLength(1);
  });

  it('skips rows with empty docket number', () => {
    const rows = [
      { docketNumber: '', intakeDate: '', releaseDate: '', name: 'A', age: '', charge: 'C1', bondAmount: '' },
    ];
    const grouped = groupByDocket(rows);
    expect(grouped.size).toBe(0);
  });
});

// -- Name normalization tests -----------------------------------------------

describe('clayton normalizeClaytonName', () => {
  it('converts "LASTNAME FIRSTNAME" to "Firstname Lastname"', () => {
    expect(normalizeClaytonName('JOHNSON ROBERT')).toBe('Robert Johnson');
  });

  it('converts "LASTNAME FIRSTNAME MIDDLE" to "Firstname Middle Lastname"', () => {
    expect(normalizeClaytonName('WILLIAMS SARAH MARIE')).toBe('Sarah Marie Williams');
  });

  it('handles single name', () => {
    expect(normalizeClaytonName('BROWN')).toBe('Brown');
  });

  it('handles comma-separated format', () => {
    expect(normalizeClaytonName('DOE, JANE ANN')).toBe('Jane Ann Doe');
  });

  it('returns empty for empty input', () => {
    expect(normalizeClaytonName('')).toBe('');
  });
});

// -- Date parsing tests -----------------------------------------------------

describe('clayton parseIntakeDate', () => {
  it('parses MM/DD/YYYY HH:MM', () => {
    expect(parseIntakeDate('04/14/2026 08:30')).toBe('2026-04-14');
  });

  it('parses M/D/YYYY', () => {
    expect(parseIntakeDate('4/1/2026')).toBe('2026-04-01');
  });

  it('parses ISO date format', () => {
    expect(parseIntakeDate('2026-04-14')).toBe('2026-04-14');
  });

  it('returns null for unparseable input', () => {
    expect(parseIntakeDate('not a date')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseIntakeDate('')).toBeNull();
  });
});

// -- Docket number extraction tests -----------------------------------------

describe('clayton extractNumericDocket', () => {
  it('extracts digits from a numeric docket string', () => {
    expect(extractNumericDocket('2026001234')).toBe(2026001234);
  });

  it('strips non-numeric characters', () => {
    expect(extractNumericDocket('DKT-2026-001')).toBe(2026001);
  });

  it('falls back to hash for non-numeric docket', () => {
    const result = extractNumericDocket('ABCXYZ');
    expect(result).toBeGreaterThan(0);
    // Deterministic
    expect(result).toBe(extractNumericDocket('ABCXYZ'));
  });
});
