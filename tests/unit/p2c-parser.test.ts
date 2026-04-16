import { describe, it, expect } from 'vitest';
import { toFacts, hashCode, p2cSourceId, type P2CRecord } from '../../scripts/scrapers/p2c';

// Frozen sample from Coweta County /api/RecentArrests/145 (captured 2026-04-16).
// Real production payload, minus unused fields. Covers three canonical shapes:
//   1. single charge, apostrophe in middle name (D`LISA)
//   2. multi-charge record with sequence ordering
//   3. uppercase name needing title-case normalization
const COWETA_SAMPLE_RESPONSE = {
  RecentArrests: [
    {
      Id: 149272,
      FirstName: 'FABIAN',
      MiddleName: 'JA`SHUN',
      LastName: 'DUNLAP',
      Race: 'BLACK',
      Sex: 'MALE',
      ImageId: 'noimage',
      ArrestedDateTime: '0001-01-01T00:00:00+00:00',
      Charges: [
        { Sequence: 1, Description: 'DRIVING WHILE LICENSE SUSPENDED OR REVOKED' },
      ],
    },
    {
      Id: 149265,
      FirstName: 'D`LISA',
      MiddleName: 'RENEE',
      LastName: 'WHITE',
      ImageId: 'noimage',
      ArrestedDateTime: '0001-01-01T00:00:00+00:00',
      Charges: [
        { Sequence: 2, Description: 'RECKLESS DRIVING' },
        { Sequence: 1, Description: 'SPEEDING' },
      ],
    },
    {
      Id: 149264,
      FirstName: 'JOSHUA',
      MiddleName: 'TYRESE',
      LastName: 'CROUCH',
      ImageId: 'noimage',
      ArrestedDateTime: '0001-01-01T00:00:00+00:00',
      Charges: [{ Sequence: 1, Description: 'HOLD FOR OTHER AGENCY' }],
    },
  ],
  Total: 1295,
  ShowImages: false,
  ShowArrestedDate: false,
};

const COWETA_BASE = 'https://cowetacosoga.policetocitizen.com';

describe('p2c toFacts (Coweta sample)', () => {
  it('extracts name, charges, county, mugshot-absence from the first record', () => {
    const rec = COWETA_SAMPLE_RESPONSE.RecentArrests[0] as P2CRecord;
    const facts = toFacts(rec, 'Coweta', COWETA_BASE);
    expect(facts).not.toBeNull();
    expect(facts!.name).toBe("Fabian Ja`shun Dunlap");
    expect(facts!.county).toBe('Coweta');
    expect(facts!.charges).toEqual(['Driving While License Suspended Or Revoked']);
    expect(facts!.mugshotUrl).toBeUndefined();
    expect(facts!.sourceUrl).toBe(`${COWETA_BASE}/RecentArrests`);
  });

  it('orders multi-charge records by sequence and title-cases them', () => {
    const rec = COWETA_SAMPLE_RESPONSE.RecentArrests[1] as P2CRecord;
    const facts = toFacts(rec, 'Coweta', COWETA_BASE)!;
    expect(facts.charges).toEqual(['Speeding', 'Reckless Driving']);
  });

  it('falls back to today when ArrestedDateTime is the redacted 0001 epoch', () => {
    const rec = COWETA_SAMPLE_RESPONSE.RecentArrests[2] as P2CRecord;
    const facts = toFacts(rec, 'Coweta', COWETA_BASE)!;
    expect(facts.bookingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const yyyy = Number(facts.bookingDate.slice(0, 4));
    expect(yyyy).toBeGreaterThan(1970);
    expect(Date.parse(facts.publishedAt)).not.toBeNaN();
  });

  it('uses ArrestedDateTime when it is a real timestamp', () => {
    const rec: P2CRecord = {
      Id: 999,
      FirstName: 'Jane',
      LastName: 'Doe',
      ArrestedDateTime: '2026-04-15T14:22:00-04:00',
      Charges: [{ Sequence: 1, Description: 'DUI' }],
    };
    const facts = toFacts(rec, 'Coweta', COWETA_BASE)!;
    expect(facts.bookingDate).toBe('2026-04-15');
    expect(facts.publishedAt.startsWith('2026-04-15')).toBe(true);
  });

  it('builds a mugshot URL when ImageId is not "noimage"', () => {
    const rec: P2CRecord = {
      Id: 1,
      FirstName: 'Jane',
      LastName: 'Doe',
      ImageId: 'abc-123',
      ArrestedDateTime: '2026-04-15T14:22:00-04:00',
      Charges: [{ Sequence: 1, Description: 'DUI' }],
    };
    const facts = toFacts(rec, 'Coweta', COWETA_BASE)!;
    expect(facts.mugshotUrl).toBe(`${COWETA_BASE}/api/Inmate/Image/abc-123`);
  });

  it('returns null for records without a name', () => {
    const rec: P2CRecord = {
      Id: 2,
      Charges: [{ Sequence: 1, Description: 'DUI' }],
    };
    expect(toFacts(rec, 'Coweta', COWETA_BASE)).toBeNull();
  });
});

describe('p2c sourceId hashing', () => {
  it('is stable for identical inputs', () => {
    const a = p2cSourceId('Coweta', 'Jane Doe', '2026-04-15');
    const b = p2cSourceId('Coweta', 'Jane Doe', '2026-04-15');
    expect(a).toBe(b);
  });

  it('differs when any input changes', () => {
    const a = p2cSourceId('Coweta', 'Jane Doe', '2026-04-15');
    const b = p2cSourceId('Columbia', 'Jane Doe', '2026-04-15');
    const c = p2cSourceId('Coweta', 'Jane Doe', '2026-04-16');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('is prefixed by 10_000_000 to avoid Gazette WordPress ID collisions', () => {
    const id = p2cSourceId('Coweta', 'Jane Doe', '2026-04-15');
    expect(id).toBeGreaterThanOrEqual(10_000_000);
    expect(id).toBeLessThan(10_000_000 + 2 ** 31);
  });

  it('hashCode is non-negative and deterministic', () => {
    expect(hashCode('hello')).toBe(hashCode('hello'));
    expect(hashCode('hello')).toBeGreaterThanOrEqual(0);
  });
});
