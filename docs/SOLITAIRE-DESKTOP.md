# Solitaire, the dealer and big screens

## Solitaire (`packages/engine/src/solitaire`, `apps/web/src/features/solitaire`)
- **Game**: classic Klondike, draw 1 or draw 3.
- **Rules**:
  - Seven columns build down in alternating colours.
  - Only Kings (or runs starting with a King) go into empty columns.
  - The four foundations build up by suit from Ace to King.
  - The stock can be recycled without limit.
- **Controls**:
  - Tap a card and it goes to the best place: a foundation first, otherwise a column with cards in it.
  - Drag cards (or a whole run) to put them exactly where you want.
  - ↶ undoes and ✦ highlights a useful move.
  - When every card is face up, the rest plays itself.
- **Score**: the classic Windows scoring (+10 to a foundation, +5 waste to column, +5 for turning a card, −15 foundation back to column, −100 per pass of the stock in draw 1, −20 in draw 3).
- **Stats**: games played, won, win rate, best time, best moves, best score, current and best win streak. Leaving a started deal counts as a loss and resets the streak.
- **Rewards**: 20 coins and 25 XP per solve. Solitaire doesn't touch club ratings, because there's no opponent.
- **Daily Deal**:
  - One shuffle per day for everyone, seeded from the date, always draw 1.
  - Your first solve of the day adds 40 coins.
  - A board shows some club members' times. In local mode these times are invented from each member's skill and the date. Online, they become real players' times.

## The dealer (`apps/web/src/design/Dealer.tsx`)
- **Who**: Lou, the club dealer, a full-body character in a waistcoat, bow tie and green visor.
- **Where**: Lou stands behind the table at Blackjack, Hold'em and Five-Card Draw on laptop and desktop screens.
- **What Lou does**:
  - Deals, with a dealing pose.
  - Announces pots ("Pot to Mags, two pair"), all-ins, blinds going up, players knocked out and the draw ("Cards to draw?").
  - At Blackjack: blackjacks, dealer blackjack, dealer busts and fresh shoes.
- **On phones**: there's no room for the full figure, so Blackjack shows a small dealer portrait next to the dealer's total.
- Lou is presentation only. The rules engine makes every decision.

## Big screens
- **When**: at 1024px wide or more (and 640px tall), tables switch to a proper game layout.
- **Sizing**: cards, players and text scale with the window height.
- **Side panel**: from 1280px wide, a panel shows everyone at the table (scores or chips, who's acting, status) and a running game log, e.g. "Pip raises to 60", "Hand 3: dealer busts", "Round 2: Mags went out".
- **Pages**: wider pages use three columns for game rooms and champions.

## Hair fix
Every hair style now starts from a cap drawn outside the skull (the head's top is at y=33 and the hair peaks around y=27). Skin can no longer show above the hair. Under a hat, only the sides show.

## Games shown (Settings)
- **What it does**: each game, Solitaire included, can be switched off in Settings. At least one game always stays on.
- **Where hidden games disappear from**: the menu, the game rooms, champions, the club's rankings, titles and Cup, club news, trophy cabinets, member profiles, rivalries and practice stats.
- **Nothing is lost**: switching a game back on brings its history back.

## Sharing a copy
- `node scripts/build.mjs --inline-react` makes a single file (`dist/card-club.test.html`) with everything inside, React included. You can send it as an attachment, and it works with no internet (fonts fall back to system fonts).
- Each person's club, coins and progress are saved in their own browser.

## Beat the Pyramid (`packages/engine/src/pyramid`, `apps/web/src/features/pyramid`)
The owner's daughter plays this. The name is the family's own, since its real name isn't known.
- **Layout**: cards are dealt face down in a pyramid, 1 card at the top, then 2, 3 … down to the bottom row. It has 4 to 9 rows (9 rows = 45 cards, the most one deck allows).
- **Play**:
  - The bottom-left card starts face up. Guess whether the next card is higher or lower, then it turns over.
  - The climb goes along the bottom row, then each row above, finishing on the single top card. Reaching it beats the pyramid.
- **Score**: how many guesses were right. Turned cards don't add anything extra. Best score is kept for each pyramid size, plus wins and streaks.
- **Defaults chosen by Claude (not yet confirmed), each a switch**:

  | Rule | Default | Alternative |
  |---|---|---|
  | Order | Row by row, left to right | Zig-zag |
  | Same rank | Safe | Loses |
  | Aces | High | Low |
  | Lives | 1 | 3 |

- **Extras**:
  - An optional odds helper shows the chance the next card is higher, lower or the same, counting only unseen cards.
  - The ↑ and ↓ keys guess.
- **Rewards**: beating a pyramid earns 5 coins per row. It has no effect on club ratings.
