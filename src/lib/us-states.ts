// src/lib/us-states.ts
// URL slug <-> 2-letter code <-> display name helpers. The DB stores the 2-letter code.

export const US_STATES: ReadonlyArray<readonly [code: string, name: string]> = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
  ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['FL', 'Florida'], ['GA', 'Georgia'],
  ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
  ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'],
  ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
  ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'],
  ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
  ['DC', 'District of Columbia'],
];

export const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const stateSlug = (name: string): string => slugify(name);

const BY_SLUG = new Map(US_STATES.map(([code, name]) => [slugify(name), { code, name }]));
const BY_CODE = new Map(US_STATES.map(([code, name]) => [code, { code, name, slug: slugify(name) }]));

/** "texas" -> { code: "TX", name: "Texas" } (undefined if not a real state slug) */
export const stateFromSlug = (slug: string) => BY_SLUG.get(slug);

/** "TX" -> { code, name, slug } */
export const stateFromCode = (code: string) => BY_CODE.get(code.toUpperCase());

/** Turn a city slug back into a display name when we have no DB row, e.g. "round-rock" -> "Round Rock" */
export const titleCaseSlug = (slug: string): string =>
  slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
