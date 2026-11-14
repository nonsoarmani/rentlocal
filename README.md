# RentLocalMachinery.com

Programmatic-SEO directory + lead-gen for heavy equipment rentals.
**Stack:** Astro 5 (SSR) · Tailwind CSS 4 · Cloudflare Pages · Cloudflare D1.

## Why Astro (not Next.js)
10,000+ pages are rendered **on demand at the edge** from D1 and cached by Cloudflare's CDN
(`s-maxage` + `stale-while-revalidate`), so builds stay seconds long regardless of page count.
Astro ships zero JS by default (best Core Web Vitals) and has first-class Cloudflare support,
without the `@cloudflare/next-on-pages` compatibility layer.

## Structure
```
migrations/0001_init.sql                      D1 schema + mock data (3 machines, 5 yards, leads table)
wrangler.toml                                 Pages + D1 binding
src/lib/db.ts                                 all SQL queries
src/lib/content.ts                            programmatic copy (intro, price band, FAQs)
src/lib/us-states.ts                          slug/code/name helpers
src/components/LeadForm.astro                 lead capture form
src/components/YardCard.astro                 partner vs free listing card
src/pages/index.astro                         homepage
src/pages/rentals/[state]/index.astro         state hub
src/pages/rentals/[state]/[city]/index.astro  city hub
src/pages/rentals/[state]/[city]/[equipment].astro   money page
src/pages/api/lead.ts                         lead POST endpoint -> D1
```

## Setup
```bash
npm install
npm run db:create            # copy the printed database_id into wrangler.toml
npm run db:migrate:local     # create tables + mock data locally
npm run dev                  # http://localhost:4321/rentals/texas/austin/skid-steer-rental
```

Deploy: connect the GitHub repo in Cloudflare Pages (build command `npm run build`, output `dist`),
add the D1 binding named `DB` under Settings → Functions, then `npm run db:migrate:remote`.

## Try these URLs (mock data)
- `/rentals/texas`
- `/rentals/texas/austin`
- `/rentals/texas/austin/skid-steer-rental`
- `/rentals/texas/round-rock/boom-lift-rental`

## Notes
- All yard data in the migration is fictional.
- Pages 404 when a city/machine combo has no suppliers (thin-content guard).
- Next steps: sitemap (chunked, 50k URL limit), lead email notifications, real data import, Turnstile on the form.

## Importing real yards from OpenStreetMap
```bash
npm run import:city -- "Austin" TX            # creates data/import-tx-austin.sql
npm run db:import:local -- data/import-tx-austin.sql     # test copy
npm run db:import:remote -- data/import-tx-austin.sql    # live site
```
Add `--stocks skid-steer-rental,boom-lift-rental` only for machines you have verified yards stock.

## Admin: upload yards by CSV (no terminal)
Open `/admin`, log in with the `ADMIN_PASSWORD` secret (Cloudflare → project → Settings → Variables and Secrets),
upload a CSV (template: `/yard-template.csv`). Yards are saved to D1 and linked to machines from the `equipment` column.
For local testing put `ADMIN_PASSWORD=something-long` in a `.dev.vars` file (never commit it — it is in .gitignore).

## Leads inbox (/admin/leads)
Every quote request appears at `/admin/leads` with status, notes, matching yards and an "amount earned" field.
Optional email alerts: set `RESEND_API_KEY` (secret), `NOTIFY_EMAIL`, `NOTIFY_FROM` in Cloudflare (see src/lib/notify.ts).

## SEO
`/sitemap.xml` (index) and `/sitemap/N.xml` are generated from the database. After deploying, submit
`https://YOURDOMAIN/sitemap.xml` in Google Search Console and Bing Webmaster Tools.

## Lead-gen mode
The public site shows no supplier listings: only typical price ranges, helpful details and a quote form (with a
consent checkbox that is stored with each lead). The `rental_yards` data is private: it decides which cities get
pages and who a lead can be sent to in /admin/leads. Pages exist for every city that has at least one yard row,
for every machine type.
