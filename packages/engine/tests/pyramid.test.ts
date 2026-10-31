import { describe, expect, test } from 'bun:test';
import { seededRng } from '../src/core/rng.ts';
import { climbPath, deal, guess, normalizePyramidConfig, odds, pyramidSize, value, type PyramidState } from '../src/pyramid/engine.ts';
import { cards } from './helpers.ts';

const rig = (spec: string, cfg = {}): PyramidState => {
  const c = cards(spec);
  const config = normalizePyramidConfig({ rows: 4, ...cfg });
  return { config, path: climbPath(4, config.path), cards: c, at: 0, lives: config.lives, score: 0, status: 'playing', log: [] };
};

describe('Beat the Pyramid', () => {
  test('pyramids are 4 to 9 rows; 9 rows uses 45 cards', () => {
    expect(normalizePyramidConfig({ rows: 2 }).rows).toBe(4);
    expect(normalizePyramidConfig({ rows: 12 }).rows).toBe(9);
    expect(pyramidSize(9)).toBe(45);
    const s = deal(normalizePyramidConfig({ rows: 9 }), seededRng(1));
    expect(s.cards.length).toBe(45);
    expect(new Set(s.cards.map((c) => c.id)).size).toBe(45);
  });

  test('the climb starts bottom-left and ends at the top', () => {
    const p = climbPath(4, 'rows');
    expect(p[0]).toEqual({ row: 3, col: 0 });
    expect(p.slice(0, 4).map((x) => x.col)).toEqual([0, 1, 2, 3]);
    expect(p[4]).toEqual({ row: 2, col: 0 });
    expect(p[p.length - 1]).toEqual({ row: 0, col: 0 });
    const z = climbPath(4, 'zigzag');
    expect(z.slice(4, 7).map((x) => x.col)).toEqual([2, 1, 0]);
  });

  test('right guesses score, a wrong one ends the run', () => {
    let s = rig('5H 9C 2D KS 3H 3C 8D 4S 10H AS');
    s = guess(s, 'higher');
    expect(s.score).toBe(1);
    s = guess(s, 'lower');
    expect(s.score).toBe(2);
    s = guess(s, 'lower'); // 2 → K is higher: wrong
    expect(s.status).toBe('lost');
    expect(s.score).toBe(2);
    expect(() => guess(s, 'higher')).toThrow();
  });

  test('same rank is safe by default, or loses if set', () => {
    const safe = guess(guess(rig('5H 3C 3D KS 3H 3C 8D 4S 10H AS'), 'lower'), 'higher');
    expect(safe.status).toBe('playing');
    expect(safe.score).toBe(2);
    const lose = guess(guess(rig('5H 3C 3D KS 3H 3C 8D 4S 10H AS', { same: 'lose' }), 'lower'), 'higher');
    expect(lose.status).toBe('lost');
  });

  test('aces high or low', () => {
    expect(value(cards('AS')[0], 'high')).toBe(14);
    expect(value(cards('AS')[0], 'low')).toBe(1);
  });

  test('reaching the top beats the pyramid; three lives lets you keep going', () => {
    // strictly increasing then decreasing so we know every answer
    let s = rig('2H 3C 4D 5S 6H 7C 8D 9S 10H JS');
    for (let i = 0; i < 9; i++) s = guess(s, 'higher');
    expect(s.status).toBe('won');
    expect(s.score).toBe(9);
    let t = rig('2H 3C 4D 5S 6H 7C 8D 9S 10H JS', { lives: 3 });
    t = guess(t, 'lower');
    expect(t.status).toBe('playing');
    expect(t.lives).toBe(2);
    expect(t.score).toBe(0);
  });

  test('odds count only cards you have not seen', () => {
    const s = rig('2H 3C 4D 5S 6H 7C 8D 9S 10H JS');
    const o = odds(s);
    expect(o.lower).toBe(0);
    expect(o.same).toBeCloseTo(3 / 51);
    expect(o.higher).toBeCloseTo(48 / 51);
  });
});
