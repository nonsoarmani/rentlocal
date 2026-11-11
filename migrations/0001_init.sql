-- migrations/0001_init.sql
-- Cloudflare D1 (SQLite dialect). Apply with: npm run db:migrate:local  /  db:migrate:remote
--
-- NOTE: All yard names, addresses and phone numbers below are MOCK data (555-01xx numbers
-- are reserved for fiction). Replace with real scraped / partner data before launch.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- 1. EQUIPMENT TYPES (the static catalogue)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equipment_types (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT NOT NULL,           -- e.g. "Mini Excavator"
    slug               TEXT UNIQUE NOT NULL,    -- e.g. "mini-excavator-rental"
    category           TEXT NOT NULL,           -- "Earthmoving", "Material Handling", "Lifts"
    avg_daily_rate_usd REAL,                    -- drives the programmatic price range text
    description        TEXT                     -- base description for the machine type
);

-- ---------------------------------------------------------------------------
-- 2. RENTAL YARDS (the local providers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rental_yards (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL,
    address    TEXT,
    city       TEXT NOT NULL,
    state      TEXT NOT NULL,                   -- 2-letter code, e.g. "TX"
    zip_code   TEXT NOT NULL,
    phone      TEXT,
    email      TEXT,
    website    TEXT,
    latitude   REAL,
    longitude  REAL,
    is_partner BOOLEAN DEFAULT 0                -- 0 = scraped/free, 1 = premium lead-gen customer
);

-- ---------------------------------------------------------------------------
-- 3. INVENTORY LINK (many-to-many: which yard stocks which machine)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS yard_inventory (
    yard_id      INTEGER,
    equipment_id INTEGER,
    PRIMARY KEY (yard_id, equipment_id),
    FOREIGN KEY (yard_id)      REFERENCES rental_yards(id),
    FOREIGN KEY (equipment_id) REFERENCES equipment_types(id)
);

-- ---------------------------------------------------------------------------
-- 4. LEADS (added beyond the three core tables — the lead form needs somewhere to land)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    name           TEXT NOT NULL,
    phone          TEXT NOT NULL,
    email          TEXT NOT NULL,
    delivery_zip   TEXT NOT NULL,
    start_date     TEXT NOT NULL,
    duration       TEXT NOT NULL,
    equipment_slug TEXT NOT NULL,
    state          TEXT NOT NULL,
    city_slug      TEXT NOT NULL,
    yard_id        INTEGER,                      -- yard the visitor clicked "Request Quote" on, if any
    page_url       TEXT,
    status         TEXT NOT NULL DEFAULT 'new',  -- new | routed | won | lost | spam
    FOREIGN KEY (yard_id) REFERENCES rental_yards(id)
);

-- ---------------------------------------------------------------------------
-- Indexes for the hot read paths
-- ---------------------------------------------------------------------------
-- City hubs/pages look yards up by state + a slugified city name. The expression below MUST
-- match the expression used in src/lib/db.ts (CITY_SLUG_SQL) for SQLite to use the index.
CREATE INDEX IF NOT EXISTS idx_yards_state_cityslug
    ON rental_yards (state, lower(replace(city, ' ', '-')));
CREATE INDEX IF NOT EXISTS idx_inventory_equipment ON yard_inventory (equipment_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_yards_state_slug ON rental_yards (state, slug);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status, created_at);

-- ---------------------------------------------------------------------------
-- MOCK DATA: 3 equipment types
-- ---------------------------------------------------------------------------
INSERT INTO equipment_types (name, slug, category, avg_daily_rate_usd, description) VALUES
('Skid Steer', 'skid-steer-rental', 'Earthmoving', 325,
 'A skid steer loader is a compact, maneuverable machine used for grading, loading, trenching and material handling on tight job sites. Interchangeable attachments such as buckets, pallet forks, augers and brush cutters make it one of the most versatile machines on a construction or landscaping project.'),
('Mini Excavator', 'mini-excavator-rental', 'Earthmoving', 385,
 'A mini excavator is a compact tracked digger ideal for trenching, foundation work, utility installation and demolition in tight or residential spaces. Its zero or reduced tail swing and low ground pressure let it work close to structures without tearing up lawns or driveways.'),
('Boom Lift', 'boom-lift-rental', 'Lifts', 290,
 'A boom lift is a mobile aerial work platform that lets crews reach high or hard-to-access areas for construction, maintenance, painting, signage and electrical work. Articulating and telescopic models offer different reach and outreach options for working around obstacles.');

-- ---------------------------------------------------------------------------
-- MOCK DATA: 5 rental yards (3 in Austin, 2 in Round Rock) — 2 are partners
-- ---------------------------------------------------------------------------
INSERT INTO rental_yards (name, slug, address, city, state, zip_code, phone, email, website, latitude, longitude, is_partner) VALUES
('Lone Star Equipment Rentals',  'lone-star-equipment-rentals',  '1200 E Ben White Blvd', 'Austin',     'TX', '78741', '(512) 555-0101', 'rentals@lonestar-equipment.example',   'https://lonestar-equipment.example',   30.2210, -97.7260, 1),
('Capital City Tool & Equipment','capital-city-tool-equipment',  '4400 N Lamar Blvd',     'Austin',     'TX', '78756', '(512) 555-0102', 'info@capitalcitytool.example',         'https://capitalcitytool.example',      30.3128, -97.7403, 0),
('Hill Country Heavy Rentals',   'hill-country-heavy-rentals',   '9800 Burnet Rd',        'Austin',     'TX', '78758', '(512) 555-0103', 'office@hillcountryheavy.example',      NULL,                                   30.3790, -97.7160, 0),
('Round Rock Equipment Co.',     'round-rock-equipment-co',      '2100 N IH-35',          'Round Rock', 'TX', '78681', '(512) 555-0104', 'sales@rrequipment.example',            'https://rrequipment.example',          30.5360, -97.6870, 1),
('Brushy Creek Machinery',       'brushy-creek-machinery',       '650 Sam Bass Rd',       'Round Rock', 'TX', '78681', '(512) 555-0105', 'rent@brushycreekmachinery.example',     NULL,                                   30.5120, -97.6560, 0);

-- ---------------------------------------------------------------------------
-- MOCK DATA: inventory (ids: equipment 1=Skid Steer 2=Mini Excavator 3=Boom Lift)
-- ---------------------------------------------------------------------------
INSERT INTO yard_inventory (yard_id, equipment_id) VALUES
(1, 1), (1, 2), (1, 3),   -- Lone Star (partner): everything
(2, 1), (2, 3),           -- Capital City: skid steer, boom lift
(3, 2), (3, 1),           -- Hill Country: mini excavator, skid steer
(4, 1), (4, 2), (4, 3),   -- Round Rock Equipment (partner): everything
(5, 2), (5, 3);           -- Brushy Creek: mini excavator, boom lift
