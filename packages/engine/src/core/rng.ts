// Random number sources. Games never call Math.random directly, so the server
// can use a cryptographic source and tests can use a reproducible seed.

export interface Rng {
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Uniform float in [0, 1). Only for AI flavour, never for dealing. */
  float(): number;
}

/**
 * Cryptographically secure RNG using crypto.getRandomValues (browser, Deno and Node 19+).
 * Uses rejection sampling so there is no modulo bias.
 */
export function cryptoRng(): Rng {
  const c: Crypto | undefined = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('Secure random source unavailable');
  }
  const buf = new Uint32Array(1);
  const next32 = () => {
    c.getRandomValues(buf);
    return buf[0];
  };
  return {
    int(max) {
      if (!Number.isInteger(max) || max <= 0) throw new Error(`Bad range ${max}`);
      const limit = Math.floor(0x100000000 / max) * max; // largest multiple of max ≤ 2^32
      let x: number;
      do x = next32(); while (x >= limit);
      return x % max;
    },
    float() {
      return next32() / 0x100000000;
    },
  };
}

/** Deterministic RNG (mulberry32) for tests and replays. Never use for real dealing. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
  return {
    int(max) {
      if (!Number.isInteger(max) || max <= 0) throw new Error(`Bad range ${max}`);
      return Math.floor(next() * max);
    },
    float: next,
  };
}

/** Unbiased Fisher–Yates shuffle. Returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}
