// src/lib/leads.ts — everything the admin "Leads" inbox needs.
import {
  distanceMiles,
  getEquipmentBySlug,
  getYardsInCity,
  getYardsStockingInState,
  type RentalYard,
} from './db';

export const STATUSES = ['new', 'routed', 'won', 'lost', 'spam'] as const;
export type LeadStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  routed: 'Sent to yard',
  won: 'Won (paid)',
  lost: 'Lost',
  spam: 'Spam',
};

export interface Lead {
  id: number;
  created_at: string;
  name: string;
  phone: string;
  email: string;
  delivery_zip: string;
  start_date: string;
  duration: string;
  equipment_slug: string;
  state: string;
  city_slug: string;
  yard_id: number | null; // yard the visitor clicked "Request Quote" / "Book" on
  page_url: string | null;
  status: LeadStatus;
  notes: string | null;
  sale_amount_usd: number | null;
  routed_to_yard_id: number | null;
  updated_at: string | null;
  // joined for display
  equipment_name: string | null;
  requested_yard_name: string | null;
  routed_yard_name: string | null;
}

let schemaReady = false;

/**
 * Adds the extra columns the admin needs to the existing `leads` table. Safe to call on every request:
 * it only changes the database the first time, so you never have to run a migration by hand.
 */
export async function ensureLeadSchema(db: D1Database): Promise<void> {
  if (schemaReady) return;
  const { results } = await db.prepare('PRAGMA table_info(leads)').all<{ name: string }>();
  if (results.length === 0) {
    throw new Error('The leads table does not exist yet. Run the database setup (db:migrate:remote) once.');
  }
  const have = new Set(results.map((r) => r.name));
  const wanted: Array<[string, string]> = [
    ['notes', 'TEXT'],
    ['sale_amount_usd', 'REAL'],
    ['routed_to_yard_id', 'INTEGER'],
    ['updated_at', 'TEXT'],
    ['consent_at', 'TEXT'], // when the visitor ticked the "contact me" consent box
  ];
  for (const [col, type] of wanted) {
    if (!have.has(col)) await db.prepare(`ALTER TABLE leads ADD COLUMN ${col} ${type}`).run();
  }
  schemaReady = true;
}

export async function countNewLeads(db: D1Database): Promise<number> {
  try {
    const r = await db.prepare("SELECT COUNT(*) AS n FROM leads WHERE status = 'new'").first<{ n: number }>();
    return r?.n ?? 0;
  } catch {
    return 0;
  }
}

export interface LeadStats {
  total: number;
  last7: number;
  byStatus: Record<string, number>;
  revenue: number;
}

export async function getLeadStats(db: D1Database): Promise<LeadStats> {
  const { results } = await db
    .prepare('SELECT status, COUNT(*) AS n, COALESCE(SUM(sale_amount_usd), 0) AS revenue FROM leads GROUP BY status')
    .all<{ status: string; n: number; revenue: number }>();
  const last7 = await db
    .prepare("SELECT COUNT(*) AS n FROM leads WHERE created_at >= datetime('now', '-7 days')")
    .first<{ n: number }>();
  const byStatus: Record<string, number> = {};
  let total = 0;
  let revenue = 0;
  for (const r of results) {
    byStatus[r.status] = r.n;
    total += r.n;
    revenue += r.revenue;
  }
  return { total, last7: last7?.n ?? 0, byStatus, revenue };
}

export const PAGE_SIZE = 25;

