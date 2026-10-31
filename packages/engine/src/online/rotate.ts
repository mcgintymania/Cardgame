// Every player sees themselves at seat 0 (the bottom of the table). The server
// works in real seats; each browser rotates its own view so its seat becomes 0.
// Rotation is cyclic, so turn order, the dealer button and "pass left" all keep
// their meaning.

/** Keys whose number value is a seat. */
const SEAT_KEYS = new Set(['seat', 'current', 'button', 'sbSeat', 'bbSeat', 'winner', 'starter', 'roundStarter', 'target', 'from', 'knocker', 'wentOut', 'leader', 'moon', 'dealer']);
/** Keys whose value is a list of seats. */
const SEAT_LIST_KEYS = new Set(['placements', 'winners']);
/** Keys whose value is a list with one number per seat, in seat order. */
const PER_SEAT_LIST_KEYS = new Set(['scoresAfter']);
/** Keys whose value is an object keyed by seat. */
const SEAT_RECORD_KEYS = new Set(['payouts']);

export function rotateSeats<T>(value: T, me: number, n: number): T {
  if (me === 0 || n <= 1) return value;
  const r = (s: number) => ((s - me) % n + n) % n;
  const walk = (v: unknown, key: string | null): unknown => {
    if (v === null || v === undefined) return v;
    if (typeof v === 'number') return key && SEAT_KEYS.has(key) && Number.isInteger(v) && v >= 0 && v < n ? r(v) : v;
    if (Array.isArray(v)) {
      if (key && SEAT_LIST_KEYS.has(key)) return v.map((x) => (typeof x === 'number' ? r(x) : walk(x, null)));
      if (key && PER_SEAT_LIST_KEYS.has(key) && v.length === n) return v.map((_, i) => v[(i + me) % n]);
      const out = v.map((x) => walk(x, null));
      // A full list of per-seat objects in seat order (players, score lines…): reorder it.
      if (out.length === n && v.every((x, i) => x && typeof x === 'object' && (x as { seat?: unknown }).seat === i)) {
        return out.slice().sort((a, b) => (a as { seat: number }).seat - (b as { seat: number }).seat);
      }
      return out;
    }
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const res: Record<string, unknown> = {};
      for (const k of Object.keys(o)) {
        if (SEAT_RECORD_KEYS.has(k) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) {
          const rec: Record<string, unknown> = {};
          for (const [s, x] of Object.entries(o[k] as Record<string, unknown>)) rec[String(Number.isInteger(Number(s)) && Number(s) < n ? r(Number(s)) : s)] = x;
          res[k] = rec;
        } else res[k] = walk(o[k], k);
      }
      return res;
    }
    return v;
  };
  return walk(value, null) as T;
}
