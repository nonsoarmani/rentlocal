// src/lib/yard-import.ts
// Turns an uploaded CSV into rental_yards rows + yard_inventory links in D1.
//
// CSV columns (header names are matched loosely, order does not matter):
//   REQUIRED:  name, city, state            (state may be "TX" or "Texas")
//   OPTIONAL:  address, zip, phone, email, website, latitude, longitude,
//              equipment (machines the yard stocks, e.g. "Skid Steer; Boom Lift"),
//              partner (yes/no — marks a paying partner)
//
// Re-uploading is safe: a yard is identified by state + name + city. Existing yards are updated
// (blank cells never erase existing data); new ones are added.

import { parseCsv } from './csv';
import { slugify, stateFromCode, stateFromSlug } from './us-states';
import type { EquipmentType } from './db';

export const MAX_ROWS = 1000;

const ALIASES: Record<string, string[]> = {
  name: ['name', 'yard name', 'yard', 'company', 'company name', 'business', 'business name'],
  address: ['address', 'street', 'street address', 'address 1'],
  city: ['city', 'town'],
  state: ['state', 'st', 'state code', 'region'],
  zip: ['zip', 'zip code', 'postal code', 'postcode'],
  phone: ['phone', 'phone number', 'telephone', 'tel'],
  email: ['email', 'e mail'],
  website: ['website', 'url', 'web', 'site'],
  latitude: ['latitude', 'lat'],
  longitude: ['longitude', 'lon', 'lng', 'long'],
  equipment: ['equipment', 'machines', 'equipment types', 'inventory', 'stocks', 'machinery'],
  partner: ['partner', 'is partner', 'premium'],
};

export interface ParsedYard {
  row: number; // spreadsheet row number (header = 1)
  name: string;
  slug: string;
  address: string | null;
  city: string;
  state: string; // 2-letter
  zip: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  lat: number | null;
  lon: number | null;
  partner: boolean;
  equipmentTokens: string[];
}

export interface ParseResult {
  yards: ParsedYard[];
  problems: string[]; // rows that were skipped or fixed, in plain English
  hasPartnerColumn: boolean;
  hasEquipmentColumn: boolean;
  fatal?: string; // set when the file cannot be used at all
}

const headerKey = (h: string) => h.toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();

function tidyPhone(raw: string): string | null {
  const first = raw.split(/[;,/]/)[0];
  const d = first.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (!first.trim()) return null;
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : first.trim();
}

const tidyWebsite = (raw: string): string | null => {
  const w = raw.trim();
  if (!w) return null;
  return /^https?:\/\//i.test(w) ? w : `https://${w}`;
};

export function parseYardCsv(text: string): ParseResult {
  const empty = { yards: [], problems: [], hasPartnerColumn: false, hasEquipmentColumn: false };
  const rows = parseCsv(text);
  if (rows.length < 2) return { ...empty, fatal: 'The file is empty or has only a header row.' };

  // Map column name -> column index
  const cols: Record<string, number> = {};
  rows[0].forEach((h, i) => {
    const key = headerKey(h);
    for (const [field, names] of Object.entries(ALIASES)) {
      if (names.includes(key) && cols[field] === undefined) cols[field] = i;
    }
  });
  const missing = ['name', 'city', 'state'].filter((f) => cols[f] === undefined);
  if (missing.length) {
    return {
      ...empty,
      fatal: `The first row must contain these column headings: ${missing.join(', ')}. Download the template to see the right layout.`,
    };
  }
  if (rows.length - 1 > MAX_ROWS) {
    return { ...empty, fatal: `That file has ${rows.length - 1} rows. Please upload at most ${MAX_ROWS} at a time.` };
  }

  const cell = (r: string[], f: string) => (cols[f] === undefined ? '' : (r[cols[f]] ?? '').trim());
  const problems: string[] = [];
  const bySlug = new Map<string, ParsedYard>(); // de-duplicate rows inside the file (last one wins)

  rows.slice(1).forEach((r, idx) => {
    const rowNo = idx + 2;
    const name = cell(r, 'name');
    const city = cell(r, 'city');
    const stateRaw = cell(r, 'state');
    if (!name || !city || !stateRaw) {
      problems.push(`Row ${rowNo}: skipped — name, city and state are all required.`);
      return;
    }
    const st = stateFromCode(stateRaw) ?? stateFromSlug(slugify(stateRaw));
    if (!st) {
      problems.push(`Row ${rowNo} (${name}): skipped — "${stateRaw}" is not a US state.`);
      return;
    }
    const latRaw = cell(r, 'latitude'), lonRaw = cell(r, 'longitude');
    let lat = latRaw ? Number(latRaw) : null;
    let lon = lonRaw ? Number(lonRaw) : null;
    if ((lat !== null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) || (lon !== null && (!Number.isFinite(lon) || Math.abs(lon) > 180))) {
      problems.push(`Row ${rowNo} (${name}): latitude/longitude ignored — not valid numbers.`);
      lat = lon = null;
    }
    let email: string | null = cell(r, 'email') || null;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      problems.push(`Row ${rowNo} (${name}): email ignored — "${email}" does not look valid.`);
      email = null;
    }
    const partnerRaw = cell(r, 'partner').toLowerCase();
    const slug = slugify(`${name} ${city}`);
    const key = `${st.code}/${slug}`;
    const prev = bySlug.get(key);
    const next: ParsedYard = {
      row: rowNo,
      name,
      slug,
      address: cell(r, 'address') || null,
      city,
      state: st.code,
      zip: cell(r, 'zip').replace(/\D/g, '').slice(0, 5),
      phone: tidyPhone(cell(r, 'phone')),
      email,
      website: tidyWebsite(cell(r, 'website')),
      lat,
      lon,
      partner: ['yes', 'y', 'true', '1', 'partner'].includes(partnerRaw),
      equipmentTokens: cell(r, 'equipment').split(/[;|/,]/).map((t) => t.trim()).filter(Boolean),
    };
    if (prev) {
      // Same yard listed twice in the file: merge the rows (later non-empty cells win, nothing is lost).
      problems.push(`Rows ${prev.row} and ${rowNo} are the same yard (${name}, ${city}) — merged into one.`);
      next.address = next.address ?? prev.address;
      next.zip = next.zip || prev.zip;
      next.phone = next.phone ?? prev.phone;
      next.email = next.email ?? prev.email;
      next.website = next.website ?? prev.website;
      next.lat = next.lat ?? prev.lat;
      next.lon = next.lon ?? prev.lon;
      next.partner = next.partner || prev.partner;
      next.equipmentTokens = [...new Set([...prev.equipmentTokens, ...next.equipmentTokens])];
    }
    bySlug.set(key, next);
  });

  return {
    yards: [...bySlug.values()],
    problems,
    hasPartnerColumn: cols.partner !== undefined,
    hasEquipmentColumn: cols.equipment !== undefined,
  };
}

