# The Club — members, rankings, titles and cups

All of this is stored on the device for now (`apps/web/src/lib/club.ts`, pure functions,
tests in `club.test.ts`). It is designed to move to Supabase unchanged in shape.

## Members
- 25 original AI members (`lib/roster.ts`). Each has a playing **style** (careful,
  aggressive, unpredictable) and a **skill per game** (0 = doesn't play it).
- Skill picks the AI level: under 35 plays as a beginner, 78+ as an expert, otherwise
  their own style.
- You choose how many opponents; seats fill from members who play that game, leaning
  towards your rating. "Shuffle seats" re-draws.

## Ratings
- Elo-style rating per game for every member and you (you start at 1000). Multi-player
  results count as pairwise results between everyone at the table.
- Members keep playing each other in the background (two simulated results after each of
  your matches), so the ladder moves without you.
- Head-to-head records against every member you've shared a table with.

## Titles (one per game: Take 2 Title, Hold'em Crown, Hearts Title, Gin Rummy Belt, Draw Poker Crown, Blackjack Title)
- Held by a member at the start. Reach the **top 5 contenders** to earn a title shot.
- Title matches are one-on-one. Win to take the title; while you hold it you defend it
  against the top-ranked contender. Every reign records start/end dates and defences.
- Members also fight for the title among themselves while you don't hold it. They never
  take your title without playing you.

## Club Cup (one per game, numbered editions)
- 8 players. Take 2, Hold'em, Hearts, Five-Card Draw and Blackjack: two heats of 4, top two from each heat make a 4-player final.
- Gin Rummy (two-player): a one-on-one knockout — quarter-final, semi-final, final. Other ties are simulated from ratings.
- Hearts title matches seat two extra members; only the champion vs challenger result decides the title.
- Saved clubs from before Hearts/Gin are upgraded automatically (new titles, ratings at 1000, all history kept).
- Your heat is played; the other heat is simulated from ratings. Going out in the heats
  still finishes the Cup (the final is simulated).
- Leaving a title match or Cup match early counts as finishing last.

## Trophy cabinet
- Current belts (with days held and defences), past reigns, Cups by edition. Shown on
  your profile and on every member's profile, with rivalries (head-to-head).

## Decision
- **No real money, ever.** Club coins are earned in play and spent on cosmetics only.

## Online later
Friends (e.g. your brother) get the same head-to-head records, and titles can be
contested between real players with members filling empty seats.
