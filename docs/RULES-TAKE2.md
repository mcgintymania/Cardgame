# Take 2 — rules as implemented

Status: **confirmed by the owner after play-testing (18 Oct 2026).** The defaults below are in use;
they remain host settings.
Every item marked *Proposed* is a host setting in the app (House rules) and in
`packages/engine/src/take2/config.ts`. Nothing proposed is treated as confirmed.

## From the owner's spec (confirmed)

- Standard 52-card deck. Knockout rounds. Last player under the limit wins.
- Reaching or exceeding **100** penalty points eliminates a player.
- Penalty values: A = 1, 3–7 and 9–10 = face value, 8 = 10, Q = 10, K = 10, J = 20.
- **2 is a multiplier**: add all non-2 cards, then double once per 2.
  Example: 5 + 10 + 2 + 2 → 15 × 4 = **60**.
- Action cards: **2** – next player draws two. **8** – next player misses a turn.
  **Jack** – changes the active suit.
- Action effects are separate from penalty scoring in code.
- 2s can stack (setting exists, as requested).
- **Picking up takes your turn.** Whether you pick up because you can't play or
  because of a 2, your turn ends and you can't play the card you picked up
  (`playDrawnCard: false`, `penaltyEndsTurn: true`).
- **Announce "last card".** When a play leaves you with one card you must announce
  it (the *Call last card* button). Go out without announcing and it doesn't count
  (`lastCardCall`): the card stays played and you **pick up 2** (`lastCardPenalty`).
- **You can't finish on a Jack.** A Jack can't be your final card; you have to pick
  up instead (`noFinishOnJack`).

## Defaults in use (accepted by the owner)

| Question | Default | Setting |
|---|---|---|
| What can be played? | Same suit **or** same number | `matchRule` |
| Can't play | Pick up one card, turn ends | `whenStuck` |
| Must play if able? | No — you may draw instead | `mustPlayIfAble` |
| Respond to a 2 with a 2? | Yes, penalties add up (+2, +4, +6…) | `twoStacking` |
| Pass a skip on with another 8? | Yes (owner confirmed): if you're hit with an 8 and hold one, play it and the next player misses the turn instead | `eightStacking` |
| Jack playable on anything? | Yes (wild), player calls a suit | `jackWild` |
| Jack action | Change suit (spec); reverse/none available | `jackAction` |
| Going out on a 2 | Next player still draws before scoring | `finishingActionApplies` |
| First discard is 2/8/J | Turn another card | `flipActionOnStart` |
| Points across rounds | **Cumulative**: round score adds to running total | `scoringMode` |
| When is hand value counted? | Only at round end (shown live as a preview) | — |
| Round ends when | First player empties their hand (they score 0) | — |
| Exactly 100 | Eliminated (spec says "reaches or exceeds") | `eliminateOnExact` |
| Starting player | Rotates one seat each round | — |
| Hand of only 2s | Scores 0 (0 × 2 = 0) — worth a look | — |
| Cards dealt | 7 | `handSize` |

## Safeguards (not rules)

- **Round turn limit (250 turns):** in rare games nobody can shed cards and the round
  never ends. The round then ends and the lowest hand counts as having gone out.
  In 3,300 simulated rounds with default rules this never triggered.
- If everyone left would be knocked out in the same round (only possible after the
  safeguard above), the lowest total survives.
- "One hand decides" scoring can make matches very long, since few single hands
  reach 100. The app warns about this when it's selected.