export async function listLeads(db: D1Database, status: string, page: number) {
  const filter = (STATUSES as readonly string[]).includes(status) ? status : '';
  const total =
    (await db
      .prepare('SELECT COUNT(*) AS n FROM leads WHERE (? = \'\' OR status = ?)')
      .bind(filter, filter)
      .first<{ n: number }>())?.n ?? 0;
  const { results } = await db
    .prepare(
      `SELECT l.*, e.name AS equipment_name, ry.name AS requested_yard_name, rt.name AS routed_yard_name
         FROM leads l
         LEFT JOIN equipment_types e ON e.slug = l.equipment_slug
         LEFT JOIN rental_yards ry   ON ry.id = l.yard_id
         LEFT JOIN rental_yards rt   ON rt.id = l.routed_to_yard_id
        WHERE (? = '' OR l.status = ?)
        ORDER BY l.id DESC
        LIMIT ? OFFSET ?`,
    )
    .bind(filter, filter, PAGE_SIZE, (Math.max(1, page) - 1) * PAGE_SIZE)
    .all<Lead>();
  return { leads: results, total, filter };
}

export interface UpdateLeadInput {
  id: number;
  status: string;
  notes: string;
  saleAmount: string;
  routedTo: string;
}

/** Validates and saves the admin's edits. Returns an error message, or null on success. */
export async function updateLead(db: D1Database, input: UpdateLeadInput): Promise<string | null> {
  if (!Number.isInteger(input.id)) return 'Unknown lead.';
  if (!(STATUSES as readonly string[]).includes(input.status)) return 'Unknown status.';
  const sale = input.saleAmount.trim() === '' ? null : Number(input.saleAmount.replace(/[$,\s]/g, ''));
  if (sale !== null && (!Number.isFinite(sale) || sale < 0 || sale > 1_000_000)) return 'Sale amount must be a positive number.';
  const routed = /^\d+$/.test(input.routedTo) ? Number(input.routedTo) : null;
  await db
    .prepare(
      `UPDATE leads SET status = ?, notes = ?, sale_amount_usd = ?, routed_to_yard_id = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .bind(input.status, input.notes.trim().slice(0, 2000) || null, sale, routed, input.id)
    .run();
  return null;
}

export interface MatchedYard {
  yard: RentalYard;
  miles: number | null; // null = inside the lead's city
}

/**
 * Yards that stock the requested machine: first those in the lead's city, then ones within 50 miles.
 * Partners come first in each group. This is who you could forward the lead to.
 */
export async function matchingYards(db: D1Database, lead: Lead): Promise<MatchedYard[]> {
  const equipment = await getEquipmentBySlug(db, lead.equipment_slug);
  if (!equipment) return [];
  const [stocking, cityYards] = await Promise.all([
    getYardsStockingInState(db, equipment.id, lead.state),
    getYardsInCity(db, lead.state, lead.city_slug),
  ]);
  const local = stocking.filter((y) => y.city.toLowerCase().replace(/ /g, '-') === lead.city_slug);
  const coords = cityYards.filter((y) => y.latitude != null && y.longitude != null);
  const centre = coords.length
    ? {
        lat: coords.reduce((s, y) => s + y.latitude!, 0) / coords.length,
        lon: coords.reduce((s, y) => s + y.longitude!, 0) / coords.length,
      }
    : null;
  const nearby: MatchedYard[] = centre
    ? stocking
        .filter((y) => !local.includes(y) && y.latitude != null && y.longitude != null)
        .map((y) => ({ yard: y, miles: distanceMiles(centre.lat, centre.lon, y.latitude!, y.longitude!) }))
        .filter((m) => (m.miles as number) <= 50)
        .sort((a, b) => b.yard.is_partner - a.yard.is_partner || (a.miles as number) - (b.miles as number))
        .slice(0, 8)
    : [];
  return [...local.map((yard) => ({ yard, miles: null })), ...nearby];
}

/** Plain-text summary of a lead, for pasting into an email, WhatsApp or SMS. */
export function leadSummary(lead: Lead, cityName: string): string {
  return [
    `New equipment rental request — ${lead.equipment_name ?? lead.equipment_slug}`,
    `Location: ${cityName}, ${lead.state}  (delivery ZIP ${lead.delivery_zip})`,
    `Start date: ${lead.start_date}`,
    `Duration: ${lead.duration}`,
    `Customer: ${lead.name}`,
    `Phone: ${lead.phone}`,
    `Email: ${lead.email}`,
  ].join('\n');
}
