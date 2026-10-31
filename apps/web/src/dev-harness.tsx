// Dev-only: renders every hair style on full and bust crops for visual checks. Not shipped.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Character, DEFAULT_LOOK, HAIR_STYLES, type Look } from './design/Character.tsx';
import { MEMBER_LOOKS } from './lib/look.ts';

const hairs: string[] = HAIR_STYLES;
function App() {
  return (
    <div style={{ background: '#1d1612', padding: 10, display: 'flex', flexWrap: 'wrap', gap: 6, width: 1400 }}>
      {hairs.map((h) => <div key={h} style={{ background: '#2a201a', color: '#fff', font: '12px sans-serif', textAlign: 'center' }}><Character look={{ ...DEFAULT_LOOK, hair: h as Look['hair'], hairColor: '#2e1d14' }} crop="bust" width={240} height={240} /><div>{h}</div></div>)}
      {hairs.map((h) => <div key={`f${h}`} style={{ background: '#2a201a' }}><Character look={{ ...DEFAULT_LOOK, hair: h as Look['hair'], hairColor: '#c99a4e' }} width={110} height={220} /></div>)}
      {['flatcap-tweed', 'beanie-red', 'fedora-black', 'beret-black', 'bowler-black', 'tophat', 'visor-green', 'crown'].map((h) => <div key={h} style={{ background: '#2a201a' }}><Character look={{ ...DEFAULT_LOOK, hair: 'curly', wear: { ...DEFAULT_LOOK.wear, hat: h } }} crop="bust" width={120} height={120} /></div>)}
      {Object.entries(MEMBER_LOOKS).map(([id, l]) => <div key={id} style={{ background: '#2a201a', color: '#fff', font: '11px sans-serif', textAlign: 'center' }}><Character look={l} crop="bust" width={90} height={90} /><div>{id}</div></div>)}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
