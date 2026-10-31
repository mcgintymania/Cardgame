# Hearts and Gin Rummy

Both games use standard rules, and each table can change them. The defaults below are the classic versions; they weren't house rules you gave me, so say if your family plays differently.

## Hearts (`packages/engine/src/hearts`)
- **Players**: four, 13 cards each. Your table is filled with three club members.
- **Passing**: before each hand you pass three cards, rotating left, right, across, then no pass.
- **Play**:
  - Whoever holds the 2♣ leads it. You must follow suit if you can.
  - The highest card of the suit led wins the trick, and aces are high.
- **Restrictions**:
  - No hearts or Q♠ on the first trick, unless that's all you hold.
  - You can't lead hearts until a heart has been played ("broken"). The Q♠ also breaks hearts. The exception is a hand of only hearts.
- **Scoring**:
  - Each heart is 1 point and the Q♠ is 13.
  - Take all 26 and you **shoot the moon**: everyone else gets 26. Alternatively you take 26 off your own score.
- **Winning**: the match ends after the hand in which someone reaches the target (100, 75 or 50). The lowest score wins. A tie for lowest means another hand is played.
- **Options**: Jack of Diamonds −10, passing on/off, no points on the first trick, Queen breaks hearts, target.
- **AI**:
  - Every level ducks under the winning card and dumps the Queen and high hearts when it can't follow suit.
  - Experts and the aggressive style also track the Queen, lead low spades to flush her out, and avoid leading A♠/K♠ while she's out.
  - Careful players and experts also block an opponent who is shooting the moon.
- **Club**:
  - The Club Cup uses heats of four, the same as Take 2 and Hold'em.
  - Title matches have four players: the champion, the challenger and two club members. Only the champion and challenger's places against each other decide the title.

## Gin Rummy (`packages/engine/src/gin`)
- **Players**: two, 10 cards each.
- **First turn**: the first upcard is offered to the non-dealer, then the dealer. If both pass, the non-dealer must draw from the stock.
- **Turns**: draw from the stock or take the top discard, then discard. You can't throw back a card you just picked up.
- **Melds**: sets of 3–4 of a rank, or runs of 3+ in a suit. Ace is low only.
- **Deadwood**: every card not in a meld. Ace = 1, picture cards = 10.
- **Knocking**:
  - You can knock with 10 or less deadwood; tables can set 7, 5 or gin only.
  - The defender lays off cards onto the knocker's melds automatically, picking the best arrangement.
- **Scoring**:
  - **Knock**: the knocker scores the difference in deadwood.
  - **Undercut**: if the defender's deadwood is equal or lower, the defender scores 25 plus the difference.
  - **Gin**: 25 plus the opponent's deadwood, with no lay-offs.
  - **Big gin**: all 11 cards melded straight after drawing, for 31 plus the opponent's deadwood.
- **Void hands**: if the stock gets down to 2 cards, the hand is a draw.
- **Winning**: first to the target (100, 50 or 150).
- **Helpers on screen**:
  - Your hand is grouped into melds automatically, with deadwood shown.
  - Cards you can knock by throwing are highlighted.
  - What your opponent has picked up from the discard pile is shown publicly.
- **AI**:
  - Every AI picks up a discard when it improves a meld, and discards to lower its deadwood while keeping near-melds.
  - Careful players and experts avoid feeding cards that fit what you've picked up.
  - Experts are warier of being undercut.
  - Aggressive players hold out for gin.
- **Club**: the Club Cup is an 8-player one-on-one knockout (quarter-final, semi-final, final). Title matches are one on one.

## Testing
- **Rule tests** cover passing, following suit, first-trick limits, breaking hearts, moon scoring and ties, plus melds, lay-offs, knock, undercut, gin, big gin and void hands.
- **AI-vs-AI simulation**: 200 Hearts matches and 150 Gin matches, checking that every AI move is legal and every card is accounted for after each action. Experts reliably beat beginners in both games.
