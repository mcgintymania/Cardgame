// The club's dealer. Stands behind the table on big screens (Blackjack, Hold'em,
// Five-Card Draw) and says the odd word as the game goes. Purely presentation:
// the dealer never decides anything, the rules engine does.

import React, { useEffect, useRef, useState } from 'react';
import { Character, DEFAULT_LOOK, type Look, type Pose } from './Character.tsx';
import { useSeason } from '../lib/useSeason.ts';

export const DEALER_NAME = 'Lou';

export const DEALER_LOOK: Look = {
  ...DEFAULT_LOOK,
  skin: '#c48a5e',
  build: 'regular',
  hair: 'slick',
  hairColor: '#2a1c14',
  eyes: 'round',
  brows: 'soft',
  mouth: 'smile',
  facialHair: 'moustache',
  backdrop: '#1f3a2c',
  wear: { top: 'shirt-white', jacket: 'vest-dealer', neck: 'bowtie-black', legs: 'trousers-black', shoes: 'oxford-black', hat: 'visor-green' },
};

export interface DealerLine { id: number; text: string }

/** Lines and poses for the dealer, driven by the table's events. */
export function useDealer() {
  const [line, setLine] = useState<DealerLine | null>(null);
  const [pose, setPose] = useState<Pose>('idle');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const n = useRef(1);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const say = (text: string, p: Pose = 'idle', ms = 2600) => {
    const id = n.current++;
    setLine({ id, text });
    setPose(p);
    timers.current.push(setTimeout(() => setLine((l: DealerLine | null) => (l && l.id === id ? null : l)), ms));
    timers.current.push(setTimeout(() => setPose('idle'), Math.min(ms, 1400)));
  };
  const gesture = (p: Pose, ms = 900) => {
    setPose(p);
    timers.current.push(setTimeout(() => setPose('idle'), ms));
  };
  return { line, pose, say, gesture };
}

export function Dealer({ line, pose }: { line: DealerLine | null; pose: Pose }) {
  const season = useSeason();
  const look = season?.dealerHat ? { ...DEALER_LOOK, wear: { ...DEALER_LOOK.wear, hat: season.dealerHat } } : DEALER_LOOK;
  return (
    <div className="dealer" aria-live="polite">
      <div className="dealer-figure"><Character look={look} pose={pose} animate width="100%" height="100%" noShadow title={`${DEALER_NAME}, the dealer`} /></div>
      {line && <p className="dealer-says" key={line.id}><b>{DEALER_NAME}</b> {line.text}</p>}
    </div>
  );
}
