import { describe, it, expect } from 'vitest';
import {
  parseInmatesFromPage,
  normalizeName,
  normalizeCharges,
  parseIndexHtml,
  hashCode,
} from '../../scripts/scrapers/gordon-pdf';

// Frozen positioned-text sample captured 2026-04-16 from the real Gordon
// County "Jail Media Report" PDF dated 2026-04-14 (page 1, inmate block
// layout). The sample covers:
//   - 3 inmates per page
//   - "INMATE(S) CURRENTLY BOOKED" section header
//   - a single charge per inmate, plus one numeric-only bond line
// The tuple is { str, x, y } where x/y are the PDF user-space coordinates
// extracted via pdfjs-dist.
const PAGE_1_ITEMS = [
  // Section header (page top)
  { str: 'INMATE(S) CURRENTLY BOOKED', x: 26.2, y: 702.1 },
  // Inmate 1: CARROLL, KOLTON ALLEN (y anchor 678.2)
  { str: 'CARROLL, KOLTON ALLEN', x: 180.0, y: 678.2 },
  { str: 'Name', x: 148.5, y: 678.2 },
  { str: 'Inmate No.', x: 31.5, y: 678.2 },
  { str: '53139', x: 84.5, y: 678.2 },
  { str: 'Address', x: 31.7, y: 652.2 },
  { str: '189 JAMESON ST', x: 75.9, y: 650.4 },
  { str: 'CALHOUN, GA', x: 168.3, y: 650.4 },
  { str: '30701', x: 246.0, y: 650.4 },
  { str: 'Process Date / Time', x: 31.5, y: 634.5 },
  { str: '04/14/2026', x: 142.2, y: 636.0 },
  { str: '17:42', x: 205.2, y: 636.0 },
  { str: 'Arresting Officer', x: 32.0, y: 620.3 },
  { str: 'L. GORDY', x: 121.8, y: 620.2 },
  { str: 'Arrest Date / Time', x: 32.0, y: 580.3 },
  { str: '04/14/2026', x: 140.2, y: 580.6 },
  { str: '16:15', x: 210.2, y: 580.6 },
  { str: 'Charges', x: 34.1, y: 565.6 },
  { str: 'Cash Bond', x: 523.3, y: 565.6 },
  { str: 'Property Bond', x: 439.4, y: 565.6 },
  { str: 'THEFT BY DECEPTION', x: 33.5, y: 552.2 },

  // Inmate 2: ESTRADA, KRISTEN LEIGH (y anchor 511.2)
  { str: 'ESTRADA, KRISTEN LEIGH', x: 180.0, y: 511.2 },
  { str: 'Name', x: 148.5, y: 511.2 },
  { str: 'Inmate No.', x: 31.5, y: 511.2 },
  { str: '24870', x: 84.5, y: 511.2 },
  { str: 'Address', x: 31.7, y: 485.2 },
  { str: '80 TARPONS TRAIL', x: 75.9, y: 483.4 },
  { str: 'Process Date / Time', x: 31.5, y: 467.6 },
  { str: '04/14/2026', x: 142.2, y: 469.0 },
  { str: '15:20', x: 205.2, y: 469.0 },
  { str: 'Arresting Officer', x: 32.0, y: 453.3 },
  { str: 'L. GORDY', x: 121.8, y: 453.2 },
  { str: 'Arrest Date / Time', x: 32.0, y: 413.3 },
  { str: '04/14/2026', x: 140.2, y: 413.6 },
  { str: '15:00', x: 210.2, y: 413.6 },
  { str: 'Charges', x: 34.1, y: 398.7 },
  { str: 'PROBATION VIOLATION- TECHNICAL VIOLATION O/C: SALE OF METH', x: 33.5, y: 385.2 },
  { str: '*** NO BOND ***', x: 475.5, y: 384.9 },

  // Inmate 3: ETHERIDGE, ROBERT BRENT (y anchor 344.2)
  { str: 'ETHERIDGE, ROBERT BRENT', x: 180.0, y: 344.2 },
  { str: 'Name', x: 148.5, y: 344.3 },
  { str: 'Inmate No.', x: 31.5, y: 344.3 },
  { str: '35783', x: 84.5, y: 344.2 },
  { str: 'Address', x: 31.7, y: 318.2 },
  { str: '1438 N. HWY 41 ROOM 234', x: 75.9, y: 316.4 },
  { str: 'Process Date / Time', x: 31.5, y: 300.6 },
  { str: '04/14/2026', x: 142.2, y: 302.0 },
  { str: '23:08', x: 205.2, y: 302.0 },
  { str: 'Arresting Officer', x: 32.0, y: 286.3 },
  { str: 'C.J. WALKER', x: 121.8, y: 286.3 },
  { str: 'Arrest Date / Time', x: 32.0, y: 246.3 },
  { str: '04/14/2026', x: 140.2, y: 246.6 },
  { str: '22:26', x: 210.2, y: 246.6 },
  { str: 'Charges', x: 34.1, y: 231.7 },
  { str: 'PEDESTRIAN UNDER THE INFLUENCE', x: 33.5, y: 218.2 },
  { str: '$225.00', x: 543.3, y: 218.2 }, // bond amount, must not be a charge
  { str: '$450.00', x: 475.8, y: 218.2 },
];

