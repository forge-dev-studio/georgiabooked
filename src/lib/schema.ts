import type { ArrestRecord } from '../../scripts/merge.ts';

export function newsArticleSchema(record: ArrestRecord, baseUrl: string): object {
  const url = `${baseUrl}/arrests/${record.slug}/`;
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: `${record.name} booked in ${record.county} County on ${record.bookingDate}`,
    datePublished: record.publishedAt,
    dateModified: record.publishedAt,
    author: { '@type': 'Organization', name: 'GeorgiaBooked' },
    publisher: {
      '@type': 'Organization',
      name: 'GeorgiaBooked',
      logo: { '@type': 'ImageObject', url: `${baseUrl}/logo.svg` },
    },
    image: record.mugshotUrl ?? `${baseUrl}/og/${record.slug}.png`,
    articleSection: `${record.county} County arrests`,
    mainEntityOfPage: url,
    url,
  };
}

export function breadcrumbSchema(items: { name: string; url: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function websiteSchema(baseUrl: string): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'GeorgiaBooked',
    url: baseUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${baseUrl}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}
