# Texas Hold'em — what's implemented

No-limit Texas Hold'em, 2–9 players, practice chips only (never the player's balance).

## Rules

- **Blinds and button:** button moves one live seat each hand. Small blind is left of the
  button, big blind next. **Heads-up:** the button posts the small blind, acts first
  before the flop and second after it.
- **Order of play:** before the flop, first to act is left of the big blind; the big blind
  gets an option if nobody raises. After the flop, first live player left of the button.
- **Bets:** opening bet at least the big blind; a raise must be at least the size of the
  previous bet or raise. Any player may go all in for less.
- **Short all-ins:** an all-in raise smaller than a full raise does **not** reopen the
  betting for players who already acted — they may only call or fold.
- **Uncalled bets** are returned before pots are built.
- **All in with no one left to bet:** the board is dealt out to the river.
- **Side pots:** one per all-in level; folded players' chips stay in but they can't win.
- **Split pots:** equal shares; odd chips go to the winner closest to the left of the button.
- **Showdown:** all remaining hands are turned over. If everyone else folds, the winner's
  cards stay hidden.
- **Knockouts:** a player with no chips is out. If several go out on the same hand, whoever
  started the hand with more chips finishes higher.
- **Table presets:** Casual (1,000 chips, 10/20 fixed), Tournament (blinds up every 8
  hands), Turbo (600 chips, blinds up every 5 hands). Blinds rise ×1.5, rounded up to 10.

## AI

The AI only sees its own `PokerView`. It estimates its chance of winning by dealing random
cards to the opponents still in the hand (Monte Carlo, 120–320 deals a decision, under 1 ms),
discounts that when facing a large bet, and compares it with the pot odds. Four styles share
the characters from Take 2: Tight, Aggressive, Wild card and Beginner.

## Tests

`packages/engine/tests/poker.test.ts` (hand rankings, kickers, wheel, side pots, odd chips,
blind order, minimum raises, short all-ins, uncalled bets, run-outs, privacy) and
`poker.sim.test.ts` (full AI matches with 2–9 players; chips are checked after every action).

## Not built yet

Online tables, real chip balances, tournaments with multiple tables, time banks, showing or
mucking choices at showdown, straddles and antes.