// Frozen sample with the "INMATE(S) BOOKED & RELEASED" section header and
// a multi-charge inmate to verify multi-charge handling.
const PAGE_BOOKED_RELEASED_ITEMS = [
  { str: 'INMATE(S) BOOKED & RELEASED', x: 25.2, y: 698.6 },
  // Inmate: COLE, CHELSEA LOVE with 4 charges including the PASSENGE R VEHICLES split.
  { str: 'COLE, CHELSEA LOVE', x: 180.0, y: 680.9 },
  { str: 'Name', x: 148.5, y: 680.9 },
  { str: 'Inmate No.', x: 31.5, y: 680.9 },
  { str: '53140', x: 84.5, y: 680.9 },
  { str: 'Arrest Date / Time', x: 32.0, y: 584.6 },
  { str: '04/14/2026', x: 152.2, y: 586.0 },
  { str: 'Charges', x: 32.4, y: 571.0 },
  { str: 'DRIVING UNDER THE INFLUENCE', x: 32.4, y: 557.6 },
  { str: 'FOLLOWING TOO CLOSELY', x: 32.4, y: 542.0 },
  { str: 'MAXIMUM LIMITS', x: 32.4, y: 526.4 },
  { str: 'USE OF SAFTY BELTS IN PASSENGE R VEHICLES', x: 32.4, y: 510.8 },
  { str: '$900.00', x: 543.3, y: 557.6 },
];

describe('parseInmatesFromPage (currently-booked block)', () => {
  const inmates = parseInmatesFromPage(PAGE_1_ITEMS);

  it('parses all three inmate blocks on the page', () => {
    expect(inmates).toHaveLength(3);
  });

  it('normalizes the first inmate name and extracts charges', () => {
    const first = inmates[0];
    expect(first.name).toBe('Kolton Allen Carroll');
    expect(first.inmateNumber).toBe(53139);
    expect(first.bookingDate).toBe('2026-04-14');
    expect(first.charges).toEqual(['Theft By Deception']);
    expect(first.section).toBe('currently-booked');
  });

  it('assigns charges to the correct inmate block (middle of page)', () => {
    const second = inmates[1];
    expect(second.name).toBe('Kristen Leigh Estrada');
    expect(second.charges).toHaveLength(1);
    expect(second.charges[0]).toMatch(/Probation Violation/i);
    expect(second.charges[0]).toMatch(/Sale Of Meth/i);
  });

  it('does not treat bond amounts or NO BOND markers as charges', () => {
    const third = inmates[2];
    expect(third.name).toBe('Robert Brent Etheridge');
    expect(third.charges).toEqual(['Pedestrian Under The Influence']);
    expect(third.charges.some((c) => c.includes('$'))).toBe(false);
    expect(third.charges.some((c) => /NO BOND/i.test(c))).toBe(false);
  });

  it('builds a publishedAt ISO from arrest date and time', () => {
    const first = inmates[0];
    expect(first.publishedAt.startsWith('2026-04-14T16:15')).toBe(true);
  });
});

describe('parseInmatesFromPage (booked-released + multi-charge)', () => {
  const inmates = parseInmatesFromPage(PAGE_BOOKED_RELEASED_ITEMS);

  it('detects the booked-released section', () => {
    expect(inmates).toHaveLength(1);
    expect(inmates[0].section).toBe('booked-released');
  });

  it('captures all four charges and rejoins PDF-split word fragments', () => {
    const c = inmates[0].charges;
    expect(c).toContain('Driving Under The Influence');
    expect(c).toContain('Following Too Closely');
    expect(c).toContain('Maximum Limits');
    expect(c).toContain('Use Of Safty Belts In Passenger Vehicles');
    expect(c).toHaveLength(4);
  });
});

