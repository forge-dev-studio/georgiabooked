import type { APIRoute } from 'astro';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import { loadArrests } from '@lib/data';
import { SEVERITY_LABEL } from '@lib/severity';
import type { ArrestRecord } from '../../../scripts/merge.ts';

export async function getStaticPaths() {
  const arrests = loadArrests();
  return arrests.map((a) => ({ params: { slug: a.slug }, props: { arrest: a } }));
}

const fontPath = path.resolve('public/fraunces.ttf');
const fontData = fs.existsSync(fontPath) ? fs.readFileSync(fontPath) : null;

export const GET: APIRoute = async ({ props }) => {
  const arrest = (props as { arrest: ArrestRecord }).arrest;
  if (!fontData) {
    return new Response('Font missing', { status: 500 });
  }

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '1200px',
          height: '630px',
          background: '#0a1628',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px',
          fontFamily: 'Fraunces',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', color: '#94a3b8', fontSize: '22px', textTransform: 'uppercase', letterSpacing: '3px' },
              children: `${arrest.county} County, Georgia`,
            },
          },
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'column', gap: '20px' },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { color: '#f1f5f9', fontSize: '88px', fontWeight: 700, lineHeight: 1.05 },
                    children: arrest.name,
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { color: '#dc2626', fontSize: '32px', fontWeight: 600 },
                    children: `${SEVERITY_LABEL[arrest.severity]} . ${arrest.charges.length} charges`,
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { color: '#94a3b8', fontSize: '26px' },
                    children: `Booked ${arrest.bookingDate}`,
                  },
                },
              ],
            },
          },
          {
            type: 'div',
            props: {
              style: { display: 'flex', fontSize: '26px', color: '#fbbf24', fontWeight: 600 },
              children: 'GeorgiaBooked',
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [{ name: 'Fraunces', data: fontData, weight: 400, style: 'normal' }],
    }
  );

  const png = new Resvg(svg).render().asPng();
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
};
