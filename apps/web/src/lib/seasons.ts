// Seasonal takeovers. Each season has fixed dates (Easter is worked out each
// year), a look for the club (accent colours and a decoration), shop items and
// bundles, a free gift, a hat for Lou the dealer and props for some members.
//
// Adding a season later = one entry here + its items in catalogue.ts. When we go
// online, this list can come from the server so seasons can be switched on or
// changed without an app update (see docs/SEASONS.md).

export type SeasonId = 'newyear' | 'valentines' | 'stpatricks' | 'easter' | 'summer' | 'halloween' | 'christmas';
export type Deco = 'snow' | 'hearts' | 'clover' | 'petals' | 'sun' | 'leaves' | 'sparks';

export interface Season {
  id: SeasonId;
  name: string;
  /** Headline on the home and shop banners. */
  title: string;
  blurb: string;
  /** First and last day (inclusive) for a given year. Month is 1–12. */
  window: (year: number) => { from: [number, number]; to: [number, number] };
  accent: string;
  accent2: string;
  deco: Deco;
  /** Free once per season each year. */
  gift: string;
  /** What Lou the dealer wears. */
  dealerHat?: string;
  /** Props some members swap in while the season is on. */
  memberProps: string[];
}

/** Easter Sunday (Gregorian), as [month, day]. */
export function easterSunday(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

const shift = (year: number, [m, d]: [number, number], days: number): [number, number] => {
  const t = new Date(year, m - 1, d + days);
  return [t.getMonth() + 1, t.getDate()];
};

/** In priority order: if two ever overlap, the first one wins. */
export const SEASONS: Season[] = [
  {
    id: 'christmas', name: 'Christmas', title: 'Christmas at the club', blurb: 'Mulled wine, a tree in the corner and snow on the windows.',
    window: () => ({ from: [12, 1], to: [12, 30] }), accent: '#c8463c', accent2: '#e9d9a6', deco: 'snow',
    gift: 'hat-santa', dealerHat: 'hat-santa', memberProps: ['prop-mulled', 'prop-snowglobe', 'prop-tree'],
  },
  {
    id: 'newyear', name: 'New Year', title: 'Happy New Year', blurb: 'Champagne at midnight and a fresh start at every table.',
    window: () => ({ from: [12, 31], to: [1, 7] }), accent: '#e2bd68', accent2: '#9fb3e8', deco: 'sparks',
    gift: 'prop-champagne', dealerHat: 'hat-glitter', memberProps: ['prop-champagne'],
  },
  {
    id: 'valentines', name: "Valentine's", title: "Valentine's at the club", blurb: 'Red roses, dark chocolate and a little romance at the table.',
    window: () => ({ from: [2, 1], to: [2, 16] }), accent: '#c23a5a', accent2: '#f0b8c4', deco: 'hearts',
    gift: 'prop-chocolates', memberProps: ['prop-roses', 'prop-chocolates', 'prop-champagne'],
  },
  {
    id: 'easter', name: 'Easter', title: 'Easter at the club', blurb: 'Spring flowers, a golden egg and long weekends of cards.',
    window: (y) => ({ from: shift(y, easterSunday(y), -10), to: shift(y, easterSunday(y), 8) }), accent: '#9bbf6a', accent2: '#f1dc7a', deco: 'petals',
    gift: 'prop-daffodils', memberProps: ['prop-daffodils', 'prop-goldegg'],
  },
  {
    id: 'stpatricks', name: "St Patrick's", title: "St Patrick's Day", blurb: 'A pint of the black stuff and a bit of luck of the Irish.',
    window: () => ({ from: [3, 12], to: [3, 19] }), accent: '#2f9a5a', accent2: '#e2bd68', deco: 'clover',
    gift: 'prop-stout', dealerHat: 'hat-paddy', memberProps: ['prop-stout'],
  },
  {
    id: 'summer', name: 'Summer', title: 'Summer at the club', blurb: 'Poolside felt, cocktails and panama hats till the sun goes down.',
    window: () => ({ from: [6, 20], to: [8, 31] }), accent: '#e8944a', accent2: '#5ec4c4', deco: 'sun',
    gift: 'prop-cocktail', dealerHat: 'hat-panama', memberProps: ['prop-cocktail', 'prop-lemonade'],
  },
  {
    id: 'halloween', name: 'Halloween', title: 'Halloween at the club', blurb: 'Lanterns, cauldrons, witch and wizard hats.',
    window: () => ({ from: [10, 10], to: [11, 7] }), accent: '#d9772a', accent2: '#9a6ad4', deco: 'leaves',
    gift: 'prop-lantern', dealerHat: 'hat-witch', memberProps: ['prop-pumpkin', 'prop-lantern', 'prop-cauldron'],
  },
];

export const seasonById = (id: string | null | undefined) => SEASONS.find((s) => s.id === id);

const key = (m: number, d: number) => m * 100 + d;

/** Start and end dates of the run of a season that contains `now`, or null. */
export function seasonRun(s: Season, now = new Date()): { from: Date; to: Date } | null {
  const y = now.getFullYear();
  for (const year of [y - 1, y]) {
    const w = s.window(year);
    const wraps = key(...w.to) < key(...w.from);
    const from = new Date(year, w.from[0] - 1, w.from[1]);
    const to = new Date(wraps ? year + 1 : year, w.to[0] - 1, w.to[1], 23, 59, 59);
    if (now >= from && now <= to) return { from, to };
  }
  return null;
}

/** The season on now (by the calendar), if any. */
export function activeSeason(now = new Date()): Season | null {
  return SEASONS.find((s) => seasonRun(s, now)) ?? null;
}

/** The next run of every season from now, soonest first (for the calendar). */
export function upcoming(now = new Date()): Array<{ season: Season; from: Date; to: Date; on: boolean }> {
  return SEASONS.map((s) => {
    const run = seasonRun(s, now);
    if (run) return { season: s, ...run, on: true };
    for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
      const w = s.window(year);
      const from = new Date(year, w.from[0] - 1, w.from[1]);
      const wraps = key(...w.to) < key(...w.from);
      const to = new Date(wraps ? year + 1 : year, w.to[0] - 1, w.to[1], 23, 59, 59);
      if (from > now) return { season: s, from, to, on: false };
    }
    return null;
  }).filter(Boolean).sort((a, b) => a!.from.getTime() - b!.from.getTime()) as Array<{ season: Season; from: Date; to: Date; on: boolean }>;
}

/** Gift key: one claim per season per year it starts in. */
export function giftKey(s: Season, now = new Date()): string {
  const run = seasonRun(s, now);
  return `${s.id}-${(run?.from ?? now).getFullYear()}`;
}

export const daysLeft = (to: Date, now = new Date()) => Math.max(0, Math.ceil((to.getTime() - now.getTime()) / 86400000));
