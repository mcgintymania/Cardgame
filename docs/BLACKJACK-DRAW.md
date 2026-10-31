# Five-Card Draw and Blackjack

Both games use standard rules. They're my defaults, not house rules you've confirmed, and each table can change them.

## Five-Card Draw (`packages/engine/src/poker`, variant `draw`)
- **Engine**: it runs on the same engine as Hold'em, so blinds, no-limit betting, side pots, short all-ins and knockouts all behave identically.
- **Table**: 2–6 players. Six is the most that one deck covers.
- **Hand flow**:
  1. Everyone gets five cards face down.
  2. A betting round, with first action left of the big blind.
  3. The draw: going clockwise from the button, each player throws 0–3 cards (the table can set the limit) and gets replacements.
  4. A second betting round.
  5. Showdown, where the best five-card hand wins.
- **What's public and what isn't**: everyone sees how many cards each player drew (shown as "Draws 2" or "Stands pat"). Nobody sees which cards were thrown.
- **All-in players** still draw. After the draw the hand goes straight to showdown.
- **AI**:
  - **How it draws**: standard strategy. It keeps made hands, draws one to two pair, two to trips and three to a pair, chases four-flushes and open-ended straights, and occasionally stands pat with nothing as a bluff.
  - **How it bets**: it estimates its chances by Monte Carlo, the same betting brain as Hold'em. After the draw, it reads opponents through how many cards they took, so a player who stood pat is assumed to hold a made hand.

## Blackjack (`packages/engine/src/blackjack`)
- **Tournament format**:
  - Up to 5 players each play their own hands against the house dealer.
  - Everyone starts with the same chips (default 1,000) and plays a fixed number of hands (8, 12 or 20).
  - The biggest stack at the end wins. If you can't cover the minimum bet, you're out.
- **Casino rules** (the defaults):
  - The shoe is six decks, reshuffled at about a quarter left.
  - The dealer stands on soft 17 (you can switch to hitting soft 17) and checks for blackjack under an ace or a ten.
  - Blackjack pays 3:2 (or 6:5).
  - You can double on any first two cards, including after a split.
  - You can split a pair, including any two ten-value cards, up to 4 hands. Split aces get one card each, and 21 on a split hand isn't a blackjack.
  - Surrender and insurance: surrender is optional (off by default); there's no insurance.
- **Hidden bets**: during betting you can't see other players' bets until everyone has bet, so nobody can wait and react.
- **AI**:
  - **Playing**: full basic strategy (hard, soft and pair tables, plus surrender), followed with varying discipline.
  - **Betting**: careful players bet small and aggressive ones big. Experts play the tournament, betting big when behind late on and small when ahead.

## Club
- **Ratings, rankings and trophies**: both games have their own ratings, rankings and head-to-head records. Their titles are the Draw Poker Crown and the Blackjack Title.
- **Club Cup**: both use heats of four.
- **Your existing club**: it upgrades itself, with ratings starting at 1000 and everything you already have kept.
- **Members**: every member now has a Draw and a Blackjack skill. Inés (a former casino dealer) and Silas (who counts every point twice) are the blackjack experts. Sal, Mags and Otis lead at draw.

## Testing
- **Draw**: rule tests cover the flow, draw limits, folds, all-ins drawing and what's hidden. Strategy tests cover the draw choices and pat-hand reads.
- **Blackjack**: rule tests cover payouts, blackjack, dealer blackjack, bust, double, split, split aces, surrender and elimination, plus basic-strategy cases.
- **AI-vs-AI simulation**: full matches check that chips are conserved and every action is legal. A long single-player run shows the expert loses only slowly, as basic strategy should.
