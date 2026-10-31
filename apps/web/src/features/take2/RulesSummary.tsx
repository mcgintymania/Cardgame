import React from 'react';
import { UNCONFIRMED_SETTINGS, type Take2Config } from '../../../../../packages/engine/src/take2/config.ts';
import { Tag } from '../../design/ui.tsx';
import { ValuesTable } from './RulesEditor.tsx';

export function RulesSummary({ config: c }: { config: Take2Config }) {
  const P = ({ k }: { k: keyof Take2Config }) => (UNCONFIRMED_SETTINGS.includes(k) ? <Tag tone="warn">Proposed</Tag> : null);
  const items: Array<[React.ReactNode, keyof Take2Config | null]> = [
    [c.matchRule === 'suitOrRank' ? 'Play a card of the same suit or number.' : 'Play a card of the same suit.', 'matchRule'],
    [`${c.whenStuck === 'drawOne' ? "Can't (or won't) play? Pick up one." : "Can't play? Pick up until a card fits."} ${c.playDrawnCard ? 'You may play it if it fits.' : 'That ends your turn.'}`, 'whenStuck'],
    [c.lastCardCall ? `Announce "last card" when you're down to one. Go out without announcing and it doesn't count: pick up ${c.lastCardPenalty}.` : 'No need to announce your last card.', 'lastCardPenalty'],
    [c.noFinishOnJack ? "You can't finish on a Jack." : 'You can finish on any card.', null],
    [c.mustPlayIfAble ? 'You must play if you can.' : 'You may draw even when you could play.', 'mustPlayIfAble'],
    [`A 2 makes the next player pick up ${c.twoDrawAmount}.${c.twoStacking ? ' 2s stack: answer with a 2 to pass it on.' : ''}`, 'twoStacking'],
    [c.penaltyEndsTurn ? 'Picking up a penalty ends your turn.' : 'After picking up a penalty you still play.', 'penaltyEndsTurn'],
    [c.eightSkips ? `An 8 makes the next player miss a turn.${c.eightStacking ? ' Another 8 passes the skip on.' : ''}` : '8s have no action.', 'eightStacking'],
    [c.jackAction === 'changeSuit' ? 'A Jack lets you call the next suit.' : c.jackAction === 'reverse' ? 'A Jack reverses the direction of play.' : 'Jacks have no action.', null],
    [c.jackWild ? 'A Jack can go on any card.' : 'A Jack must match like any other card.', 'jackWild'],
    [c.finishingActionApplies ? 'Going out on a 2 still makes the next player pick up.' : 'Going out on a 2 has no effect.', 'finishingActionApplies'],
    [c.scoringMode === 'cumulative' ? `When someone goes out, everyone else adds their hand to their total. Reach ${c.eliminationAt}${c.eliminateOnExact ? '' : ' (more than)'} and you're out.` : `Only the current hand counts. A hand worth ${c.eliminationAt}${c.eliminateOnExact ? '+' : ' or more'} knocks you out.`, 'scoringMode'],
  ];
  return (
    <div className="rules-summary">
      <ul>
        {items.map(([text, k], i) => (
          <li key={i}>{text} {k && <P k={k} />}</li>
        ))}
      </ul>
      <ValuesTable values={c.scoring.values} multiplier={c.scoring.twoScoring === 'multiplier'} />
    </div>
  );
}
