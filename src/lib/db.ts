// src/lib/db.ts
// All D1 queries live here so pages stay declarative and the SQL is easy to audit.
// Every query is parameterised (.bind) — never interpolate URL params into SQL.

export interface EquipmentType {
  id: number;
  name: string;
  slug: string;
  category: string;
  avg_daily_rate_usd: number | null;
  description: string | null;
}

export interface RentalYard {
  id: number;
  name: string;
  slug: string;
  address: string | null;
  city: string;
  state: string;
  zip_code: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  is_partner: number; // SQLite has no real boolean: 0 | 1
}

/**
 * The schema stores the human city name ("Round Rock"); URLs use a slug ("round-rock").
 * This expression is also used by the index in migrations/0001_init.sql — keep them identical.
 */
export const CITY_SLUG_SQL = "lower(replace(y.city, ' ', '-'))";

/** Fetch one equipment type by URL slug, e.g. "skid-steer-rental". */
export async function getEquipmentBySlug(db: D1Database, slug: string) {
  return db.prepare('SELECT * FROM equipment_types WHERE slug = ?').bind(slug).first<EquipmentType>();
}

export async function getAllEquipment(db: D1Database) {
  const { results } = await db.prepare('SELECT * FROM equipment_types ORDER BY category, name').all<EquipmentType>();
  return results;
}

/** All yards (any inventory) located in a given city. Used to confirm the city exists + find its centroid. */
export async function getYardsInCity(db: D1Database, stateCode: string, citySlug: string) {
  const { results } = await db
    .prepare(`SELECT y.* FROM rental_yards y WHERE y.state = ? AND ${CITY_SLUG_SQL} = ?`)
    .bind(stateCode, citySlug)
    .all<RentalYard>();
  return results;
}

/**
 * Every yard in the state that stocks a given machine. The caller splits these into
 * "in this city" vs "nearby" (distance-filtered) in JS — one query, no N+1.
 * Partners sort first so premium placement survives any later re-sorting by distance ties.
 */
export async function getYardsStockingInState(db: D1Database, equipmentId: number, stateCode: string) {
  const { results } = await db
    .prepare(
      `SELECT y.* FROM rental_yards y
         JOIN yard_inventory yi ON yi.yard_id = y.id
        WHERE yi.equipment_id = ? AND y.state = ?
        ORDER BY y.is_partner DESC, y.name ASC`,
    )
    .bind(equipmentId, stateCode)
    .all<RentalYard>();
  return results;
}

/** Equipment types available in a city, with the number of local yards stocking each. */
export async function getEquipmentInCity(db: D1Database, stateCode: string, citySlug: string) {
  const { results } = await db
    .prepare(
      `SELECT e.*, COUNT(DISTINCT y.id) AS yard_count
         FROM equipment_types e
         JOIN yard_inventory yi ON yi.equipment_id = e.id
         JOIN rental_yards y    ON y.id = yi.yard_id
        WHERE y.state = ? AND ${CITY_SLUG_SQL} = ?
        GROUP BY e.id
        ORDER BY e.category, e.name`,
    )
    .bind(stateCode, citySlug)
    .all<EquipmentType & { yard_count: number }>();
  return results;
}

/** Cities in a state with yard counts, biggest first. */
export async function getCitiesInState(db: D1Database, stateCode: string) {
  const { results } = await db
    .prepare(
      `SELECT y.city AS city, ${CITY_SLUG_SQL} AS slug, COUNT(*) AS yard_count
         FROM rental_yards y
        WHERE y.state = ?
        GROUP BY slug
        ORDER BY yard_count DESC, city ASC`,
    )
    .bind(stateCode)
    .all<{ city: string; slug: string; yard_count: number }>();
  return results;
}

/** Equipment types stocked anywhere in a state, ranked by number of yards. */
export async function getEquipmentInState(db: D1Database, stateCode: string) {
  const { results } = await db
    .prepare(
      `SELECT e.*, COUNT(DISTINCT y.id) AS yard_count
         FROM equipment_types e
         JOIN yard_inventory yi ON yi.equipment_id = e.id
         JOIN rental_yards y    ON y.id = yi.yard_id
        WHERE y.state = ?
        GROUP BY e.id
        ORDER BY yard_count DESC, e.name`,
    )
    .bind(stateCode)
    .all<EquipmentType & { yard_count: number }>();
  return results;
}

/** States that have at least one yard, with counts — powers the homepage state index. */
export async function getStatesWithYards(db: D1Database) {
  const { results } = await db
    .prepare('SELECT state, COUNT(*) AS yard_count FROM rental_yards GROUP BY state ORDER BY state')
    .all<{ state: string; yard_count: number }>();
  return results;
}

export interface LeadInput {
  name: string;
  phone: string;
  email: string;
  delivery_zip: string;
  start_date: string;
  duration: string;
  equipment_slug: string;
  state: string;
  city_slug: string;
  yard_id: number | null;
  page_url: string | null;
}

export async function insertLead(db: D1Database, l: LeadInput) {
  return db
    .prepare(
      `INSERT INTO leads (name, phone, email, delivery_zip, start_date, duration,
                          equipment_slug, state, city_slug, yard_id, page_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(l.name, l.phone, l.email, l.delivery_zip, l.start_date, l.duration,
          l.equipment_slug, l.state, l.city_slug, l.yard_id, l.page_url)
    .run();
}

/** Great-circle distance in miles (haversine). Used to find "nearby" yards in adjacent cities. */
export function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
