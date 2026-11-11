// src/lib/content.ts
// Programmatic copy generation. Goal: every city x equipment page reads differently because it
// merges REAL local facts (yard counts, nearby cities, distances, rate ranges) into templates,
// and because phrasing variants are chosen deterministically per page (same URL => same copy,
// so Google sees stable content between crawls).

import type { EquipmentType, RentalYard } from './db';

/** Small deterministic string hash (FNV-1a). Same input always yields the same number. */
export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pick one variant deterministically based on a seed string. */
export function pick<T>(variants: readonly T[], seed: string): T {
  return variants[hash(seed) % variants.length];
}

export const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * Calculated daily price band. Rates vary by yard, machine size and season, so we derive a
 * realistic band around the catalogue average (-25% / +40%), rounded to the nearest $5.
 * Replace with real min/max from yard_inventory once you collect per-yard pricing.
 */
export function rateRange(avg: number | null): { min: number; max: number } | null {
  if (!avg) return null;
  const round5 = (n: number) => Math.round(n / 5) * 5;
  return { min: round5(avg * 0.75), max: round5(avg * 1.4) };
}

export interface PageFacts {
  equipment: EquipmentType;
  city: string;
  stateName: string;
  stateCode: string;
  localYards: RentalYard[];
  nearbyYards: Array<RentalYard & { miles: number }>;
}

/** Intro paragraphs that merge local facts into varied sentence structures. */
export function buildIntro(f: PageFacts): string[] {
  const { equipment: e, city, stateCode, localYards, nearbyYards } = f;
  const seed = `${stateCode}/${city}/${e.slug}`;
  const name = e.name.toLowerCase();
  const range = rateRange(e.avg_daily_rate_usd);
  const partners = [...localYards, ...nearbyYards].filter((y) => y.is_partner).length;

  const opener = pick(
    [
      `Looking for a ${name} rental in ${city}? We connect ${city}-area contractors, landscapers and homeowners with independent equipment yards that stock the machine, so you can compare availability instead of calling around.`,
      `Whether you're breaking ground on a job in ${city} or finishing a weekend project, renting a ${name} is usually more economical than buying. Tell us what you need and local ${city} fleets respond with availability and pricing.`,
      `${city}, ${stateCode} has a busy rental market, and a ${name} is one of its most requested machines. Browse the local suppliers below or send one request and let them come to you.`,
    ],
    seed + ':opener',
  );

  const supply = localYards.length
    ? `We currently list ${localYards.length} ${localYards.length === 1 ? 'yard' : 'yards'} in ${city} that ${localYards.length === 1 ? 'stocks' : 'stock'} this equipment${nearbyYards.length ? `, plus ${nearbyYards.length} more within about ${Math.ceil(Math.max(...nearbyYards.map((y) => y.miles)) / 5) * 5} miles` : ''}.`
    : `There are no yards inside ${city} city limits listed yet, but ${nearbyYards.length} nearby ${nearbyYards.length === 1 ? 'supplier' : 'suppliers'} within about ${Math.ceil(Math.max(...nearbyYards.map((y) => y.miles)) / 5) * 5} miles can deliver to ${city}.`;

  const price = range
    ? pick(
        [
          `The average cost to rent a ${e.name} in ${city} ranges from ${money(range.min)} to ${money(range.max)} per day, with weekly and monthly rates typically cheaper per day.`,
          `Expect to pay roughly ${money(range.min)}–${money(range.max)} per day for a ${e.name} in ${city}; longer rentals are usually discounted.`,
        ],
        seed + ':price',
      )
    : '';

  const partnerLine = partners
    ? ` ${partners} of these ${partners === 1 ? 'suppliers is a' : 'suppliers are'} verified partner${partners === 1 ? '' : 's'} offering direct booking.`
    : '';

  return [opener, `${supply} ${price}${partnerLine}`.trim(), e.description ?? ''].filter(Boolean);
}

export interface Faq {
  q: string;
  a: string;
}

/** 4 programmatic FAQs combining equipment, city and state variables. */
export function buildFaqs(f: PageFacts): Faq[] {
  const { equipment: e, city, stateName, stateCode, localYards, nearbyYards } = f;
  const range = rateRange(e.avg_daily_rate_usd);
  const isLift = e.category.toLowerCase().includes('lift');
  const nearest = [...nearbyYards].sort((a, b) => a.miles - b.miles)[0];

  const license: Faq = {
    q: `Do I need a commercial license to rent a ${e.name} in ${stateName}?`,
    a: isLift
      ? `Generally you do not need a commercial driver's license to rent a ${e.name.toLowerCase()} in ${stateName}, but you will need a valid government ID, and rental yards usually require proof of insurance. Federal OSHA rules also require that aerial lift operators be trained, so many yards will ask for training documentation or can point you to a course. Requirements vary by yard and job site, so confirm with your supplier.`
      : `In most cases you do not need a commercial driver's license to rent a ${e.name.toLowerCase()} in ${stateName}. Yards typically ask for a valid driver's license or government ID, a deposit or credit card, and proof of insurance (or they'll sell you a damage waiver). If you tow the machine yourself, check the trailer and towing-vehicle requirements. Policies differ by yard, so confirm when you request your quote.`,
  };

  const delivery: Faq = {
    q: `How much does it cost to deliver heavy machinery in ${city}?`,
    a: `Delivery is usually priced as a flat fee or per mile each way, and it depends on the machine's size, the trailer needed and your distance from the yard. ${
      localYards.length
        ? `${city} has ${localYards.length} local ${localYards.length === 1 ? 'yard' : 'yards'} stocking the ${e.name.toLowerCase()}, which often keeps delivery charges lower than hauling from another city.`
        : nearest
          ? `The closest supplier is about ${Math.round(nearest.miles)} miles from ${city}, so expect delivery to be priced accordingly.`
          : ''
    } Include your delivery ZIP in the quote form and each yard will price it for you.`.replace(/\s+/g, ' '),
  };

  const cost: Faq = {
    q: `How much does a ${e.name} rental cost per day in ${city}?`,
    a: range
      ? `Most ${e.name.toLowerCase()} rentals in ${city}, ${stateCode} run between ${money(range.min)} and ${money(range.max)} per day. The final price depends on machine size, attachments, rental length, fuel policy and whether delivery is included. Weekly and monthly rates are generally a better value than stacking daily rentals.`
      : `Pricing for a ${e.name.toLowerCase()} in ${city} depends on machine size, attachments and rental length. Submit the quote form to get current rates from local yards.`,
  };

  const book: Faq = {
    q: `How far in advance should I book a ${e.name} in ${city}?`,
    a: `For standard sizes, many ${city}-area yards can deliver within a day or two, but book earlier for peak construction season, holidays and larger or specialty models. Send your project start date and duration in the form above so suppliers can confirm availability quickly.`,
  };

  return [license, delivery, cost, book];
}
