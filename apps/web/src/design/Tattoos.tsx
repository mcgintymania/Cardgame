// Tattoo designs. Each is drawn centred on (0, 0) inside roughly a 14 x 24 box,
// in ink (c1) with an optional accent (c2), so the same design can sit on a
// forearm, the neck or the back of a hand at different sizes.

import React from 'react';
import type { Item } from '../lib/catalogue.ts';

const STAR = 'M0 -6 L1.8 -1.8 L6.5 -1.8 L2.7 1.2 L4 6 L0 3.2 L-4 6 L-2.7 1.2 L-6.5 -1.8 L-1.8 -1.8 Z';
const SPADE = 'M0 -8 C-6 -2 -7 2 -4 4 C-2 5.5 -0.5 4.5 0 3 C0.5 4.5 2 5.5 4 4 C7 2 6 -2 0 -8 Z';
const HEART = 'M0 6 C-8 0 -7 -6 -3.5 -6 C-1.6 -6 -0.4 -4.6 0 -3.4 C0.4 -4.6 1.6 -6 3.5 -6 C7 -6 8 0 0 6 Z';
const DIAMOND = 'M0 -6 L4.4 0 L0 6 L-4.4 0 Z';

/** Text tattoos run along the arm. */
const Script = ({ text, c, size = 4.6 }: { text: string; c: string; size?: number }) => (
  <text x="0" y="0" transform="rotate(-90)" textAnchor="middle" dominantBaseline="middle" fontFamily="'Brush Script MT', 'Segoe Script', cursive" fontStyle="italic" fontSize={size} fill={c}>{text}</text>
);

