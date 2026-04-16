import slugify from 'slugify';

export interface ArrestSlugInput {
  name: string;
  county: string;
  bookingDate: string;
}

export function arrestSlug(input: ArrestSlugInput, collisionIndex = 1): string {
  const namePart = slugify(input.name, { lower: true, strict: true, trim: true });
  const countyPart = slugify(`${input.county} County`, { lower: true, strict: true, trim: true });
  const base = `${namePart}-${countyPart}-${input.bookingDate}`;
  return collisionIndex > 1 ? `${base}-${collisionIndex}` : base;
}
