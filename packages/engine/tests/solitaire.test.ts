import { describe, expect, test } from 'bun:test';
import { seededRng } from '../src/core/rng.ts';
import { apply, autoStep, bestTarget, canAutoFinish, canMove, deal, hint, isWon, SolitaireError, type SolitaireState } from '../src/solitaire/engine.ts';
import { cards } from './helpers.ts';

const allCards = (s: SolitaireState) => [...s.stock, ...s.waste, ...s.foundations.flat(), ...s.tableau.flatMap((c) => c.cards)];

function blank(): SolitaireState {
  return { config: { draw: 1 }, stock: [], waste: [], foundations: [[], [], [], []], tableau: Array.from({ length: 7 }, () => ({ cards: [], up: 0 })), moves: 0, score: 0, recycles: 0 };
}

describe('Klondike deal', () => {
  test('seven columns of 1–7, top cards face up, 24 in the stock', () => {
    const s = deal({ draw: 1 }, seededRng(1));
    expect(s.tableau.map((c) => c.cards.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s.tableau.map((c) => c.up)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(s.stock.length).toBe(24);
    expect(new Set(allCards(s).map((c) => c.id)).size).toBe(52);
  });
  test('the same seed gives the same deal (for the Daily Deal)', () => {
    expect(JSON.stringify(deal({ draw: 1 }, seededRng(20261019)))).toBe(JSON.stringify(deal({ draw: 1 }, seededRng(20261019))));
  });
});

describe('Klondike moves', () => {
  test('draw one or three; an empty stock recycles the waste', () => {
    let s = deal({ draw: 3 }, seededRng(2));
    s = apply(s, { type: 'draw' });
    expect(s.waste.length).toBe(3);
    for (let i = 0; i < 7; i++) s = apply(s, { type: 'draw' });
    expect(s.stock.length).toBe(0);
    s = apply(s, { type: 'draw' });
    expect(s.stock.length).toBe(24);
    expect(s.waste.length).toBe(0);
    expect(s.recycles).toBe(1);
  });

  test('alternate colours, one lower; kings only into empty columns', () => {
    const s = blank();
    s.tableau[0] = { cards: cards('9H'), up: 0 };
    s.tableau[1] = { cards: cards('8S'), up: 0 };
    s.tableau[2] = { cards: cards('8D'), up: 0 };
    s.tableau[3] = { cards: cards('KC'), up: 0 };
    expect(canMove(s, { kind: 'tableau', index: 1 }, { kind: 'tableau', index: 0 })).toBe(true);
    expect(canMove(s, { kind: 'tableau', index: 2 }, { kind: 'tableau', index: 0 })).toBe(false);
    expect(canMove(s, { kind: 'tableau', index: 1 }, { kind: 'tableau', index: 4 })).toBe(false);
    expect(canMove(s, { kind: 'tableau', index: 3 }, { kind: 'tableau', index: 4 })).toBe(true);
    expect(() => apply(s, { type: 'move', from: { kind: 'tableau', index: 2 }, to: { kind: 'tableau', index: 0 } })).toThrow(SolitaireError);
  });

  test('moving a run turns over the card underneath', () => {
    const s = blank();
    s.tableau[0] = { cards: cards('2C 9H 8S'), up: 1 };
    s.tableau[1] = { cards: cards('10C'), up: 0 };
    const r = apply(s, { type: 'move', from: { kind: 'tableau', index: 0, card: 1 }, to: { kind: 'tableau', index: 1 } });
    expect(r.tableau[1].cards.map((c) => c.id)).toEqual(['10C', '9H', '8S']);
    expect(r.tableau[0].up).toBe(0);
    expect(r.score).toBe(5);
  });

  test('foundations build up by suit from the ace', () => {
    const s = blank();
    s.waste = cards('AH');
    s.tableau[0] = { cards: cards('2H'), up: 0 };
    s.tableau[1] = { cards: cards('2S'), up: 0 };
    let r = apply(s, { type: 'move', from: { kind: 'waste' }, to: { kind: 'foundation', index: 0 } });
    expect(canMove(r, { kind: 'tableau', index: 1 }, { kind: 'foundation', index: 0 })).toBe(false);
    r = apply(r, { type: 'move', from: { kind: 'tableau', index: 0 }, to: { kind: 'foundation', index: 0 } });
    expect(r.foundations[0].length).toBe(2);
    expect(r.score).toBe(20);
  });

  test('tap-to-move prefers the foundation, then a column with cards', () => {
    const s = blank();
    s.waste = cards('AS');
    expect(bestTarget(s, { kind: 'waste' })).toEqual({ kind: 'foundation', index: 0 });
    s.waste = cards('7H');
    s.tableau[2] = { cards: cards('8C'), up: 0 };
    expect(bestTarget(s, { kind: 'waste' })).toEqual({ kind: 'tableau', index: 2 });
  });

  test('auto-finish when everything is face up', () => {
    const s = blank();
    const suits = ['S', 'H', 'D', 'C'];
    // foundations hold A–Q, kings sit in columns
    s.foundations = suits.map((su) => cards(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q'].map((r) => r + su).join(' ')));
    suits.forEach((su, i) => { s.tableau[i] = { cards: cards('K' + su), up: 0 }; });
    expect(canAutoFinish(s)).toBe(true);
    let st = s;
    for (let i = 0; i < 4; i++) { const m = autoStep(st)!; st = apply(st, { type: 'move', ...m }); }
    expect(isWon(st)).toBe(true);
  });
});

describe('Klondike play-through', () => {
  test('hint-driven play never makes an illegal move and wins some deals', () => {
    let wins = 0;
    for (let seed = 1; seed <= 300; seed++) {
      let s = deal({ draw: seed % 2 ? 1 : 3 }, seededRng(seed));
      let guard = 0;
      let sinceProgress = 0;
      while (!isWon(s) && guard++ < 1500 && sinceProgress < 80) {
        if (canAutoFinish(s)) { const m = autoStep(s); if (!m) break; s = apply(s, { type: 'move', ...m }); continue; }
        const h = hint(s);
        if (!h) break;
        const before = s.foundations.flat().length + s.tableau.reduce((a, c) => a + (c.cards.length - c.up), 0);
        s = h === 'draw' ? apply(s, { type: 'draw' }) : apply(s, { type: 'move', ...h });
        const after = s.foundations.flat().length + s.tableau.reduce((a, c) => a + (c.cards.length - c.up), 0);
        sinceProgress = after !== before || h !== 'draw' ? 0 : sinceProgress + 1;
        expect(allCards(s).length).toBe(52);
      }
      if (isWon(s)) wins++;
    }
    expect(wins).toBeGreaterThan(10);
    console.log('solitaire greedy wins', wins, '/ 300');
  });
});
