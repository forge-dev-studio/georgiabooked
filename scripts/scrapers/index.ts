import type { ArrestFacts } from '../extract-facts.ts';
import { fetchP2CArrests } from './p2c.ts';
import { fetchGordonArrests } from './gordon-pdf.ts';
import { fetchPauldingArrests } from './paulding.ts';
import { fetchClaytonArrests } from './clayton.ts';

export interface ScraperSource {
  county: string;              // must match counties.ts name field
  source: string;              // human label for logs
  fetch: (limit?: number) => Promise<ArrestFacts[]>;
}

// Registered P2C agencies. Add new counties by appending an entry.
const P2C_AGENCIES: Array<{ county: string; baseUrl: string; agencyId: number }> = [
  {
    county: 'Columbia',
    baseUrl: 'https://columbiacountyso.policetocitizen.com',
    agencyId: 526,
  },
  {
    county: 'Coweta',
    baseUrl: 'https://cowetacosoga.policetocitizen.com',
    agencyId: 145,
  },
];

const p2cScrapers: ScraperSource[] = P2C_AGENCIES.map((cfg) => ({
  county: cfg.county,
  source: `P2C:${cfg.county}`,
  fetch: (limit?: number) => fetchP2CArrests(cfg.county, cfg.baseUrl, cfg.agencyId, { limit }),
}));

// Gordon County publishes daily PDF "Jail Media Reports" on the Gordon
// Gazette site. One PDF per day; `limit` here is interpreted as a hint --
// we pull the most-recent days up to a reasonable cap.
const gordonScraper: ScraperSource = {
  county: 'Gordon',
  source: 'PDF:Gordon',
  fetch: (limit?: number) => {
    // limit is records; bound PDFs by ceil(limit / 10) assuming ~10 inmates/day
    const approxPdfs = limit ? Math.min(Math.max(Math.ceil(limit / 10), 1), 30) : 7;
    return fetchGordonArrests({ maxDays: approxPdfs });
  },
};

// Paulding County -- Tyler NewWorld MVC inmate inquiry.
const pauldingScraper: ScraperSource = {
  county: 'Paulding',
  source: 'Tyler:Paulding',
  fetch: (limit?: number) => {
    const maxPages = limit ? Math.max(Math.ceil(limit / 20), 1) : 10;
    return fetchPauldingArrests({ maxPages });
  },
};

// Clayton County -- legacy CGI jail booking report.
const claytonScraper: ScraperSource = {
  county: 'Clayton',
  source: 'CGI:Clayton',
  fetch: (_limit?: number) => fetchClaytonArrests({ days: 14 }),
};

export const allScrapers: ScraperSource[] = [
  ...p2cScrapers,
  gordonScraper,
  pauldingScraper,
  claytonScraper,
];