export function TattooDesign({ kind, c, c2 }: { kind: string; c: string; c2?: string }) {
  const a = c2 ?? c;
  switch (kind) {
    case 'ace': return <><path d={SPADE} fill={c} /><path d="M0 2 L-2 8 H2 Z" fill={c} /></>;
    case 'rose': return <><circle cx="0" cy="-2" r="4.5" fill={c} /><path d="M-2.5 -3 Q0 -6 2.5 -3 Q0 0 -2.5 -3" stroke="#000" strokeOpacity=".3" fill="none" /><path d="M0 2 V10 M0 6 L-4 4 M0 7 L4 5" stroke={a} strokeWidth="1.4" /></>;
    case 'dice': return <><rect x="-6" y="-6" width="12" height="12" rx="2" fill="none" stroke={c} strokeWidth="1.6" transform="rotate(15)" /><circle cx="-2" cy="-2" r="1.3" fill={a} /><circle cx="2" cy="2" r="1.3" fill={a} /></>;
    case 'anchor': return <><circle cx="0" cy="-7" r="2" fill="none" stroke={c} strokeWidth="1.4" /><path d="M0 -5 V8 M-4 -2 H4 M-6 3 Q-5 9 0 8 Q5 9 6 3" stroke={c} strokeWidth="1.6" fill="none" /></>;
    case 'crown': return <path d="M-7 4 L-7 -4 L-3.5 0 L0 -6 L3.5 0 L7 -4 L7 4 Z" fill={c} />;
    case 'swallow': return <><path d="M-7 0 Q-2 -5 3 -2 L8 -7 L6 -1 L9 1 L4 1 Q0 4 -7 0 Z" fill={c} /><path d="M-3 0 Q0 -1 2 0" stroke={a} strokeWidth="1.2" /></>;
    case 'stars': return <g fill={c}>{[[-5, 2, 1], [0, -3, 0.8], [5, 3, 0.65]].map(([x, y, k], i) => <path key={i} transform={`translate(${x} ${y}) scale(${k * 0.55})`} d={STAR} />)}</g>;
    case 'skull': return <><path d="M-6 -2 C-6 -9 6 -9 6 -2 C6 2 4 3 3 4 V7 H-3 V4 C-4 3 -6 2 -6 -2 Z" fill={c} /><circle cx="-2.4" cy="-2" r="1.7" fill="#d9b48a" opacity=".85" /><circle cx="2.4" cy="-2" r="1.7" fill="#d9b48a" opacity=".85" /><path d="M-1.5 5 V7 M0 5 V7 M1.5 5 V7" stroke="#d9b48a" strokeWidth=".6" opacity=".8" /></>;
    case 'dagger': return <><path d="M0 -11 L2 3 H-2 Z" fill="none" stroke={c} strokeWidth="1.2" /><path d="M-5 3 H5" stroke={c} strokeWidth="1.8" strokeLinecap="round" /><path d="M0 3 V9" stroke={c} strokeWidth="2" /><circle cx="0" cy="10" r="1.3" fill={a} /></>;
    case 'snake': return <><path d="M-3 10 C6 7 6 2 0 0 C-6 -2 -6 -7 2 -9" stroke={c} strokeWidth="2.2" fill="none" strokeLinecap="round" /><ellipse cx="3" cy="-9.5" rx="2.4" ry="1.6" fill={c} /><path d="M5 -9.5 L7 -10.5 M5 -9.5 L7 -8.5" stroke={a} strokeWidth=".6" /></>;
    case 'compass': return <><circle r="6" fill="none" stroke={c} strokeWidth="1.2" /><path d="M0 -8.5 L1.6 0 L0 8.5 L-1.6 0 Z" fill={c} /><path d="M-8.5 0 L0 1.6 L8.5 0 L0 -1.6 Z" fill={a} opacity=".8" /></>;
    case 'heart': return <><path d={HEART} fill={a} /><path d="M-7 1 Q0 -2 7 1 L6.4 3.4 Q0 0.6 -6.4 3.4 Z" fill={c} /><path d="M-7 1 L-9 2.4 L-6.4 3.4 M7 1 L9 2.4 L6.4 3.4" fill={c} /></>;
    case 'clock': return <><circle r="6" fill="none" stroke={c} strokeWidth="1.4" /><path d="M0 -6 V-8 M-1.4 -8.6 H1.4" stroke={c} strokeWidth="1.2" /><path d="M0 0 V-4 M0 0 L3 1.6" stroke={a} strokeWidth="1" />{[0, 90, 180, 270].map((r) => <path key={r} d="M0 -5 V-4" stroke={c} strokeWidth=".8" transform={`rotate(${r})`} />)}</>;
    case 'cards': return <>{[-18, 0, 18].map((r, i) => <g key={r} transform={`rotate(${r} 0 8)`}><rect x="-3.4" y="-8" width="6.8" height="10" rx="1" fill="#efe4cf" stroke={c} strokeWidth=".7" /><path transform="translate(0 -3) scale(.32)" d={i === 1 ? HEART : SPADE} fill={i === 1 ? a : c} /></g>)}</>;
    case 'chip': return <><circle r="6.2" fill={a} /><circle r="6.2" fill="none" stroke={c} strokeWidth="1.6" strokeDasharray="2.2 1.8" /><circle r="3.2" fill="none" stroke={c} strokeWidth=".8" /></>;
    case 'koi': return <><path d="M-2 -9 C4 -6 5 2 1 6 L3 10 L-1 8 L-3 10 L-2 6 C-6 2 -6 -6 -2 -9 Z" fill={a} /><path d="M-2 -6 Q0 -2 -2 2 M1 -5 Q2 -1 0 3" stroke={c} strokeWidth=".7" fill="none" /><circle cx="-1" cy="-7" r=".7" fill={c} /></>;
    case 'moon': return <><path d="M2 -8 A8 8 0 1 0 2 8 A10 10 0 0 1 2 -8 Z" fill={c} /><path transform="translate(5 -4) scale(.3)" d={STAR} fill={a} /><path transform="translate(6 3) scale(.22)" d={STAR} fill={a} /></>;
    case 'butterfly': return <><path d="M0 -2 C-3 -9 -9 -8 -7 -2 C-6 1 -3 1 0 0 Z M0 -2 C3 -9 9 -8 7 -2 C6 1 3 1 0 0 Z" fill={c} /><path d="M0 0 C-3 1 -7 3 -5 6 C-3 7 -1 4 0 2 Z M0 0 C3 1 7 3 5 6 C3 7 1 4 0 2 Z" fill={a} /><path d="M0 -3 V5" stroke={c} strokeWidth="1" /></>;
    case 'feather': return <><path d="M1 -10 C6 -4 5 4 -1 9 C-4 4 -4 -4 1 -10 Z" fill="none" stroke={c} strokeWidth="1" /><path d="M1 -10 Q0 0 -2 11" stroke={c} strokeWidth=".9" fill="none" />{[-6, -3, 0, 3, 6].map((y) => <path key={y} d={`M${-0.2 - y * 0.08} ${y} L3 ${y - 2.4} M${-0.2 - y * 0.08} ${y} L-2.8 ${y - 2}`} stroke={c} strokeWidth=".5" />)}</>;
    case 'wave': return <><path d="M-7 6 C-7 -2 -2 -8 4 -6 C0 -5 -1 -2 1 0 C2 -2 5 -2 6 0" stroke={c} strokeWidth="1.4" fill="none" strokeLinecap="round" /><path d="M-8 8 Q-4 5 0 8 Q4 11 8 8" stroke={a} strokeWidth="1.2" fill="none" /></>;
    case 'mountain': return <><path d="M-8 6 L-3 -3 L0 1 L3 -6 L8 6 Z" fill="none" stroke={c} strokeWidth="1.3" strokeLinejoin="round" /><path d="M3 -6 L1.6 -3 L3 -3.6 L4.4 -2.6 Z" fill={c} /><circle cx="-4" cy="-7" r="1.8" fill={a} /></>;
    case 'tribal': return <path d="M-8 -3 Q-4 -7 0 -3 Q4 1 8 -3 L8 3 Q4 7 0 3 Q-4 -1 -8 3 Z M-8 -8 L-6 -5 M8 8 L6 5" fill={c} stroke={c} strokeWidth=".8" />;
    case 'geometric': return <><path d="M0 -9 L8 5 H-8 Z" fill="none" stroke={c} strokeWidth="1" /><path d="M0 -3 L4 4 H-4 Z" fill="none" stroke={c} strokeWidth=".8" /><circle cy="2" r="1.4" fill={a} /><path d="M0 -9 V-11 M0 5 V9" stroke={c} strokeWidth=".8" /></>;
    case 'script-lucky': return <Script text="Lucky" c={c} />;
    case 'script-allin': return <Script text="All in" c={c} />;
    case 'script-family': return <Script text="Family" c={c} />;
    case 'web': return <g stroke={c} strokeWidth=".7" fill="none">{[0, 45, 90, 135].map((r) => <path key={r} d="M0 -8 V8" transform={`rotate(${r})`} />)}{[3, 5.5, 8].map((r) => <polygon key={r} points={Array.from({ length: 8 }, (_, i) => `${(Math.sin((i * Math.PI) / 4) * r).toFixed(2)},${(-Math.cos((i * Math.PI) / 4) * r).toFixed(2)}`).join(' ')} />)}</g>;
    case 'note': return <><path d="M-1 6 V-7 L6 -9 V4" stroke={c} strokeWidth="1.3" fill="none" /><ellipse cx="-3" cy="6" rx="2.6" ry="2" fill={c} /><ellipse cx="4" cy="4" rx="2.6" ry="2" fill={c} /></>;
    case 'sevens': return <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" fontFamily="Georgia, serif" fontWeight="700" fontSize="8" fill={c}>777</text>;
    case 'barcode': return <g fill={c}>{[0, 1.6, 2.6, 4.4, 5.4, 7, 8.6, 9.6, 11.4].map((x, i) => <rect key={i} x={x - 6} y="-3" width={i % 3 ? 0.7 : 1.2} height="6" />)}</g>;
    case 'eightball': return <><circle r="6" fill={c} /><circle cx="-1" cy="-1" r="2.6" fill="#efe4cf" /><text x="-1" y="-0.6" textAnchor="middle" dominantBaseline="middle" fontSize="3.4" fontWeight="700" fill={c}>8</text></>;
    case 'clover': return <g fill={c}>{[0, 90, 180, 270].map((r) => <path key={r} transform={`rotate(${r})`} d="M0 0 C-3 -1.6 -3.6 -5.6 -1.4 -6.2 C-0.4 -6.4 0 -5.6 0 -5 C0 -5.6 0.4 -6.4 1.4 -6.2 C3.6 -5.6 3 -1.6 0 0 Z" />)}<path d="M0 0 Q1 5 3 8" stroke={c} strokeWidth="1" fill="none" /></g>;
    case 'bolt': return <path d="M2 -10 L-5 1 H0 L-2 10 L5 -2 H0 Z" fill={c} />;
    case 'suits': return <g>{[[-7.5, SPADE, c], [-2.5, HEART, a], [2.5, DIAMOND, a], [7.5, SPADE, c]].map(([x, d, col], i) => <g key={i} transform={`translate(${x} 0) scale(.42)`}>{i === 3 ? <><circle cx="0" cy="-3.4" r="2.7" fill={col as string} /><circle cx="-3" cy="0.6" r="2.7" fill={col as string} /><circle cx="3" cy="0.6" r="2.7" fill={col as string} /><path d="M0 0 L-1.6 6 H1.6 Z" fill={col as string} /></> : <path d={d as string} fill={col as string} />}</g>)}</g>;
    case 'lion': return <><g fill={a}>{Array.from({ length: 10 }, (_, i) => <circle key={i} cx={Math.sin((i * Math.PI) / 5) * 6} cy={-Math.cos((i * Math.PI) / 5) * 6} r="2.6" />)}</g><circle r="4.6" fill={c} /><path d="M-1.6 -1 h0.01 M1.6 -1 h0.01" stroke="#efe4cf" strokeWidth="1.2" strokeLinecap="round" /><path d="M0 0.4 L-1 1.8 H1 Z M-1.4 2.8 Q0 3.8 1.4 2.8" fill="#efe4cf" stroke="#efe4cf" strokeWidth=".4" /></>;
    case 'royal': return <>{[-24, -12, 0, 12, 24].map((r, i) => <g key={r} transform={`rotate(${r} 0 9)`}><rect x="-3" y="-8" width="6" height="9" rx="1" fill="#efe4cf" stroke={c} strokeWidth=".6" /><text x="0" y="-4.6" textAnchor="middle" fontSize="3" fontWeight="700" fill={a}>{['10', 'J', 'Q', 'K', 'A'][i]}</text></g>)}</>;
    default: return <circle r="4" fill={c} />;
  }
}

