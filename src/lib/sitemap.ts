// src/lib/sitemap.ts — builds the list of every indexable URL straight from the database.
// Only pages that really exist are listed (a state with yards, a city with yards, a machine that a
// yard in that city stocks), so Google is never sent to an empty page.
import { stateFromCode } from './us-states';

export const URLS_PER_SITEMAP = 10000; // Google's limit is 50,000; smaller files are quicker to fetch

export async function buildUrlList(db: D1Database): Promise<string[]> {
  const seg = encodeURIComponent;
  const [states, cities, combos] = await Promise.all([
    db.prepare('SELECT DISTINCT state FROM rental_yards ORDER BY state').all<{ state: string }>(),
    db
      .prepare("SELECT DISTINCT state, lower(replace(city, ' ', '-')) AS city FROM rental_yards ORDER BY state, city")
      .all<{ state: string; city: string }>(),
    db
      .prepare(
        `SELECT DISTINCT y.state AS state, lower(replace(y.city, ' ', '-')) AS city, e.slug AS equipment
           FROM yard_inventory yi
           JOIN rental_yards y    ON y.id = yi.yard_id
           JOIN equipment_types e ON e.id = yi.equipment_id
          ORDER BY y.state, city, e.slug`,
      )
      .all<{ state: string; city: string; equipment: string }>(),
  ]);

  const urls: string[] = ['/'];
  for (const { state } of states.results) {
    const st = stateFromCode(state);
    if (st) urls.push(`/rentals/${st.slug}`);
  }
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
