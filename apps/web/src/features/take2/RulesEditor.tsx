import React from 'react';
import type { Rank } from '../../../../../packages/engine/src/core/cards.ts';
import { UNCONFIRMED_SETTINGS, type Take2Config } from '../../../../../packages/engine/src/take2/config.ts';
import { Segmented, Stepper, Tag, Toggle } from '../../design/ui.tsx';

const Proposed = ({ k }: { k: keyof Take2Config }) =>
  UNCONFIRMED_SETTINGS.includes(k) ? <Tag tone="warn">Proposed</Tag> : null;

export function RulesEditor({ value, onChange }: { value: Take2Config; onChange: (c: Take2Config) => void }) {
  const set = (patch: Partial<Take2Config>) => onChange({ ...value, ...patch });
  const v = value;
  return (
    <div className="rules">
      {UNCONFIRMED_SETTINGS.length > 0 && (
        <p className="rules-legend">
          <Tag tone="warn">Proposed</Tag> marks a default that hasn't been confirmed yet.
        </p>
      )}

      <h3 className="rules-h">Playing cards</h3>
      <Segmented id="r-match" label="What can you play?" tag={<Proposed k="matchRule" />} value={v.matchRule}
        hint="Onto the top card of the discard pile."
        options={[{ value: 'suitOrRank', label: 'Same suit or number' }, { value: 'suitOnly', label: 'Same suit only' }]}
        onChange={(matchRule) => set({ matchRule })} />
      <Segmented id="r-stuck" label="Can't play?" tag={<Proposed k="whenStuck" />} value={v.whenStuck}
        hint={v.playDrawnCard ? 'You may play the card you drew if it fits.' : 'Then your turn is over.'}
        options={[{ value: 'drawOne', label: 'Draw one' }, { value: 'drawUntilPlayable', label: 'Draw until it fits' }]}
        onChange={(whenStuck) => set({ whenStuck })} />
      <Toggle id="r-playdrawn" label="Play a card you pick up" checked={v.playDrawnCard}
        hint="Off: picking up ends your turn." onChange={(playDrawnCard) => set({ playDrawnCard })} />
      <Toggle id="r-lastcall" label="Announce last card" checked={v.lastCardCall}
        hint="Going out without announcing doesn't count." onChange={(lastCardCall) => set({ lastCardCall })} />
      {v.lastCardCall && (
        <Stepper id="r-lastpen" label="Pick up for not announcing" tag={<Proposed k="lastCardPenalty" />} value={v.lastCardPenalty} min={1} max={5}
          onChange={(lastCardPenalty) => set({ lastCardPenalty })} />
      )}
      <Toggle id="r-nojack" label="Can't finish on a Jack" checked={v.noFinishOnJack} onChange={(noFinishOnJack) => set({ noFinishOnJack })} />
      <Toggle id="r-must" label="Must play if you can" tag={<Proposed k="mustPlayIfAble" />} checked={v.mustPlayIfAble}
        hint="Off: you may draw instead, even holding a playable card." onChange={(mustPlayIfAble) => set({ mustPlayIfAble })} />
      <Stepper id="r-hand" label="Cards dealt" value={v.handSize} min={3} max={10} onChange={(handSize) => set({ handSize })} />

      <h3 className="rules-h">Action cards</h3>
      <Stepper id="r-two" label="A 2 makes the next player draw" value={v.twoDrawAmount} min={1} max={5}
        onChange={(twoDrawAmount) => set({ twoDrawAmount })} />
      <Toggle id="r-stack" label="2s stack" tag={<Proposed k="twoStacking" />} checked={v.twoStacking}
        hint="Answer a 2 with a 2 to pass the growing penalty on." onChange={(twoStacking) => set({ twoStacking })} />
      <Toggle id="r-penturn" label="Taking a penalty ends your turn" tag={<Proposed k="penaltyEndsTurn" />} checked={v.penaltyEndsTurn}
        onChange={(penaltyEndsTurn) => set({ penaltyEndsTurn })} />
      <Toggle id="r-eight" label="An 8 skips the next player" checked={v.eightSkips} onChange={(eightSkips) => set({ eightSkips })} />
      <Toggle id="r-eightstack" label="An 8 can pass a skip on" tag={<Proposed k="eightStacking" />} checked={v.eightStacking}
        onChange={(eightStacking) => set({ eightStacking })} />
      <Segmented id="r-jack" label="A Jack…" value={v.jackAction}
        options={[{ value: 'changeSuit', label: 'Changes suit' }, { value: 'reverse', label: 'Reverses play' }, { value: 'none', label: 'Does nothing' }]}
        onChange={(jackAction) => set({ jackAction })} />
      <Toggle id="r-wild" label="A Jack can go on any card" tag={<Proposed k="jackWild" />} checked={v.jackWild}
        onChange={(jackWild) => set({ jackWild })} />
      <Toggle id="r-finish" label="Going out on a 2 still hits the next player" tag={<Proposed k="finishingActionApplies" />}
        checked={v.finishingActionApplies} hint="They draw before hands are scored." onChange={(finishingActionApplies) => set({ finishingActionApplies })} />
      <Segmented id="r-flip" label="First card turned is a 2, 8 or Jack" tag={<Proposed k="flipActionOnStart" />} value={v.flipActionOnStart}
        options={[{ value: 'reflip', label: 'Turn another' }, { value: 'ignore', label: 'Leave it, no effect' }]}
        onChange={(flipActionOnStart) => set({ flipActionOnStart })} />

      <h3 className="rules-h">Scoring and knockout</h3>
      <Segmented id="r-twos" label="2s in your hand" value={v.scoring.twoScoring}
        options={[{ value: 'multiplier', label: 'Double the hand' }, { value: 'facevalue', label: 'Count as 2 points' }]}
        onChange={(twoScoring) => set({ scoring: { ...v.scoring, twoScoring } })} />
      <Segmented id="r-mode" label="Points" tag={<Proposed k="scoringMode" />} value={v.scoringMode}
        options={[{ value: 'cumulative', label: 'Add up across rounds' }, { value: 'singleHand', label: 'One hand decides' }]}
        hint={v.scoringMode === 'singleHand' ? 'Matches can run very long: few single hands reach the limit.' : 'Whoever went out scores 0 for the round.'}
        onChange={(scoringMode) => set({ scoringMode })} />
      <Stepper id="r-limit" label="Knockout at" value={v.eliminationAt} min={50} max={300} step={10}
        onChange={(eliminationAt) => set({ eliminationAt })} />
      <Toggle id="r-exact" label={`Exactly ${v.eliminationAt} knocks you out`} checked={v.eliminateOnExact}
        onChange={(eliminateOnExact) => set({ eliminateOnExact })} />
      <ValuesTable values={v.scoring.values} multiplier={v.scoring.twoScoring === 'multiplier'} />
    </div>
  );
}

export function ValuesTable({ values, multiplier }: { values: Record<Rank, number>; multiplier: boolean }) {
  const cells: Array<[string, string]> = [
    ['A', String(values[1])],
    ['2', multiplier ? '×2' : String(values[2])],
    ['3–7', 'face'],
    ['8', String(values[8])],
    ['9', String(values[9])],
    ['10', String(values[10])],
    ['J', String(values[11])],
    ['Q', String(values[12])],
    ['K', String(values[13])],
  ];
  return (
    <div className="values">
      <p className="row-label">Penalty points</p>
      <div className="values-grid">
        {cells.map(([r, p]) => (
          <div key={r} className={`value-cell ${r === '2' && multiplier ? 'is-mult' : ''} ${r === 'J' ? 'is-hot' : ''}`}>
            <b>{r}</b>
            <span>{p}</span>
          </div>
        ))}
      </div>
      {multiplier && <p className="row-hint">Add up everything except 2s, then double once for each 2. 5 + 10 with two 2s = 60.</p>}
    </div>
  );
}
