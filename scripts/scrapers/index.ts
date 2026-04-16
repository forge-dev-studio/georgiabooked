import type { ArrestFacts } from '../extract-facts.ts';
import { fetchP2CArrests } from './p2c.ts';

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

export const allScrapers: ScraperSource[] = P2C_AGENCIES.map((cfg) => ({
  county: cfg.county,
  source: `P2C:${cfg.county}`,
  fetch: (limit?: number) => fetchP2CArrests(cfg.county, cfg.baseUrl, cfg.agencyId, { limit }),
}));
