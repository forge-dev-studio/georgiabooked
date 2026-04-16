// Run once manually to regenerate public/ga-counties.svg with accurate paths.
// Usage: npx tsx scripts/build-ga-svg.ts
import fs from 'node:fs';
import path from 'node:path';
import { feature } from 'topojson-client';
import { geoPath, geoAlbersUsa } from 'd3-geo';

const COUNTIES_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json';
const GA_FIPS = '13';
const WIDTH = 400;
const HEIGHT = 500;

async function main() {
  const res = await fetch(COUNTIES_URL);
  if (!res.ok) throw new Error(`topojson fetch failed: ${res.status}`);
  const topology = (await res.json()) as any;

  const gaGeometries = topology.objects.counties.geometries.filter((g: any) =>
    String(g.id).startsWith(GA_FIPS)
  );

  const fc = feature(topology, {
    type: 'GeometryCollection',
    geometries: gaGeometries,
  } as any) as any;

  const projection = geoAlbersUsa().fitSize([WIDTH, HEIGHT], fc);
  const pathGen = geoPath(projection);

  const pathEls = fc.features
    .map((f: any) => {
      const name = f.properties.name as string;
      const slug = name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      const d = pathGen(f);
      if (!d) return '';
      return `<path id="county-${slug}" d="${d}" fill="#1a2a3f" stroke="#0a1628" stroke-width="0.5"><title>${name} County</title></path>`;
    })
    .filter(Boolean)
    .join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" class="w-full h-auto">
  <title>Georgia Counties</title>
  <g id="counties">
${pathEls}
  </g>
</svg>`;

  const outPath = path.join('public', 'ga-counties.svg');
  fs.writeFileSync(outPath, svg);
  console.log(`wrote ${outPath} with ${fc.features.length} counties`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
