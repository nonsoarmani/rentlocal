// src/lib/sitemap.ts — builds the list of every indexable URL straight from the database.
// Lists every page that exists: each state and city we cover, and every machine page for those cities.
import { US_STATES, slugify, stateFromCode } from './us-states';

export const URLS_PER_SITEMAP = 10000; // Google's limit is 50,000; smaller files are quicker to fetch

export async function buildUrlList(db: D1Database): Promise<string[]> {
  const seg = encodeURIComponent;
  const [cities, combos] = await Promise.all([
    db
      .prepare("SELECT DISTINCT state, lower(replace(city, ' ', '-')) AS city FROM rental_yards ORDER BY state, city")
      .all<{ state: string; city: string }>(),
    db
      .prepare(
        `SELECT c.state AS state, c.city AS city, e.slug AS equipment
           FROM (SELECT DISTINCT state, lower(replace(city, ' ', '-')) AS city FROM rental_yards) c
           CROSS JOIN equipment_types e
          ORDER BY c.state, c.city, e.slug`,
      )
      .all<{ state: string; city: string; equipment: string }>(),
  ]);

  const urls: string[] = ['/'];
  for (const [, name] of US_STATES) urls.push(`/rentals/${slugify(name)}`); // every state page exists
  for (const { state, city } of cities.results) {
    const st = stateFromCode(state);
    if (st) urls.push(`/rentals/${st.slug}/${seg(city)}`);
  }
  for (const { state, city, equipment } of combos.results) {
    const st = stateFromCode(state);
    if (st) urls.push(`/rentals/${st.slug}/${seg(city)}/${equipment}`);
  }
  return urls;
}

export const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