describe('normalizeName', () => {
  it('reorders LAST, FIRST MIDDLE to First Middle Last', () => {
    expect(normalizeName('CARROLL, KOLTON ALLEN')).toBe('Kolton Allen Carroll');
    expect(normalizeName('HAMILTON, DELMAR')).toBe('Delmar Hamilton');
  });

  it('handles multi-token first/middle names', () => {
    expect(normalizeName('HONG, ALVIN DOI CHIH')).toBe('Alvin Doi Chih Hong');
    expect(normalizeName('KNIGHT, ARIEANNA JAYLA MAY')).toBe('Arieanna Jayla May Knight');
  });

  it('properly cases McXxxx surnames', () => {
    expect(normalizeName('MCBEE, KYNA CHARISSE')).toBe('Kyna Charisse McBee');
    expect(normalizeName('MCNEESE, TYLER CARSON')).toBe('Tyler Carson McNeese');
  });

  it('returns title-cased input if no comma is present', () => {
    expect(normalizeName('JOHN SMITH')).toBe('John Smith');
  });

  it('absorbs Roman-numeral suffixes in their own comma slot', () => {
    expect(normalizeName('JACKSON, III, BERNARD MONTAY')).toBe('Bernard Montay Jackson III');
    expect(normalizeName('JACKSON, JR, BERNARD')).toBe('Bernard Jackson Jr');
    expect(normalizeName('SMITH, SR., JOHN')).toBe('John Smith Sr.');
  });
});

describe('normalizeCharges', () => {
  it('fixes the common OFFICERS/DEVICES split artifacts', () => {
    const out = normalizeCharges([
      'WILLFUL OBSTRUCTION OF LAW ENFORCEMENT O FFICERS',
      'OBEDIENCE TO TRAFFIC-CONTROL D EVICES',
    ]);
    expect(out[0]).toBe('Willful Obstruction Of Law Enforcement Officers');
    expect(out[1]).toBe('Obedience To Traffic-control Devices');
  });

  it('preserves the articles "A" and "I" as words', () => {
    const out = normalizeCharges([
      'FLEEING OR ATTEMPTING TO ELUDE A POLICE OFFICER',
      'HIJACKING A MOTOR VEHICLE',
    ]);
    expect(out[0]).toBe('Fleeing Or Attempting To Elude A Police Officer');
    expect(out[1]).toBe('Hijacking A Motor Vehicle');
  });

  it('fixes the specific PASSENGE R VEHICLES split', () => {
    const out = normalizeCharges(['USE OF SAFTY BELTS IN PASSENGE R VEHICLES']);
    expect(out[0]).toBe('Use Of Safty Belts In Passenger Vehicles');
  });

  it('keeps real duplicate charges (e.g. multiple counts)', () => {
    const out = normalizeCharges(['SEXUAL BATTERY', 'SEXUAL BATTERY']);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe('Sexual Battery');
    expect(out[1]).toBe('Sexual Battery');
  });
});

describe('parseIndexHtml', () => {
  it('pairs PDF URLs with date labels from Wix-rendered anchors', () => {
    const html =
      `<a href="/_files/ugd/4b5a67_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf">` +
      `<h1><span>Tuesday, April 14, 2026</span></h1></a>` +
      `<a href="/_files/ugd/4b5a67_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.pdf">` +
      `<h1><span>Monday, April 13, 2026</span></h1></a>` +
      `<a href="/_files/ugd/4b5a67_cccccccccccccccccccccccccccccccc.pdf">` +
      `<h1><span>Friday March 27, 2026</span></h1></a>`;
    const links = parseIndexHtml(html);
    expect(links).toHaveLength(3);
    // Sorted newest-first.
    expect(links[0].reportDate).toBe('2026-04-14');
    expect(links[0].url).toContain('aaaaaaaa');
    expect(links[1].reportDate).toBe('2026-04-13');
    expect(links[1].url).toContain('bbbbbbbb');
    // Handles date label without a comma after the day-of-week.
    expect(links[2].reportDate).toBe('2026-03-27');
    expect(links[2].url).toContain('cccccccc');
  });
});

describe('hashCode (Gordon scraper-local)', () => {
  it('is deterministic and non-negative', () => {
    expect(hashCode('x')).toBe(hashCode('x'));
    expect(hashCode('abc')).toBeGreaterThanOrEqual(0);
  });
});
