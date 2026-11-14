// src/lib/content.ts — copy for the lead-generation pages. No yard names or counts are shown publicly.
import type { EquipmentType } from './db';

/** Small deterministic string hash (FNV-1a): the same URL always gets the same wording. */
export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function pick<T>(variants: readonly T[], seed: string): T {
  return variants[hash(seed) % variants.length];
}

export const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

const round5 = (n: number) => Math.round(n / 5) * 5;

/** Typical daily price band around the catalogue average (-25% / +40%). An ESTIMATE, not a quote. */
export function rateRange(avg: number | null): { min: number; max: number } | null {
  if (!avg) return null;
  return { min: round5(avg * 0.75), max: round5(avg * 1.4) };
}

/** Rough guide for longer rentals. Rental pricing rule of thumb: a week is about 3x a day, 4 weeks about 9x. */
export function rateTable(avg: number | null) {
  const d = rateRange(avg);
  if (!d) return null;
  return {
    day: d,
    week: { min: round5(d.min * 3), max: round5(d.max * 3) },
    month: { min: round5(d.min * 9), max: round5(d.max * 9) },
  };
}

export interface PageFacts {
  equipment: EquipmentType;
  city: string;
  stateName: string;
  stateCode: string;
}

export function buildIntro(f: PageFacts): string[] {
  const { equipment: e, city, stateCode } = f;
  const seed = `${stateCode}/${city}/${e.slug}`;
  const name = e.name.toLowerCase();
  const range = rateRange(e.avg_daily_rate_usd);

  const opener = pick(
    [
      `Need a ${name} in ${city}? Tell us what you're working on and we'll request quotes from local equipment suppliers for you, so you can compare prices without calling around.`,
      `Renting a ${name} in ${city}, ${stateCode} is usually cheaper than buying for a one-off job. Send one request and we'll collect availability and pricing from nearby rental suppliers.`,
      `Whether it's a weekend project or a full job site in ${city}, a ${name} rental is easy to arrange. Fill in the short form and we'll get quotes sent to you.`,
    ],
    seed + ':opener',
  );
  const price = range
    ? `The typical cost to rent a ${e.name} in ${city} is about ${money(range.min)} to ${money(range.max)} per day, and longer rentals are usually cheaper per day. These are estimates based on typical U.S. rental rates. Your actual quote depends on the machine size, attachments, rental length and delivery distance.`
    : '';
  return [opener, price, e.description ?? ''].filter(Boolean);
}

/** What drives the price — different for lifts than for earthmoving machines. */
export function buildFactors(e: EquipmentType): string[] {
  if (e.category.toLowerCase().includes('lift')) {
    return [
      'Working height and reach (a taller lift costs more per day)',
      'Articulating (knuckle) vs. telescopic (straight) boom',
      'Electric vs. diesel or dual-fuel power, and rough-terrain or indoor use',
      'Rental length: daily, weekly or 4-week rates',
      'Delivery and pickup distance',
      'Operator training: many yards ask for proof of aerial-lift training',
    ];
  }
  return [
    'Machine size and weight class (bigger machines cost more per day)',
    'Attachments such as buckets, augers, forks, breakers or brush cutters',
    'Wheeled vs. tracked, which affects ground conditions and price',
    'Rental length: daily, weekly or 4-week rates',
    'Delivery and pickup distance, and whether you tow it yourself',
    'Damage waiver or insurance, fuel policy and cleaning fees',
  ];
}

export interface Faq {
  q: string;
  a: string;
}

export function buildFaqs(f: PageFacts): Faq[] {
  const { equipment: e, city, stateName, stateCode } = f;
  const range = rateRange(e.avg_daily_rate_usd);
  const isLift = e.category.toLowerCase().includes('lift');

  return [
    {
      q: `Do I need a commercial license to rent a ${e.name} in ${stateName}?`,
      a: isLift
        ? `Generally you do not need a commercial driver's license to rent a ${e.name.toLowerCase()} in ${stateName}, but you will need a valid government ID, and suppliers usually ask for proof of insurance. Federal OSHA rules require aerial lift operators to be trained, so many suppliers will ask for training documentation. Requirements vary by supplier and job site, so confirm when you get your quote.`
        : `In most cases you do not need a commercial driver's license to rent a ${e.name.toLowerCase()} in ${stateName}. Suppliers typically ask for a valid driver's license or government ID, a deposit or credit card, and proof of insurance (or they'll sell you a damage waiver). If you tow the machine yourself, check the trailer and towing-vehicle requirements. Policies differ by supplier, so confirm when you request your quote.`,
    },
    {
      q: `How much does it cost to deliver heavy machinery in ${city}?`,
      a: `Delivery is usually priced as a flat fee or per mile each way, and depends on the machine's size, the trailer needed and the distance from the supplier's yard to your site. Include your delivery ZIP code in the quote form so each supplier can price it for you.`,
    },
    {
      q: `How much does a ${e.name} rental cost per day in ${city}?`,
      a: range
        ? `Typical ${e.name.toLowerCase()} rentals run roughly ${money(range.min)} to ${money(range.max)} per day in ${city}, ${stateCode}. These are estimates; the final price depends on machine size, attachments, rental length, fuel policy and whether delivery is included. Weekly and 4-week rates are generally a better value than stacking daily rentals.`
        : `Pricing for a ${e.name.toLowerCase()} in ${city} depends on machine size, attachments and rental length. Submit the quote form to get current rates.`,
    },
    {
      q: `How far in advance should I book a ${e.name} in ${city}?`,
      a: `Lead times vary by supplier and season. Book earlier for peak construction season, holidays and larger or specialty machines. Send your project start date and duration in the form so suppliers can confirm availability quickly.`,
    },
  ];
}