/** Whole-forearm sleeve (only on the arm). */
export function SleeveBands({ x, y, c, c2 }: { x: number; y: number; c: string; c2?: string }) {
  return <g opacity=".8"><path d={`M${x - 9} ${y - 18} Q${x} ${y - 12} ${x + 9} ${y - 18} M${x - 9} ${y - 8} Q${x} ${y - 2} ${x + 9} ${y - 8} M${x - 9} ${y + 2} Q${x} ${y + 8} ${x + 9} ${y + 2} M${x - 9} ${y + 12} Q${x} ${y + 18} ${x + 9} ${y + 12}`} stroke={c} strokeWidth="2.6" fill="none" /><circle cx={x} cy={y - 3} r="3.4" fill={c2 ?? c} /></g>;
}

/** Place a design: forearm (full size), neck (small), hand (smaller). */
export function TattooAt({ item, x, y, scale = 1, rotate = 0 }: { item: Item; x: number; y: number; scale?: number; rotate?: number }) {
  if (item.kind === 'sleeve') return <SleeveBands x={x} y={y} c={item.c1} c2={item.c2} />;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`} opacity=".86">
      <TattooDesign kind={item.kind} c={item.c1} c2={item.c2} />
    </g>
  );
}

/** Shop and wardrobe thumbnail: the design big, on a patch of skin. */
export function TattooArt({ item, skin, size = '100%' }: { item: Item; skin: string; size?: number | string }) {
  return (
    <svg viewBox="-14 -14 28 28" width={size} height={size} aria-hidden="true" className="tattoo-art">
      <rect x="-14" y="-14" width="28" height="28" fill={skin} />
      <g opacity=".9">{item.kind === 'sleeve' ? <SleeveBands x={0} y={0} c={item.c1} c2={item.c2} /> : <TattooDesign kind={item.kind} c={item.c1} c2={item.c2} />}</g>
    </svg>
  );
}