/** Match typed machine names ("Skid Steer", "skid-steer-rental", "Boom Lifts") to equipment_types slugs. */
export function buildEquipmentMatcher(types: EquipmentType[]) {
  const lookup = new Map<string, string>();
  const norm = (s: string) => slugify(s).replace(/-rentals?$/, '').replace(/s$/, '');
  for (const t of types) {
    lookup.set(norm(t.slug), t.slug);
    lookup.set(norm(t.name), t.slug);
  }
  return (token: string): string | undefined => lookup.get(norm(token));
}

export interface ImportSummary {
  added: number;
  updated: number;
  linked: number; // yards that got at least one machine link
  problems: string[];
  failed?: string;
}

const CHUNK = 40; // statements per D1 batch

export async function importYards(
  db: D1Database,
  parsed: ParseResult,
  equipmentTypes: EquipmentType[],
  defaultEquipmentSlugs: string[],
): Promise<ImportSummary> {
  const problems = [...parsed.problems];
  const match = buildEquipmentMatcher(equipmentTypes);

  // Which yards already exist? (to report "added" vs "updated")
  const states = [...new Set(parsed.yards.map((y) => y.state))];
  const existing = new Set<string>();
  if (states.length) {
    const { results } = await db
      .prepare(`SELECT state, slug FROM rental_yards WHERE state IN (${states.map(() => '?').join(',')})`)
      .bind(...states)
      .all<{ state: string; slug: string }>();
    for (const r of results) existing.add(`${r.state}/${r.slug}`);
  }

  const upsert = `INSERT INTO rental_yards (name, slug, address, city, state, zip_code, phone, email, website, latitude, longitude, is_partner)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(state, slug) DO UPDATE SET
      name = excluded.name,
      city = excluded.city,
      address   = COALESCE(excluded.address,   rental_yards.address),
      zip_code  = CASE WHEN excluded.zip_code <> '' THEN excluded.zip_code ELSE rental_yards.zip_code END,
      phone     = COALESCE(excluded.phone,     rental_yards.phone),
      email     = COALESCE(excluded.email,     rental_yards.email),
      website   = COALESCE(excluded.website,   rental_yards.website),
      latitude  = COALESCE(excluded.latitude,  rental_yards.latitude),
      longitude = COALESCE(excluded.longitude, rental_yards.longitude)
      ${parsed.hasPartnerColumn ? ', is_partner = excluded.is_partner' : ''}`;

  const statements: D1PreparedStatement[] = [];
  let linked = 0;
  let added = 0;
  let updated = 0;

  for (const y of parsed.yards) {
    statements.push(
      db.prepare(upsert).bind(y.name, y.slug, y.address, y.city, y.state, y.zip, y.phone, y.email, y.website, y.lat, y.lon, y.partner ? 1 : 0),
    );
    existing.has(`${y.state}/${y.slug}`) ? updated++ : added++;

    // Machines: the ones listed in this row, else the form's default selection
    let slugs: string[] = [];
    for (const token of y.equipmentTokens) {
      const s = match(token);
      if (s) slugs.push(s);
      else problems.push(`Row ${y.row} (${y.name}): machine "${token}" was not recognised and was not linked.`);
    }
    if (!y.equipmentTokens.length) slugs = defaultEquipmentSlugs;
    slugs = [...new Set(slugs)];
    if (slugs.length) {
      linked++;
      statements.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO yard_inventory (yard_id, equipment_id)
             SELECT y.id, e.id FROM rental_yards y, equipment_types e
              WHERE y.state = ? AND y.slug = ? AND e.slug IN (${slugs.map(() => '?').join(',')})`,
          )
          .bind(y.state, y.slug, ...slugs),
      );
    }
  }

  try {
    for (let i = 0; i < statements.length; i += CHUNK) {
      await db.batch(statements.slice(i, i + CHUNK));
    }
  } catch (e) {
    console.error('yard import failed', e);
    return { added: 0, updated: 0, linked: 0, problems, failed: 'The database refused part of the upload. Some yards may have been saved; upload the same file again to finish.' };
  }
  return { added, updated, linked, problems };
}
