// Full-body layered character, drawn in SVG from a Look (body + face + hair + items).
// The same drawing is cropped to a head-and-shoulders bust for table seats.
//
// Coordinate system: viewBox 0 0 200 400, figure centred on x = 100, feet at y ≈ 382.

import React, { useContext, useEffect, useId, useRef, useState } from 'react';
import { getItem, type Item, type WearSlot } from '../lib/catalogue.ts';
import { TattooAt } from './Tattoos.tsx';

export type HairStyle = 'short' | 'slick' | 'quiff' | 'curly' | 'afro' | 'long' | 'bob' | 'ponytail' | 'bun' | 'buzz' | 'bald' | 'mohawk' | 'undercut';
export type Build = 'slim' | 'regular' | 'broad';
export type Eyes = 'round' | 'narrow' | 'wide' | 'sleepy';
export type Brows = 'soft' | 'arched' | 'bold';
export type Mouth = 'smile' | 'grin' | 'smirk' | 'neutral';
export type FacialHair = 'none' | 'stubble' | 'moustache' | 'beard' | 'goatee' | 'bigbeard';
export type Pose = 'idle' | 'wave' | 'thumbs' | 'clap' | 'cheer' | 'shrug' | 'tiphat' | 'facepalm' | 'fistpump' | 'deal' | 'present' | 'rest';

export interface Look {
  v: 2;
  skin: string;
  build: Build;
  hair: HairStyle;
  hairColor: string;
  eyes: Eyes;
  brows: Brows;
  mouth: Mouth;
  facialHair: FacialHair;
  /** Iris colour (Lounge style). Defaults from the hair colour. */
  eyeColor?: string;
  backdrop: string;
  wear: Partial<Record<WearSlot, string>>;
}

export interface Extras {
  /** Gold stars on the champion's jacket sleeve. */
  stars?: number;
  /** Wear a championship belt (currently holding a title). */
  belt?: boolean;
}

export const SKIN_TONES = ['#f6dcc4', '#ecc4a0', '#d9a77e', '#c48a5e', '#a86d43', '#8a5232', '#6b3d24', '#4a2a18'];
export const HAIR_COLORS = ['#141010', '#2e1d14', '#4a2e1c', '#7a4a24', '#a8743a', '#d4a858', '#e6d6a8', '#b8b2a6', '#ece6dc', '#8d2f23', '#3a4a7a', '#7a3a7a'];
export const BACKDROPS = ['#3b2b22', '#2a3a33', '#33293d', '#3d2f1f', '#22303d', '#3d2226'];
export const HAIR_STYLES: HairStyle[] = ['short', 'slick', 'quiff', 'undercut', 'curly', 'afro', 'long', 'bob', 'ponytail', 'bun', 'mohawk', 'buzz', 'bald'];
export const HAIR_LABEL: Record<HairStyle, string> = {
  short: 'Short', slick: 'Slicked', quiff: 'Quiff', curly: 'Curly', afro: 'Afro', long: 'Long', bob: 'Bob', ponytail: 'Ponytail', bun: 'Bun', buzz: 'Buzz cut', bald: 'Shaved', mohawk: 'Mohawk', undercut: 'Undercut',
};
export const BUILDS: Build[] = ['slim', 'regular', 'broad'];
export const EYES: Eyes[] = ['round', 'narrow', 'wide', 'sleepy'];
export const BROWS: Brows[] = ['soft', 'arched', 'bold'];
export const MOUTHS: Mouth[] = ['smile', 'grin', 'smirk', 'neutral'];
export const FACIAL_HAIR: FacialHair[] = ['none', 'stubble', 'moustache', 'goatee', 'beard', 'bigbeard'];

export const DEFAULT_LOOK: Look = {
  v: 2, skin: SKIN_TONES[2], build: 'regular', hair: 'short', hairColor: HAIR_COLORS[2], eyes: 'round', brows: 'soft',
  mouth: 'smile', facialHair: 'none', backdrop: BACKDROPS[0],
  wear: { top: 'shirt-white', jacket: 'blazer-navy', legs: 'trousers-charcoal', shoes: 'oxford-black', neck: 'tie-red' },
};

// --------------------------------------------------------------------------- helpers

function shade(hex: string, amt: number): string {
  // amt -1..1: darken/lighten
  const n = hex.replace('#', '');
  const full = n.length === 3 ? n.split('').map((c) => c + c).join('') : n;
  const num = parseInt(full, 16);
  let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const DIMS: Record<Build, { s: number; w: number; h: number }> = {
  slim: { s: 43, w: 34, h: 38 },
  regular: { s: 50, w: 41, h: 43 },
  broad: { s: 58, w: 50, h: 48 },
};

interface ArmPose { s: number; e: number }
export const POSES: Record<Pose, { l: ArmPose; r: ArmPose; mouth?: Mouth | 'open' | 'frown'; hatLift?: boolean }> = {
  idle: { l: { s: 7, e: -6 }, r: { s: 7, e: -6 } },
  wave: { l: { s: 7, e: -6 }, r: { s: 150, e: 22 }, mouth: 'grin' },
  thumbs: { l: { s: 7, e: -6 }, r: { s: 31, e: -132 }, mouth: 'smile' },
  clap: { l: { s: 17, e: -113 }, r: { s: 17, e: -113 }, mouth: 'grin' },
  cheer: { l: { s: 158, e: 10 }, r: { s: 158, e: 10 }, mouth: 'open' },
  shrug: { l: { s: 38, e: -95 }, r: { s: 38, e: -95 }, mouth: 'smirk' },
  tiphat: { l: { s: 7, e: -6 }, r: { s: 157, e: 65 }, mouth: 'smirk', hatLift: true },
  facepalm: { l: { s: 7, e: -6 }, r: { s: 152, e: 116 }, mouth: 'frown' },
  fistpump: { l: { s: 7, e: -6 }, r: { s: 168, e: 0 }, mouth: 'open' },
  // Dealer only: hands out over the table, and an open palm towards a winner.
  deal: { l: { s: 24, e: -78 }, r: { s: 24, e: -78 }, mouth: 'smile' },
  present: { l: { s: 7, e: -6 }, r: { s: 82, e: -18 }, mouth: 'grin' },
  // Seated at the table: forearms resting forward on the rail.
  rest: { l: { s: 12, e: -52 }, r: { s: 12, e: -52 } },
};

/** Animated arm angles: eases between poses; waves wiggle. */
function usePoseAngles(pose: Pose, animate: boolean) {
  const target = POSES[pose] ?? POSES.idle;
  const [cur, setCur] = useState({ l: target.l, r: target.r });
  const curRef = useRef(cur);
  curRef.current = cur;
  useEffect(() => {
    if (!animate) { setCur({ l: target.l, r: target.r }); return undefined; }
    let raf = 0;
    const start = performance.now();
    const from = curRef.current;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 320);
      const k = 1 - (1 - t) ** 3;
      let r = { s: lerp(from.r.s, target.r.s, k), e: lerp(from.r.e, target.r.e, k) };
      let l = { s: lerp(from.l.s, target.l.s, k), e: lerp(from.l.e, target.l.e, k) };
      const wob = Math.sin((now - start) / 110);
      if (t >= 1 && pose === 'wave') r = { s: target.r.s, e: target.r.e + wob * 18 };
      if (t >= 1 && pose === 'clap') { const c = Math.abs(Math.sin((now - start) / 120)) * 8; l = { s: target.l.s + c, e: target.l.e - c }; r = { s: target.r.s + c, e: target.r.e - c }; }
      if (t >= 1 && (pose === 'cheer' || pose === 'fistpump')) { const b = wob * 6; l = { s: target.l.s + b, e: target.l.e }; r = { s: target.r.s - b, e: target.r.e }; }
      setCur({ l, r });
      if (t < 1 || pose === 'wave' || pose === 'clap' || pose === 'cheer' || pose === 'fistpump') raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pose, animate]);
  return cur;
}

// ------------------------------------------------------------------------------ parts

function HairBack({ look }: { look: Look }) {
  const c = look.hairColor;
  switch (look.hair) {
    case 'long': return <path d="M66 60 C62 26 138 26 134 60 L140 150 C128 158 114 150 112 136 L88 136 C86 150 72 158 60 150 Z" fill={c} />;
    case 'bob': return <path d="M66 62 C62 26 138 26 134 62 L138 104 C130 112 118 110 114 104 L86 104 C82 110 70 112 62 104 Z" fill={c} />;
    case 'afro': return <circle cx="100" cy="56" r="47" fill={c} />;
    case 'ponytail': return <path d="M126 50 C150 56 150 104 138 128 C132 112 132 82 124 66 Z" fill={c} />;
    case 'bun': return <circle cx="100" cy="27" r="13" fill={c} />;
    default: return null;
  }
}

// Every front style starts from a cap that sits OUTSIDE the skull (the head's
// top is at y=33; caps peak around y=27) so no skin can show above the hair.
const CAP = 'M66.5 66 C62 15 138 15 133.5 66';

function HairFront({ look, underHat }: { look: Look; underHat?: boolean }) {
  const c = look.hairColor;
  const hi = shade(c, 0.18);
  const lo = shade(c, -0.18);
  if (underHat) {
    // Only the sides show below a hat brim.
    if (look.hair === 'bald') return null;
    return <g fill={c} opacity={look.hair === 'buzz' ? 0.8 : 1}><path d="M67 70 C66 60 67 54 70 49 L75 50 C72 56 71 62 70.5 70 Z" /><path d="M133 70 C134 60 133 54 130 49 L125 50 C128 56 129 62 129.5 70 Z" /></g>;
  }
  switch (look.hair) {
    case 'short':
      return <g><path d={`${CAP} C130 52 120 44 106 45 C94 41 80 46 66.5 66 Z`} fill={c} /><path d="M80 36 C90 30 108 29 120 34" stroke={hi} strokeWidth="1.4" fill="none" opacity=".55" /></g>;
    case 'slick':
      return <g><path d="M66.5 63 C62 15 138 15 133.5 62 C127 46 112 40 88 47 C78 50 71 55 66.5 63 Z" fill={c} /><path d="M78 40 C94 30 116 29 128 40 M82 46 C98 37 114 36 126 44" stroke={hi} strokeWidth="1.4" fill="none" opacity=".6" /></g>;
    case 'quiff':
      return <g><path d="M66.5 64 C60 28 80 4 108 9 C132 13 141 34 133.5 62 C128 47 115 43 100 45 C87 47 75 51 66.5 64 Z" fill={c} /><path d="M86 22 C96 12 116 12 126 24" stroke={hi} strokeWidth="1.6" fill="none" opacity=".55" /></g>;
    case 'curly':
      return (
        <g fill={c}>
          <path d={`${CAP} C130 52 118 46 100 46 C82 46 70 52 66.5 66 Z`} />
          {[[68, 62], [68, 48], [75, 36], [86, 27], [100, 24], [114, 27], [125, 36], [132, 48], [132, 62], [86, 42], [100, 38], [114, 42]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9" />)}
          {[[80, 32], [100, 30], [120, 32]].map(([x, y], i) => <circle key={`h${i}`} cx={x} cy={y} r="3" fill={hi} opacity=".5" />)}
        </g>
      );
    case 'afro':
      return <g><path d={`${CAP} C128 52 116 47 100 47 C84 47 72 52 66.5 66 Z`} fill={c} /><path d="M70 50 C80 44 120 44 130 50" stroke={lo} strokeWidth="1.2" fill="none" opacity=".5" /></g>;
    case 'long':
      return <g><path d={`${CAP} C128 50 114 42 101 44 C99 40 86 42 66.5 66 Z`} fill={c} /><path d="M101 44 C100 36 99 30 98 24" stroke={lo} strokeWidth="1.2" fill="none" opacity=".6" /></g>;
    case 'bob':
      return <path d="M66.5 72 C62 15 138 15 133.5 72 C132 62 129 55 123 53 L77 53 C71 55 68 62 66.5 72 Z" fill={c} />;
    case 'ponytail':
    case 'bun':
      return <g><path d={`${CAP} C128 50 117 41 100 41 C83 41 72 50 66.5 66 Z`} fill={c} /><path d="M78 40 C90 32 110 32 122 40" stroke={hi} strokeWidth="1.2" fill="none" opacity=".5" /></g>;
    case 'mohawk':
      return (
        <g>
          <path d="M68.5 62 C65 19 135 19 131.5 62 C126 47 114 41 100 41 C86 41 74 47 68.5 62 Z" fill={c} opacity=".35" />
          <path d="M89 46 C86 26 90 8 96 -4 C98 4 99 0 101 -8 C103 2 104 -2 106 -4 C111 8 114 26 111 46 C106 42 94 42 89 46 Z" fill={c} />
          <path d="M96 4 C95 18 95 30 96 42 M104 2 C105 18 105 30 104 42" stroke={hi} strokeWidth="1.2" fill="none" opacity=".5" />
        </g>
      );
    case 'undercut':
      return (
        <g>
          <path d="M68.5 64 C65 22 135 22 131.5 64 C126 50 114 45 100 45 C86 45 74 50 68.5 64 Z" fill={c} opacity=".45" />
          <path d="M70 50 C68 24 92 10 116 14 C134 18 140 32 132 46 C126 38 112 34 98 38 C86 40 76 44 70 50 Z" fill={c} />
          <path d="M80 30 C94 20 116 18 130 30" stroke={hi} strokeWidth="1.3" fill="none" opacity=".55" />
        </g>
      );
    case 'buzz':
      return <path d="M68.5 62 C65 19 135 19 131.5 62 C126 47 114 41 100 41 C86 41 74 47 68.5 62 Z" fill={c} opacity=".8" />;
    default:
      return <ellipse cx="92" cy="42" rx="10" ry="4" fill="#fff" opacity=".14" />;
  }
}

function Face({ look, mouth }: { look: Look; mouth: Mouth | 'open' | 'frown' }) {
  const ink = '#22170f';
  const brow = look.hair === 'bald' ? shade(look.skin, -0.45) : look.hairColor === '#ece6dc' || look.hairColor === '#e6d6a8' ? shade(look.hairColor, -0.35) : look.hairColor;
  const eye = (x: number) => {
    switch (look.eyes) {
      case 'narrow': return <ellipse cx={x} cy="71" rx="3.6" ry="2" fill={ink} />;
      case 'wide': return <g><ellipse cx={x} cy="71" rx="4.4" ry="4.6" fill="#fbf7ee" /><circle cx={x} cy="71.6" r="2.6" fill={ink} /><circle cx={x + 0.9} cy="70.4" r=".8" fill="#fff" /></g>;
      case 'sleepy': return <g><ellipse cx={x} cy="72" rx="3.4" ry="2.6" fill={ink} /><path d={`M${x - 4.4} 70.4 Q${x} 68 ${x + 4.4} 70.4`} stroke={shade(look.skin, -0.25)} strokeWidth="2.2" fill="none" /></g>;
      default: return <g><ellipse cx={x} cy="71" rx="3.2" ry="3.7" fill={ink} /><circle cx={x + 1} cy="69.8" r=".9" fill="#fff" /></g>;
    }
  };
  const browW = look.brows === 'bold' ? 2.8 : 1.6;
  const browD = (x: number, dir: 1 | -1) =>
    look.brows === 'arched'
      ? `M${x - 6 * dir} 63 Q${x} 57.5 ${x + 6 * dir} 62`
      : `M${x - 6 * dir} 62.5 Q${x} 60 ${x + 6 * dir} 62`;
  let m: React.ReactNode;
  switch (mouth) {
    case 'grin': m = <g><path d="M90 87 Q100 98 110 87 Z" fill="#5c2b22" /><path d="M91.5 87.6 Q100 90 108.5 87.6 L108 89 Q100 91 92 89 Z" fill="#fbf7ee" /></g>; break;
    case 'open': m = <ellipse cx="100" cy="90" rx="6" ry="5.5" fill="#5c2b22" />; break;
    case 'smirk': m = <path d="M92 89 Q101 91 108 86" stroke="#5c2b22" strokeWidth="1.8" fill="none" strokeLinecap="round" />; break;
    case 'neutral': m = <path d="M93 89 L107 89" stroke="#5c2b22" strokeWidth="1.8" strokeLinecap="round" />; break;
    case 'frown': m = <path d="M93 91 Q100 86 107 91" stroke="#5c2b22" strokeWidth="1.8" fill="none" strokeLinecap="round" />; break;
    default: m = <path d="M92 87 Q100 94 108 87" stroke="#5c2b22" strokeWidth="1.9" fill="none" strokeLinecap="round" />;
  }
  return (
    <g>
      {eye(89)}
      {eye(111)}
      <path d={browD(89, 1)} stroke={brow} strokeWidth={browW} fill="none" strokeLinecap="round" />
      <path d={browD(111, -1)} stroke={brow} strokeWidth={browW} fill="none" strokeLinecap="round" />
      <path d="M99 74 Q96 81 99.5 82.5" stroke={shade(look.skin, -0.3)} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <ellipse cx="82" cy="82" rx="5" ry="3" fill="#d4646a" opacity=".12" />
      <ellipse cx="118" cy="82" rx="5" ry="3" fill="#d4646a" opacity=".12" />
      {m}
    </g>
  );
}

function FacialHairLayer({ look }: { look: Look }) {
  const c = look.hairColor;
  switch (look.facialHair) {
    case 'stubble': return <path d="M72 80 Q74 100 100 103 Q126 100 128 80 Q122 96 100 98 Q78 96 72 80 Z M90 84 Q100 82 110 84 L110 86 Q100 85 90 86 Z" fill={c} opacity=".28" />;
    case 'moustache': return <path d="M88 86 Q94 81 100 84 Q106 81 112 86 Q106 86 100 86.5 Q94 86 88 86 Z" fill={c} />;
    case 'beard': return <path d="M71 74 Q72 104 100 107 Q128 104 129 74 Q126 90 116 94 Q108 86 100 87 Q92 86 84 94 Q74 90 71 74 Z M93 92 Q100 95 107 92 Q104 97 100 97 Q96 97 93 92 Z" fill={c} />;
    case 'bigbeard': return <g fill={c}><path d="M70 70 Q69 100 80 120 Q90 140 100 143 Q110 140 120 120 Q131 100 130 70 Q127 90 117 93 Q108 86 100 87 Q92 86 83 93 Q73 90 70 70 Z" /><path d="M86 87 Q93 82 100 85 Q107 82 114 87 Q107 89 100 88.5 Q93 89 86 87 Z" /></g>;
    case 'goatee': return <g fill={c}><path d="M89 86 Q100 81 111 86 Q100 85 89 86 Z" /><path d="M94 95 Q100 104 106 95 Q103 99 100 99 Q97 99 94 95 Z" /></g>;
    default: return null;
  }
}

function Hat({ item, lift }: { item: Item; lift: boolean }) {
  const c = item.c1;
  const d = shade(c, -0.25);
  const band = item.c2 ?? shade(c, -0.4);
  const y = lift ? -14 : 0;
  const g = (children: React.ReactNode) => <g transform={`translate(0 ${y}) ${lift ? 'rotate(-10 100 40)' : ''}`}>{children}</g>;
  switch (item.kind) {
    case 'flatcap': return g(<><path d="M66 52 C66 30 134 28 136 48 C132 46 124 46 120 47 L70 54 Z" fill={c} /><path d="M100 30 C118 30 130 36 136 48 L150 50 C146 44 124 36 100 30 Z" fill={d} /><path d="M70 52 L136 46" stroke={band} strokeWidth="2" /></>);
    case 'beanie': return g(<><path d="M67 58 C64 20 136 20 133 58 Z" fill={c} /><rect x="64" y="50" width="72" height="12" rx="5" fill={d} />{item.c2 && <circle cx="100" cy="22" r="7" fill={item.c2} />}<path d="M76 50 L76 30 M88 50 L88 24 M100 50 L100 22 M112 50 L112 24 M124 50 L124 30" stroke={d} strokeWidth="1.2" opacity=".5" /></>);
    case 'fedora':
    case 'trilby': {
      const brim = item.kind === 'fedora' ? 34 : 26;
      return g(<><ellipse cx="100" cy="48" rx={30 + brim / 2} ry="7" fill={d} /><path d="M72 48 C70 22 82 14 100 18 C118 14 130 22 128 48 Z" fill={c} /><path d="M92 18 Q100 26 108 18" stroke={d} strokeWidth="2" fill="none" /><rect x="72" y="38" width="56" height="8" fill={band} /></>);
    }
    case 'beret': return g(<><ellipse cx="96" cy="40" rx="38" ry="14" fill={c} transform="rotate(-8 96 40)" /><rect x="70" y="44" width="60" height="6" rx="3" fill={d} /><circle cx="96" cy="26" r="2.5" fill={d} /></>);
    case 'bowler': return g(<><ellipse cx="100" cy="48" rx="42" ry="6.5" fill={d} /><path d="M72 48 C70 14 130 14 128 48 Z" fill={c} /><rect x="72" y="40" width="56" height="6" fill={shade(c, 0.12)} /></>);
    case 'tophat': return g(<><ellipse cx="100" cy="48" rx="44" ry="7" fill={d} /><path d="M74 48 L76 -4 Q100 -9 124 -4 L126 48 Z" fill={c} /><ellipse cx="100" cy="-4" rx="24" ry="4" fill={shade(c, 0.1)} /><rect x="75" y="36" width="50" height="9" fill={band} /></>);
    case 'visor': return g(<><path d="M64 54 Q100 38 136 54 L140 62 Q100 50 60 62 Z" fill={c} opacity=".85" /><path d="M66 56 Q100 44 134 56" stroke={shade(c, -0.4)} strokeWidth="2.4" fill="none" /></>);
    case 'santa': return g(<><path d="M70 50 Q70 22 96 16 Q118 12 132 26 Q140 36 146 52 L138 54 Q132 40 124 36 L130 50 Z" fill={c} /><circle cx="144" cy="56" r="7" fill={band} /><rect x="64" y="44" width="72" height="12" rx="6" fill={band} /><path d="M66 50 H134" stroke="#000" strokeOpacity=".08" strokeWidth="4" /></>);
    case 'witch': return g(<><ellipse cx="100" cy="47" rx="46" ry="7" fill={d} /><path d="M74 47 L98 -14 Q104 -22 112 -18 Q104 -12 106 0 L126 47 Z" fill={c} /><rect x="78" y="37" width="44" height="7" fill={band} transform="skewX(-4)" /><rect x="96" y="36" width="9" height="9" fill="none" stroke="#e2bd68" strokeWidth="1.6" /></>);
    case 'wizard': return g(<><ellipse cx="100" cy="47" rx="40" ry="6" fill={d} /><path d="M72 47 L100 -22 L128 47 Z" fill={c} />{[[94, 14, 1], [108, 28, 0.8], [92, 36, 0.7], [104, 2, 0.6]].map(([x, yy, k], i) => <path key={i} transform={`translate(${x} ${yy}) scale(${k * 0.7})`} d="M0 -6 L1.8 -1.8 L6.5 -1.8 L2.7 1.2 L4 6 L0 3.2 L-4 6 L-2.7 1.2 L-6.5 -1.8 L-1.8 -1.8 Z" fill={band} />)}</>);
    case 'gnome': return g(<><path d="M70 52 Q68 30 86 14 Q100 2 118 -6 Q112 10 124 24 Q132 36 130 52 Z" fill={c} /><path d="M70 50 Q100 42 130 50 L130 56 Q100 48 70 56 Z" fill={shade(c, -0.25)} /></>);
    case 'crown': return g(<><path d="M70 50 L72 22 L84 36 L92 16 L100 32 L108 16 L116 36 L128 22 L130 50 Z" fill={c} stroke={shade(c, -0.35)} strokeWidth="1.2" /><rect x="70" y="44" width="60" height="8" fill={shade(c, -0.15)} /><circle cx="100" cy="47" r="3" fill={item.c2} /><circle cx="84" cy="47" r="2.4" fill={item.c3} /><circle cx="116" cy="47" r="2.4" fill={item.c3} /></>);
    default: return null;
  }
}

function Glasses({ item }: { item: Item }) {
  const c = item.c1;
  switch (item.kind) {
    case 'round': return <g stroke={c} strokeWidth="1.8" fill="none"><circle cx="89" cy="71" r="7" /><circle cx="111" cy="71" r="7" /><path d="M96 71 L104 71 M82 70 L71 67 M118 70 L129 67" /></g>;
    case 'square': return <g stroke={c} strokeWidth="2.2" fill="none"><rect x="80" y="64.5" width="17" height="13" rx="2.5" /><rect x="103" y="64.5" width="17" height="13" rx="2.5" /><path d="M97 70 L103 70 M80 69 L71 67 M120 69 L129 67" /></g>;
    case 'halfmoon': return <g stroke={c} strokeWidth="1.8" fill="none"><path d="M81 72 Q89 82 97 72 Z" fill="#fff" fillOpacity=".15" /><path d="M103 72 Q111 82 119 72 Z" fill="#fff" fillOpacity=".15" /><path d="M97 72 L103 72 M81 72 L71 69 M119 72 L129 69" />{item.c2 && <path d="M72 70 Q66 100 76 118" stroke={item.c2} strokeWidth="1" strokeDasharray="1.5 2.5" />}</g>;
    case 'aviator': return <g><path d="M80 66 L97 66 Q98 78 89 80 Q80 79 80 66 Z M103 66 L120 66 Q120 79 111 80 Q102 78 103 66 Z" fill={item.c2} opacity=".85" /><path d="M80 66 L120 66 M97 67 Q100 64 103 67 M80 66 L71 66 M120 66 L129 66" stroke={c} strokeWidth="1.6" fill="none" /></g>;
    case 'shades': return <g fill={c}><rect x="79" y="65" width="18" height="11" rx="4" /><rect x="103" y="65" width="18" height="11" rx="4" /><rect x="96" y="67" width="8" height="2.4" /><path d="M79 68 L71 66 M121 68 L129 66" stroke={c} strokeWidth="2" /></g>;
    case 'mirror': return <g><rect x="79" y="65" width="18" height="11" rx="4" fill={c} /><rect x="103" y="65" width="18" height="11" rx="4" fill={c} /><path d="M81 67 L88 67 M105 67 L112 67" stroke="#fff" strokeWidth="1.6" opacity=".8" /><path d="M79 65 L121 65 M79 68 L71 66 M121 68 L129 66" stroke={item.c2} strokeWidth="1.6" fill="none" /></g>;
    case 'cateye': return <g stroke={c} strokeWidth="2.4" fill="none"><path d="M79 66 Q88 63 97 67 Q96 78 88 78 Q80 77 79 66 Z M79 66 L75 62" /><path d="M121 66 Q112 63 103 67 Q104 78 112 78 Q120 77 121 66 Z M121 66 L125 62" /><path d="M97 69 L103 69" /></g>;
    case 'monocle': return <g><circle cx="111" cy="71" r="7.5" fill="#fff" fillOpacity=".12" stroke={c} strokeWidth="2" /><path d="M116 76 Q124 100 118 124" stroke={c} strokeWidth="1" fill="none" /></g>;
    default: return null;
  }
}

/** Torso garment (shirt/tee/etc). Drawn under the jacket. */
function Top({ item, s, w }: { item: Item; s: number; w: number }) {
  const c = item.c1;
  const d = shade(c, -0.15);
  const body = `M${100 - s + 10} 118 L${100 + s - 10} 118 Q${100 + s} 120 ${100 + s} 132 L${100 + w} 234 L${100 - w} 234 L${100 - s} 132 Q${100 - s} 120 ${100 - s + 10} 118 Z`;
  const parts: React.ReactNode[] = [<path key="b" d={body} fill={c} />];
  switch (item.kind) {
    case 'shirt':
      parts.push(<path key="c" d="M88 116 L100 128 L112 116 L114 124 L100 134 L86 124 Z" fill={shade(c, 0.06)} stroke={d} strokeWidth="1" />);
      parts.push(<path key="p" d="M100 134 L100 232" stroke={d} strokeWidth="1" />);
      break;
    case 'polo':
      parts.push(<path key="c" d="M88 116 L100 124 L112 116 L116 126 L104 128 L100 124 L96 128 L84 126 Z" fill={d} />);
      parts.push(<path key="p" d="M100 124 L100 146" stroke={shade(c, -0.3)} strokeWidth="1.4" />);
      break;
    case 'turtle':
      parts.push(<rect key="n" x="87" y="100" width="26" height="24" rx="6" fill={d} />);
      parts.push(<path key="r" d="M88 106 L112 106 M88 112 L112 112 M88 118 L112 118" stroke={shade(c, -0.3)} strokeWidth=".8" opacity=".5" />);
      break;
    case 'hoodie':
      parts.push(<path key="h" d="M78 118 Q100 136 122 118 L120 128 Q100 144 80 128 Z" fill={d} />);
      parts.push(<path key="s" d="M94 130 L93 160 M106 130 L107 160" stroke={shade(c, 0.4)} strokeWidth="1.6" />);
      parts.push(<path key="k" d={`M${100 - w + 6} 196 L${100 + w - 6} 196 L${100 + w - 10} 224 L${100 - w + 10} 224 Z`} fill={d} opacity=".6" />);
      break;
    case 'jumper': {
      // Knitted Christmas jumper: ribbed hem and cuffs, a band of pattern across the chest.
      const c2 = item.c2 ?? '#f4f1ea';
      const c3 = item.c3 ?? '#2f6a40';
      parts.push(<rect key="n" x="86" y="112" width="28" height="10" rx="4" fill={d} />);
      parts.push(<rect key="b1" x={100 - s} y="150" width={2 * s} height="5" fill={c2} />);
      parts.push(<rect key="b2" x={100 - s - 1} y="176" width={2 * s + 2} height="5" fill={c2} />);
      for (let i = 0; i < 9; i++) {
        const x = 100 - s + 8 + i * ((2 * s - 16) / 8);
        parts.push(<path key={`t${i}`} d={`M${x} 158 L${x + 4} 166 L${x - 4} 166 Z`} fill={i % 2 ? c3 : c2} />);
        parts.push(<circle key={`d${i}`} cx={x} cy="171" r="1.4" fill={i % 2 ? c2 : c3} />);
      }
      parts.push(<path key="snow" d="M100 196 L100 212 M92 204 L108 204 M94.5 198.5 L105.5 209.5 M105.5 198.5 L94.5 209.5" stroke={c2} strokeWidth="1.6" strokeLinecap="round" />);
      parts.push(<path key="rib" d={`M${100 - w} 226 L${100 + w} 226`} stroke={d} strokeWidth="9" />);
      parts.push(<path key="ribl" d={`M${100 - w + 4} 222 L${100 - w + 4} 230 M${100 - w + 12} 222 L${100 - w + 12} 230 M${100 + w - 4} 222 L${100 + w - 4} 230 M${100 + w - 12} 222 L${100 + w - 12} 230`} stroke={shade(c, -0.35)} strokeWidth=".8" opacity=".5" />);
      break;
    }
    case 'hawaiian': {
      const c2 = item.c2 ?? '#f2a35a';
      const c3 = item.c3 ?? '#f4f1ea';
      parts.push(<path key="c" d="M86 116 L100 132 L114 116 L118 126 L102 136 L100 132 L98 136 L82 126 Z" fill={shade(c, 0.08)} stroke={d} strokeWidth=".8" />);
      parts.push(<path key="p" d="M100 136 L100 232" stroke={d} strokeWidth="1" />);
      const spots = [[78, 150], [118, 146], [90, 178], [122, 186], [80, 208], [110, 214], [100, 160], [70, 186], [128, 162]];
      spots.forEach(([x, y], i) => {
        if (Math.abs(x - 100) > s - 4) return;
        parts.push(<g key={`f${i}`} transform={`translate(${x} ${y})`}>{[0, 72, 144, 216, 288].map((r) => <ellipse key={r} cx="0" cy="-4" rx="2.6" ry="4" fill={i % 3 ? c2 : c3} transform={`rotate(${r})`} />)}<circle r="1.6" fill={i % 3 ? c3 : c2} /></g>);
        parts.push(<path key={`l${i}`} d={`M${x + 4} ${y + 4} q6 2 8 8 q-6 0 -8 -8 Z`} fill={shade(c, -0.25)} />);
      });
      break;
    }
    case 'sequin':
      for (let i = 0; i < 70; i++) {
        const x = 100 - s + 8 + ((i * 37) % (2 * s - 16));
        const y = 124 + ((i * 53) % 106);
        parts.push(<circle key={`q${i}`} cx={x} cy={y} r="1.6" fill={i % 3 ? item.c2 ?? '#fff' : '#fff'} opacity={i % 2 ? 0.8 : 0.45} />);
      }
      parts.push(<path key="n" d="M88 117 Q100 128 112 117" stroke={d} strokeWidth="2" fill="none" />);
      break;
    default:
      parts.push(<path key="n" d="M88 117 Q100 128 112 117" stroke={d} strokeWidth="2.4" fill="none" />);
  }
  return <g>{parts}</g>;
}

function Neck({ item }: { item: Item }) {
  const c = item.c1;
  const d = shade(c, -0.3);
  switch (item.kind) {
    case 'tie':
      return <g><path d="M95 124 L105 124 L103 132 L97 132 Z" fill={d} /><path d="M97 132 L103 132 L107 196 L100 206 L93 196 Z" fill={c} /></g>;
    case 'stripetie':
      return <g><path d="M95 124 L105 124 L103 132 L97 132 Z" fill={d} /><path d="M97 132 L103 132 L107 196 L100 206 L93 196 Z" fill={c} /><path d="M96 146 L104 140 M95 162 L105 154 M94 178 L106 170 M94 194 L106 186" stroke={item.c2} strokeWidth="2.4" /></g>;
    case 'bowtie':
      return <g><path d="M100 124 L86 117 L86 131 Z M100 124 L114 117 L114 131 Z" fill={c} /><rect x="96.5" y="120.5" width="7" height="7" rx="2" fill={d} /></g>;
    case 'scarf':
      return <g><path d="M80 114 Q100 130 120 114 L122 124 Q100 140 78 124 Z" fill={c} /><path d="M106 126 L114 190 L102 192 L98 128 Z" fill={c} />{item.c2 && <path d="M80 118 Q100 134 120 118 M104 150 L113 149 M106 170 L114 169" stroke={item.c2} strokeWidth="2.4" fill="none" />}<path d="M102 186 L114 186" stroke={d} strokeWidth="2" /></g>;
    case 'kente':
      return <g><path d="M80 114 Q100 130 120 114 L122 124 Q100 140 78 124 Z" fill={c} /><path d="M106 126 L114 196 L102 198 L98 128 Z" fill={c} />{[140, 152, 164, 176, 188].map((y, i) => <path key={y} d={`M${100 + (y - 128) * 0.06} ${y} L${112 + (y - 128) * 0.06} ${y - 1}`} stroke={i % 2 ? item.c2 : item.c3} strokeWidth="4" />)}<path d="M82 120 Q100 135 118 120" stroke={item.c2} strokeWidth="2.4" fill="none" /></g>;
    case 'chain':
      return <path d="M86 124 Q100 150 114 124" stroke={c} strokeWidth={item.c2 ? 4 : 2.4} fill="none" strokeDasharray={item.c2 ? '3 1.5' : '2 1.2'} />;
    case 'pearls':
      return <g fill={c} stroke={shade(c, -0.2)} strokeWidth=".5">{Array.from({ length: 13 }, (_, i) => { const t = i / 12; const x = 86 + 28 * t; const y = 124 + Math.sin(t * Math.PI) * 22; return <circle key={i} cx={x} cy={y} r="2.3" />; })}</g>;
    case 'cravat':
      return <g><path d="M90 118 Q100 124 110 118 L108 128 Q100 132 92 128 Z" fill={c} /><path d="M92 128 Q100 132 108 128 Q112 150 100 160 Q88 150 92 128 Z" fill={c} /><circle cx="100" cy="140" r="2" fill={item.c2} /><path d="M94 134 Q100 138 106 134 M94 146 Q100 150 106 146" stroke={item.c2} strokeWidth=".8" fill="none" /></g>;
    default: return null;
  }
}

function Jacket({ item, s, w, extras }: { item: Item; s: number; w: number; extras: Extras }) {
  const c = item.c1;
  const lap = item.c2 ?? shade(c, -0.2);
  const btn = item.c3 ?? shade(c, -0.4);
  const hemY = item.kind === 'vest' ? 238 : item.kind === 'cardigan' ? 244 : item.kind === 'bomber' || item.kind === 'leather' || item.kind === 'denim' ? 236 : 248;
  const openX = item.kind === 'cardigan' ? 4 : 2;
  const deepY = item.kind === 'tux' || item.kind === 'velvet' ? 214 : item.kind === 'vest' ? 186 : item.kind === 'bomber' || item.kind === 'leather' || item.kind === 'denim' ? 150 : 206;
  const leftPanel = `M${100 - s + 10} 118 Q${100 - s} 120 ${100 - s} 132 L${100 - w - 2} ${hemY} L${100 - openX} ${hemY} L${100 - openX} ${deepY} L${100 - 15} 120 Z`;
  const rightPanel = `M${100 + s - 10} 118 Q${100 + s} 120 ${100 + s} 132 L${100 + w + 2} ${hemY} L${100 + openX} ${hemY} L${100 + openX} ${deepY} L${100 + 15} 120 Z`;
  const parts: React.ReactNode[] = [
    <path key="l" d={leftPanel} fill={c} />,
    <path key="r" d={rightPanel} fill={shade(c, -0.05)} />,
  ];
  if (item.kind === 'vest') {
    parts.push(<path key="vbt" d={`M100 190 L100 236`} stroke={btn} strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />);
    parts.push(<path key="vp" d={`M${100 - w + 6} 210 L${100 - 12} 208 M${100 + w - 6} 210 L${100 + 12} 208`} stroke={lap} strokeWidth="2" />);
    return <g>{parts}</g>;
  }
  if (item.kind === 'blazer' || item.kind === 'tux' || item.kind === 'champion' || item.kind === 'velvet') {
    const shawl = item.kind === 'velvet' || item.kind === 'tux';
    const lapL = shawl ? `M${100 - 15} 120 Q${100 - 26} 168 ${100 - openX} ${deepY} L${100 - openX - 2} ${deepY - 10} Q${100 - 18} 160 ${100 - 13} 121 Z`
      : `M${100 - 15} 120 L${100 - openX} ${deepY} L${100 - 9} 170 L${100 - 25} 146 L${100 - 19} 138 Z`;
    const lapR = shawl ? `M${100 + 15} 120 Q${100 + 26} 168 ${100 + openX} ${deepY} L${100 + openX + 2} ${deepY - 10} Q${100 + 18} 160 ${100 + 13} 121 Z`
      : `M${100 + 15} 120 L${100 + openX} ${deepY} L${100 + 9} 170 L${100 + 25} 146 L${100 + 19} 138 Z`;
    parts.push(<path key="ll" d={lapL} fill={lap} />, <path key="lr" d={lapR} fill={shade(lap, -0.05)} />);
    parts.push(<circle key="b1" cx={100 - 5} cy={deepY + 10} r="2.4" fill={btn} />, <circle key="b2" cx={100 - 5} cy={deepY + 26} r="2.4" fill={btn} />);
    parts.push(<path key="pk" d={`M${100 - w + 4} 214 L${100 - 14} 212`} stroke={shade(c, -0.3)} strokeWidth="2" />);
    parts.push(<path key="pk2" d={`M${100 + w - 4} 214 L${100 + 14} 212`} stroke={shade(c, -0.3)} strokeWidth="2" />);
    if (item.kind === 'champion' || item.id === 'blazer-club') {
      parts.push(<path key="trim" d={`${leftPanel} ${rightPanel}`} fill="none" stroke={item.c2} strokeWidth="1.6" />);
      parts.push(<g key="crest" transform={`translate(${100 - s + 22} 160)`}><path d="M0 -8 L7 -6 L7 2 Q7 8 0 11 Q-7 8 -7 2 L-7 -6 Z" fill={item.c2} /><path d="M0 -4 L2 0 L0 4 L-2 0 Z" fill={c} /></g>);
    }
  } else if (item.kind === 'cardigan') {
    parts.push(<path key="bt" d={`M${100 - openX - 4} ${deepY + 6} L${100 - openX - 4} ${hemY - 6}`} stroke={lap} strokeWidth="3" strokeDasharray="2.6 10" strokeLinecap="round" />);
    parts.push(<path key="rib" d={`M${100 - w - 2} ${hemY - 6} L${100 - openX} ${hemY - 6} M${100 + w + 2} ${hemY - 6} L${100 + openX} ${hemY - 6}`} stroke={lap} strokeWidth="5" />);
  } else {
    // bomber / leather / denim: zip or buttons, collar
    parts.push(<path key="col" d={`M${100 - 22} 118 L${100 - 6} 136 L${100 - 14} 150 L${100 - 30} 126 Z M${100 + 22} 118 L${100 + 6} 136 L${100 + 14} 150 L${100 + 30} 126 Z`} fill={lap} />);
    parts.push(<path key="z" d={`M${100 - openX} ${deepY} L${100 - openX} ${hemY}`} stroke={item.c3 ?? shade(c, 0.3)} strokeWidth="1.6" />);
    if (item.kind === 'bomber') parts.push(<path key="rb" d={`M${100 - w - 2} ${hemY - 5} L${100 + w + 2} ${hemY - 5}`} stroke={lap} strokeWidth="7" />);
    if (item.kind === 'denim') parts.push(<path key="dp" d={`M${100 - s + 14} 160 L${100 - 12} 160 M${100 + s - 14} 160 L${100 + 12} 160`} stroke={shade(c, 0.25)} strokeWidth="1.2" strokeDasharray="3 2" />);
  }
  if (item.kind === 'champion' && extras.stars) {
    // stars drawn on sleeve in arm layer
  }
  return <g>{parts}</g>;
}

function Pin({ item, s }: { item: Item; s: number }) {
  const x = 100 - s + 22;
  const y = 150;
  switch (item.kind) {
    case 'pocket': return <path d={`M${100 + s - 30} 172 L${100 + s - 16} 172 L${100 + s - 19} 164 L${100 + s - 23} 168 L${100 + s - 27} 163 Z`} fill={item.c1} />;
    case 'rose': return <g><circle cx={x} cy={y} r="5" fill={item.c1} /><path d={`M${x - 2} ${y - 1} Q${x} ${y - 4} ${x + 2} ${y - 1} Q${x} ${y + 2} ${x - 2} ${y - 1}`} stroke={shade(item.c1, -0.3)} fill="none" /><path d={`M${x + 2} ${y + 4} L${x + 7} ${y + 9}`} stroke={item.c2} strokeWidth="2" /></g>;
    case 'chip': return <g><circle cx={x} cy={y} r="5.5" fill={item.c1} /><circle cx={x} cy={y} r="5.5" fill="none" stroke={item.c2} strokeWidth="1.6" strokeDasharray="2 1.6" /><circle cx={x} cy={y} r="2.6" fill={shade(item.c1, 0.1)} /></g>;
    case 'ace': return <g><rect x={x - 4.5} y={y - 6} width="9" height="12" rx="1.5" fill={item.c1} /><path d={`M${x} ${y - 3} Q${x + 4} ${y + 1} ${x} ${y + 2} Q${x - 4} ${y + 1} ${x} ${y - 3} Z`} fill={item.c2} /></g>;
    case 'cup': return <g><path d={`M${x - 4} ${y - 5} L${x + 4} ${y - 5} L${x + 3} ${y + 1} Q${x} ${y + 3} ${x - 3} ${y + 1} Z`} fill={item.c1} /><rect x={x - 1} y={y + 2} width="2" height="3" fill={item.c1} /><rect x={x - 3} y={y + 5} width="6" height="2" fill={item.c1} /></g>;
    case 'notebook': return <g><rect x={x - 4} y={y - 6} width="9" height="12" rx="1" fill={item.c1} /><path d={`M${x - 2} ${y - 3} L${x + 3} ${y - 3} M${x - 2} ${y} L${x + 3} ${y} M${x - 2} ${y + 3} L${x + 2} ${y + 3}`} stroke={item.c2} strokeWidth=".8" /></g>;
    default: return null;
  }
}

function Legs({ item, look, h }: { item: Item | undefined; look: Look; h: number }) {
  const c = item?.c1 ?? '#2e3138';
  const d = shade(c, -0.18);
  const leg = (side: -1 | 1, color: string, top = 226, bottom = 362) => {
    const outer = 100 + side * h;
    const inner = 100 + side * 2;
    return `M${outer} ${top} L${inner} ${top} L${100 + side * 4} ${bottom} L${100 + side * (h - 6)} ${bottom} Z`;
  };
  const skinLegs = (from: number) => (
    <g fill={look.skin}>
      <path d={leg(-1, look.skin, from)} />
      <path d={leg(1, look.skin, from)} />
    </g>
  );
  const kind = item?.kind ?? 'trousers';
  if (kind === 'shorts') {
    return <g>{skinLegs(260)}<path d={leg(-1, c, 226, 290)} fill={c} /><path d={leg(1, c, 226, 290)} fill={d} /></g>;
  }
  if (kind === 'skirt' || kind === 'pleated') {
    const skirt = kind === 'skirt'
      ? `M${100 - h} 226 L${100 + h} 226 L${100 + h - 2} 300 L${100 - h + 2} 300 Z`
      : `M${100 - h} 226 L${100 + h} 226 L${100 + h + 10} 296 L${100 - h - 10} 296 Z`;
    return (
      <g>
        {skinLegs(280)}
        <path d={skirt} fill={c} />
        {kind === 'pleated' && <path d={`M${100 - h + 6} 230 L${100 - h - 2} 294 M${100 - 10} 230 L${100 - 14} 294 M${100 + 10} 230 L${100 + 14} 294 M${100 + h - 6} 230 L${100 + h + 2} 294 M${100 - h - 6} 262 L${100 + h + 6} 262`} stroke={item?.c2 ?? d} strokeWidth="1.6" opacity=".7" />}
      </g>
    );
  }
  return (
    <g>
      <path d={leg(-1, c)} fill={c} />
      <path d={leg(1, c)} fill={d} />
      {kind === 'jeans' && <path d={`M${100 - h + 10} 234 Q${100 - h + 8} 300 ${100 - h + 9} 360 M${100 + h - 10} 234 Q${100 + h - 8} 300 ${100 + h - 9} 360`} stroke={shade(c, 0.3)} strokeWidth="1" strokeDasharray="3 2" fill="none" />}
      {kind === 'cords' && Array.from({ length: 6 }, (_, i) => <path key={i} d={`M${100 - h + 6 + i * ((h - 6) / 6)} 230 L${100 - h + 8 + i * ((h - 8) / 6)} 360 M${100 + 4 + i * ((h - 6) / 6)} 230 L${100 + 6 + i * ((h - 8) / 6)} 360`} stroke={d} strokeWidth="1" opacity=".6" />)}
      {kind === 'pinstripe' && Array.from({ length: 5 }, (_, i) => <path key={i} d={`M${100 - h + 6 + i * 8} 230 L${100 - h + 8 + i * 7.5} 360 M${100 + 6 + i * 8} 230 L${100 + 8 + i * 7.5} 360`} stroke={item?.c2} strokeWidth=".8" opacity=".7" />)}
      {kind === 'trousers' && <path d={`M${100 - h / 2 - 1} 236 L${100 - h / 2 + 1} 360 M${100 + h / 2 + 1} 236 L${100 + h / 2 - 1} 360`} stroke={shade(c, -0.3)} strokeWidth=".9" opacity=".6" />}
      <path d={`M${100 - h} 228 L${100 + h} 228`} stroke={shade(c, -0.35)} strokeWidth="4" />
    </g>
  );
}

function Shoes({ item }: { item: Item | undefined }) {
  const c = item?.c1 ?? '#141414';
  const d = shade(c, -0.35);
  const kind = item?.kind ?? 'oxford';
  const one = (side: -1 | 1) => {
    const cx = 100 + side * 22;
    switch (kind) {
      case 'trainer':
        return <g key={side}><path d={`M${cx - 17} 372 Q${cx - 18} 354 ${cx} 352 Q${cx + 18} 354 ${cx + 17} 372 Z`} fill={c} /><rect x={cx - 18} y="371" width="36" height="7" rx="3" fill={item?.c2 ?? '#ddd'} /><path d={`M${cx - 8} 358 L${cx + 8} 358 M${cx - 9} 363 L${cx + 9} 363`} stroke={shade(c, -0.2)} strokeWidth="1.4" /></g>;
      case 'boot':
        return <g key={side}><path d={`M${cx - 15} 334 L${cx + 15} 334 L${cx + 17} 376 L${cx - 17} 376 Z`} fill={c} /><rect x={cx - 18} y="374" width="36" height="6" rx="2" fill={d} /><path d={`M${cx - 15} 340 L${cx + 15} 340`} stroke={d} strokeWidth="2" /></g>;
      case 'heel':
        return <g key={side}><path d={`M${cx - 12} 376 Q${cx - 13} 358 ${cx} 356 Q${cx + 13} 358 ${cx + 12} 376 Z`} fill={c} /><rect x={cx + side * 8 - 2} y="372" width="4" height="10" fill={d} /></g>;
      case 'loafer':
        return <g key={side}><path d={`M${cx - 16} 376 Q${cx - 17} 356 ${cx} 355 Q${cx + 17} 356 ${cx + 16} 376 Z`} fill={c} /><path d={`M${cx - 9} 362 L${cx + 9} 362`} stroke={d} strokeWidth="2.4" /><rect x={cx - 17} y="375" width="34" height="5" rx="2" fill={d} /></g>;
      default:
        return <g key={side}><path d={`M${cx - 16} 376 Q${cx - 17} 355 ${cx} 354 Q${cx + 17} 355 ${cx + 16} 376 Z`} fill={c} />{item?.c2 && <path d={`M${cx - 16} 376 Q${cx - 16} 366 ${cx - 6} 362 L${cx + 6} 362 Q${cx + 16} 366 ${cx + 16} 376 Z`} fill={item.c2} />}<path d={`M${cx - 6} 358 L${cx + 6} 358`} stroke={shade(c, 0.25)} strokeWidth="1.2" /><rect x={cx - 17} y="375" width="34" height="5" rx="2" fill={d} /></g>;
    }
  };
  return <g>{one(-1)}{one(1)}</g>;
}

/** One arm (drawn as the viewer's left arm; the right arm is mirrored). */
/** Which tattoos show where. Old saves kept neck designs in the arm slot. */
function inkOf(item: (slot: WearSlot) => Item | undefined): { arm?: Item; neck?: Item; hand?: Item } {
  const t = item('tattoo');
  const legacyNeck = t && NECK_TATTOOS.includes(t.kind) && t.slot !== 'tattoo' ? t : undefined;
  return { arm: t && !legacyNeck ? t : undefined, neck: item('necktat') ?? legacyNeck, hand: item('handtat') };
}
export const NECK_TATTOOS = ['swallow', 'stars'];

function Arm({ look, sleeve, sleeveLen, pose, wrist, stars, hand, s, tattoo, handTat }: {
  look: Look; sleeve: string; sleeveLen: 'none' | 'short' | 'long'; pose: ArmPose; wrist?: Item; stars: number; hand: 'open' | 'thumb' | 'fist'; s: number; tattoo?: Item; handTat?: Item;
}) {
  const sx = 100 - s + 7;
  const sy = 130;
  const UP = 54;
  const FORE = 50;
  const skin = look.skin;
  const upperFill = sleeveLen === 'none' ? skin : sleeve;
  const foreFill = sleeveLen === 'long' ? sleeve : skin;
  return (
    <g transform={`rotate(${pose.s} ${sx} ${sy})`}>
      <rect x={sx - 12} y={sy - 6} width="24" height={UP + 10} rx="12" fill={upperFill} />
      {sleeveLen === 'short' && <rect x={sx - 12} y={sy + 26} width="24" height="10" rx="5" fill={shade(sleeve, -0.1)} />}
      {Array.from({ length: Math.min(stars, 5) }, (_, i) => (
        <path key={i} transform={`translate(${sx} ${sy + 10 + i * 8}) scale(.5)`} d="M0 -6 L1.8 -1.8 L6.5 -1.8 L2.7 1.2 L4 6 L0 3.2 L-4 6 L-2.7 1.2 L-6.5 -1.8 L-1.8 -1.8 Z" fill="#f0cf86" />
      ))}
      <g transform={`rotate(${pose.e} ${sx} ${sy + UP})`}>
        <rect x={sx - 10.5} y={sy + UP - 6} width="21" height={FORE + 6} rx="10.5" fill={foreFill} />
        {sleeveLen === 'long' && <rect x={sx - 11} y={sy + UP + FORE - 10} width="22" height="5" rx="2.5" fill={shade(sleeve, -0.2)} />}
        {sleeveLen !== 'long' && tattoo && <TattooAt item={tattoo} x={sx} y={sy + UP + FORE / 2 - 2} />}
        {wrist && (wrist.kind === 'watch'
          ? <g><rect x={sx - 10.5} y={sy + UP + FORE - 6} width="21" height="6" fill={shade(wrist.c1, -0.2)} /><circle cx={sx} cy={sy + UP + FORE - 3} r="4" fill={wrist.c1} /><circle cx={sx} cy={sy + UP + FORE - 3} r="2.6" fill={wrist.c2} /></g>
          : <rect x={sx - 10.5} y={sy + UP + FORE - 5} width="21" height="3" rx="1.5" fill={wrist.c1} />)}
        <g transform={`translate(${sx} ${sy + UP + FORE + 6}) rotate(${hand === 'open' ? 0 : -(pose.s + pose.e)})`}>
          {hand === 'thumb' ? (
            <g><rect x="-9" y="-8" width="18" height="15" rx="6" fill={skin} /><rect x="-3" y="-20" width="7" height="14" rx="3.5" fill={skin} /></g>
          ) : hand === 'fist' ? (
            <rect x="-9" y="-9" width="18" height="17" rx="7" fill={skin} />
          ) : (
            <ellipse cx="0" cy="0" rx="9.5" ry="11" fill={skin} />
          )}
          {handTat && hand === 'open' && <TattooAt item={handTat} x={0} y={1} scale={0.5} />}
        </g>
      </g>
    </g>
  );
}

function TitleBelt() {
  return (
    <g>
      <rect x="54" y="222" width="92" height="14" rx="3" fill="#3a2414" />
      <path d="M84 212 H116 L122 229 L116 246 H84 L78 229 Z" fill="#e2bd68" stroke="#7a541b" strokeWidth="1.2" />
      <circle cx="100" cy="229" r="7" fill="#a83434" stroke="#7a541b" />
      <circle cx="68" cy="229" r="3" fill="#e2bd68" /><circle cx="132" cy="229" r="3" fill="#e2bd68" />
    </g>
  );
}

// ----------------------------------------------------------- lounge style (more realistic)
// Smaller head, almond eyes with irises, a modelled nose and lips, soft shading
// and tapered limbs. Same coordinate system and the same wardrobe as Classic.

export type CharStyle = 'lounge' | 'classic';
export const CharStyleContext = React.createContext<CharStyle>('lounge');
export const EYE_COLORS = ['#3b2414', '#5a3a22', '#7a5a2a', '#4a6a3a', '#3c5878', '#5e6a72'];

function mix(a: string, b: string, t: number): string {
  const p = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const [r1, g1, b1] = p(a); const [r2, g2, b2] = p(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${((1 << 24) + (m(r1, r2) << 16) + (m(g1, g2) << 8) + m(b1, b2)).toString(16).slice(1)}`;
}

/** Eye colour: the look's own, or a sensible default from the hair. */
export function eyeColorOf(look: Look): string {
  if (look.eyeColor) return look.eyeColor;
  if (['#d4a858', '#e6d6a8'].includes(look.hairColor)) return EYE_COLORS[4];
  if (look.hairColor === '#8d2f23') return EYE_COLORS[3];
  if (['#a8743a', '#7a4a24'].includes(look.hairColor)) return EYE_COLORS[2];
  return EYE_COLORS[1];
}

const JAW: Record<Build, number> = { slim: 0, regular: 1.5, broad: 3.5 };

function LHeadShape({ look }: { look: Look }) {
  const j = JAW[look.build] ?? 1.5;
  const skin = look.skin;
  const sh = shade(skin, -0.3);
  const ear = <path d="M71.8 64.5 C66 62.5 64.6 71 66.4 77.5 C67.4 81.4 69.6 83 72.2 82 Z" />;
  return (
    <g>
      <g fill={skin}>{ear}<g transform="translate(200 0) scale(-1 1)">{ear}</g></g>
      <path d="M70.2 69 C68.4 71 68.8 76 70.6 79" stroke={sh} strokeWidth=".9" fill="none" opacity=".6" />
      <path d="M129.8 69 C131.6 71 131.2 76 129.4 79" stroke={sh} strokeWidth=".9" fill="none" opacity=".7" />
      <path d={`M71 58 C71 38 84 30 100 30 C116 30 129 38 129 58 L129 70 C129 80 ${126 + j * 0.3} 88 ${119 + j} 94 C112 100 106 104 100 104 C94 104 88 100 ${81 - j} 94 C${74 - j * 0.3} 88 71 80 71 70 Z`} fill={skin} />
    </g>
  );
}

function LFaceShading({ look }: { look: Look }) {
  const sh = shade(look.skin, -0.32);
  const hi = shade(look.skin, 0.16);
  const j = JAW[look.build] ?? 1.5;
  return (
    <g>
      <path d={`M120 42 C127.5 48 129.4 58 129 70 C129 80 ${126 + j * 0.3} 88 ${119 + j} 94 C112 100 106 104 100 104 C109 99 116 92 120 83 C124 72 124.5 56 120 42 Z`} fill={sh} opacity=".26" />
      <ellipse cx="85" cy="46" rx="10" ry="6" fill={hi} opacity=".32" />
      <ellipse cx="89" cy="68" rx="8.5" ry="4.6" fill={sh} opacity=".14" />
      <ellipse cx="111" cy="68" rx="8.5" ry="4.6" fill={sh} opacity=".2" />
      <path d="M77 80 Q82 86.5 88.5 87.5" stroke={sh} strokeWidth="3" fill="none" opacity=".12" strokeLinecap="round" />
      <path d="M123 80 Q118 86.5 111.5 87.5" stroke={sh} strokeWidth="3" fill="none" opacity=".18" strokeLinecap="round" />
      <ellipse cx="80.5" cy="78" rx="5" ry="3" fill={hi} opacity=".22" />
      <path d="M99.3 64 L99.1 78" stroke={hi} strokeWidth="1.7" opacity=".38" strokeLinecap="round" />
      <ellipse cx="100.5" cy="86" rx="4" ry="1.1" fill={sh} opacity=".28" />
      <ellipse cx="100" cy="96.6" rx="5.2" ry="1.6" fill={sh} opacity=".26" />
      <ellipse cx="99" cy="100" rx="4.2" ry="1.9" fill={hi} opacity=".22" />
    </g>
  );
}

function LEye({ x, dir, look, uid }: { x: number; dir: 1 | -1; look: Look; uid: string }) {
  const t = look.eyes;
  const w = t === 'wide' ? 6.9 : t === 'narrow' ? 6.5 : 6.6;
  const h = t === 'wide' ? 3.9 : t === 'narrow' ? 2.4 : t === 'sleepy' ? 2.9 : 3.3;
  const y = 69;
  const ox = x + dir * w;
  const ix = x - dir * w;
  const sh = shade(look.skin, -0.34);
  const ink = '#24170f';
  const white = `M${ix} ${y + 0.5} Q${x - dir * 1} ${y - h * 1.5} ${ox} ${y - 0.7} Q${x + dir * 1} ${y + h * 1.12} ${ix} ${y + 0.5} Z`;
  const id = `${uid}e${dir > 0 ? 'r' : 'l'}`;
  const iris = eyeColorOf(look);
  const r = t === 'wide' ? 2.95 : 2.75;
  return (
    <g>
      <clipPath id={id}><path d={white} /></clipPath>
      <path d={white} fill="#efe8dc" />
      <g clipPath={`url(#${id})`}>
        <circle cx={x + dir * 0.2} cy={y - 0.2} r={r} fill={iris} />
        <circle cx={x + dir * 0.2} cy={y - 0.2} r={r} fill="none" stroke="#000" strokeOpacity=".35" strokeWidth=".6" />
        <circle cx={x + dir * 0.2} cy={y - 0.2} r={r * 0.46} fill="#0d0907" />
        <path d={`M${ix} ${y - h * 2} L${ox} ${y - h * 2} L${ox} ${y - h * 0.55} Q${x} ${y - h * 1.15} ${ix} ${y - h * 0.4} Z`} fill="#000" opacity=".16" />
      </g>
      <circle cx={x + dir * 0.2 - 0.9} cy={y - 1.2} r=".75" fill="#fff" opacity=".9" />
      {t === 'sleepy' && <path d={`M${ix - dir * 0.3} ${y + 0.2} Q${x - dir * 1} ${y - h * 1.7} ${ox + dir * 0.4} ${y - 0.9} L${ox} ${y - 0.3} Q${x} ${y - h * 0.4} ${ix} ${y + 0.4} Z`} fill={shade(look.skin, -0.07)} />}
      <path d={`M${ix - dir * 0.4} ${y + 0.3} Q${x - dir * 1} ${y - h * 1.6} ${ox + dir * 0.9} ${y - 1}`} stroke={ink} strokeWidth="1.45" fill="none" strokeLinecap="round" />
      <path d={`M${ox - dir * 1.6} ${y - h * 0.9} L${ox + dir * 1.4} ${y - h * 1.1}`} stroke={ink} strokeWidth=".9" strokeLinecap="round" opacity=".7" />
      <path d={`M${ix + dir * 0.5} ${y + 0.9} Q${x} ${y + h * 1.25 + 0.3} ${ox} ${y - 0.2}`} stroke={sh} strokeWidth=".75" fill="none" opacity=".55" />
      <path d={`M${ix + dir * 0.6} ${y - h - 1.7} Q${x} ${y - h * 1.55 - 3} ${ox - dir * 0.4} ${y - h - 0.8}`} stroke={sh} strokeWidth=".8" fill="none" opacity=".5" />
    </g>
  );
}

function LBrow({ x, dir, look }: { x: number; dir: 1 | -1; look: Look }) {
  const c = look.hair === 'bald' ? shade(look.skin, -0.5) : look.hairColor === '#ece6dc' || look.hairColor === '#e6d6a8' ? shade(look.hairColor, -0.35) : shade(look.hairColor, 0.05);
  const inner = x - dir * 5.6;
  const outer = x + dir * 7.6;
  const arch = look.brows === 'arched' ? 4.4 : look.brows === 'bold' ? 2.3 : 2.8;
  const thick = look.brows === 'bold' ? 2.7 : look.brows === 'soft' ? 1.6 : 1.9;
  const y = 62.3;
  return <path d={`M${inner} ${y + 0.4} Q${x + dir * 1.5} ${y - arch} ${outer} ${y + 0.6} Q${x + dir * 1.5} ${y - arch + thick + 0.4} ${inner} ${y + thick + 0.6} Z`} fill={c} opacity=".92" />;
}

function LNose({ look }: { look: Look }) {
  const sh = shade(look.skin, -0.32);
  const dk = shade(look.skin, -0.42);
  return (
    <g fill="none" strokeLinecap="round">
      <path d="M101.6 66 C102.6 72 103.6 77 105.4 80.4" stroke={sh} strokeWidth="1" opacity=".5" />
      <path d="M95.6 80.2 Q93.8 83.2 96.9 83.8 Q98.5 85 100 84.4 Q101.5 85 103.1 83.8 Q106.2 83.2 104.4 80.2" stroke={dk} strokeWidth="1.1" />
      <ellipse cx="100" cy="80.6" rx="1.8" ry="1.3" fill={shade(look.skin, 0.2)} opacity=".45" />
    </g>
  );
}

function LMouth({ look, mouth }: { look: Look; mouth: Mouth | 'open' | 'frown' }) {
  const lip = mix(look.skin, '#93413d', 0.42);
  const lipD = shade(lip, -0.22);
  const line = shade(look.skin, -0.58);
  const sh = shade(look.skin, -0.3);
  const hiL = <ellipse cx="100.5" cy="92.2" rx="2.6" ry=".8" fill="#fff" opacity=".18" />;
  switch (mouth) {
    case 'grin':
      return (
        <g>
          <path d="M91 88.5 Q100 89.6 109 88.5 Q106 95.2 100 95.6 Q94 95.2 91 88.5 Z" fill="#3a1a16" />
          <path d="M92.6 89.1 Q100 90.3 107.4 89.1 L106.8 91.2 Q100 92.2 93.2 91.2 Z" fill="#efe8dc" />
          <path d="M91 88.5 Q96 87.1 98.6 87.7 Q100 87.2 101.4 87.7 Q104 87.1 109 88.5 Q100 89.7 91 88.5 Z" fill={lipD} />
          <path d="M93.2 93.4 Q100 97.4 106.8 93.4 Q105 96 100 96.2 Q95 96 93.2 93.4 Z" fill={lip} />
          <path d="M89.6 87.2 Q89 89 90.4 90 M110.4 87.2 Q111 89 109.6 90" stroke={sh} strokeWidth=".8" fill="none" opacity=".55" />
        </g>
      );
    case 'open':
      return (
        <g>
          <ellipse cx="100" cy="91.6" rx="5" ry="4.3" fill="#3a1a16" />
          <path d="M95 88.8 Q100 86.6 105 88.8" stroke={lipD} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M95.4 94.4 Q100 97 104.6 94.4" stroke={lip} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'frown':
      return (
        <g>
          <path d="M92 91.2 Q96 88.6 98.6 89.2 Q100 88.7 101.4 89.2 Q104 88.6 108 91.2 Q100 89.9 92 91.2 Z" fill={lipD} />
          <path d="M92.6 91.3 Q100 90.3 107.4 91.3 Q105 94.4 100 94.5 Q95 94.4 92.6 91.3 Z" fill={lip} />
          <path d="M91.4 91.5 Q100 89.6 108.6 91.5" stroke={line} strokeWidth=".9" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'smile':
      return (
        <g>
          <path d="M91.5 88.8 Q96 88.2 98.6 88.8 Q100 88.3 101.4 88.8 Q104 88.2 108.5 88.8 Q100 91.4 91.5 88.8 Z" fill={lipD} />
          <path d="M92.8 89.7 Q100 91.7 107.2 89.7 Q105 93.7 100 93.9 Q95 93.7 92.8 89.7 Z" fill={lip} />
          <path d="M91 88.3 Q100 91.8 109 88.3" stroke={line} strokeWidth=".95" fill="none" strokeLinecap="round" />
          <path d="M90.2 87.4 Q89.6 88.9 90.8 89.8 M109.8 87.4 Q110.4 88.9 109.2 89.8" stroke={sh} strokeWidth=".75" fill="none" opacity=".5" />
          {hiL}
        </g>
      );
    default: {
      const g = (
        <g>
          <path d="M92 90 Q96 88.4 98.6 89 Q100 88.5 101.4 89 Q104 88.4 108 90 Q100 90.9 92 90 Z" fill={lipD} />
          <path d="M92.6 90.3 Q100 91.3 107.4 90.3 Q105 93.9 100 94.1 Q95 93.9 92.6 90.3 Z" fill={lip} />
          <path d="M91.6 90 Q100 91.1 108.4 90" stroke={line} strokeWidth=".9" fill="none" strokeLinecap="round" />
          {hiL}
        </g>
      );
      return mouth === 'smirk'
        ? <g><g transform="rotate(-5 100 90.5)">{g}</g><path d="M109.4 87.6 Q110.4 89 109.6 90.2" stroke={sh} strokeWidth=".8" fill="none" opacity=".55" /></g>
        : g;
    }
  }
}

function lBeardShape(look: Look, c: string): React.ReactNode {
  switch (look.facialHair) {
    case 'stubble': return <path d="M72.5 78 Q75 97 88 100.5 Q94 104.5 100 104.5 Q106 104.5 112 100.5 Q125 97 127.5 78 Q122 93 110 95.5 Q105 92.5 100 92.5 Q95 92.5 90 95.5 Q78 93 72.5 78 Z M90 86.4 Q95 85 100 85.6 Q105 85 110 86.4 L110 88 Q100 87 90 88 Z" fill={c} />;
    case 'moustache': return <path d="M88.5 88 Q92.5 83.6 97 84.6 Q99 85 100 85.8 Q101 85 103 84.6 Q107.5 83.6 111.5 88 Q109 89.2 106 88.4 Q103 87.8 100 88.6 Q97 87.8 94 88.4 Q91 89.2 88.5 88 Z" fill={c} />;
    case 'beard': return <path d="M71.5 73 Q72.5 92 82 98 Q90 105.5 100 106 Q110 105.5 118 98 Q127.5 92 128.5 73 Q126 88 117 92 Q110 86.5 100 87 Q90 86.5 83 92 Q74 88 71.5 73 Z M88.5 88 Q100 83.4 111.5 88 Q100 89.4 88.5 88 Z" fill={c} />;
    case 'goatee': return <g fill={c}><path d="M90 87.6 Q95 84.4 100 86 Q105 84.4 110 87.6 Q100 87.2 90 87.6 Z" /><path d="M94.5 95.4 Q100 94 105.5 95.4 Q105 104 100 105 Q95 104 94.5 95.4 Z" /></g>;
    case 'bigbeard': return <g fill={c}><path d="M70.5 70 Q70 96 77 113 Q85 135 100 146 Q115 135 123 113 Q130 96 129.5 70 Q126 88 117 92 Q110 86.5 100 87 Q90 86.5 83 92 Q74 88 70.5 70 Z" /><path d="M86.5 89 Q91.5 83 100 85.6 Q108.5 83 113.5 89 Q110.5 91 106 90 Q103 89.2 100 90 Q97 89.2 94 90 Q89.5 91 86.5 89 Z" /></g>;
    default: return null;
  }
}

/** Beards in the Lounge style: strand texture, shading and a soft edge. */
function LFacialHair({ look, uid }: { look: Look; uid: string }) {
  const c = look.hairColor;
  const shape = lBeardShape(look, c);
  if (!shape) return null;
  const id = `${uid}bm`;
  const mask = <mask id={id}>{lBeardShape(look, '#ffffff')}</mask>;
  if (look.facialHair === 'stubble') {
    return (
      <g>
        {mask}
        <g mask={`url(#${id})`}>
          <rect x="70" y="76" width="60" height="32" fill={c} opacity=".1" />
          {Array.from({ length: 260 }, (_, i) => <circle key={i} cx={71 + prand(i, 11) * 58} cy={78 + prand(i, 12) * 28} r=".42" fill={shade(c, -0.2)} opacity=".55" />)}
        </g>
      </g>
    );
  }
  return (
    <g>
      <g filter={`url(#${uid}rough)`}>{shape}</g>
      {mask}
      <g mask={`url(#${id})`} fill="none" strokeLinecap="round">
        <Strands look={look} kind="beard" seed={5} />
        <ellipse cx="100" cy={look.facialHair === 'bigbeard' ? 128 : 102} rx="24" ry="12" fill={shade(c, -0.45)} opacity=".28" />
        <ellipse cx="86" cy="96" rx="8" ry="5" fill={shade(c, 0.3)} opacity=".18" />
      </g>
    </g>
  );
}

/** Deterministic pseudo-random so strands don't jump between renders. */
const prand = (i: number, k = 1) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

/** Fine strand texture for a hair or beard shape (drawn inside a mask). */
function Strands({ look, kind, seed = 1 }: { look: Look; kind: 'flow' | 'curl' | 'crest' | 'fall' | 'beard'; seed?: number }) {
  const hi = shade(look.hairColor, 0.32);
  const lo = shade(look.hairColor, -0.4);
  const out: React.ReactNode[] = [];
  if (kind === 'curl') {
    for (let i = 0; i < 110; i++) {
      const x = 52 + prand(i, seed) * 96; const y = 6 + prand(i, seed + 1) * 96; const r = 2.4 + prand(i, seed + 2) * 2.6;
      out.push(<path key={i} d={`M${x - r} ${y} a${r} ${r} 0 1 1 ${r * 1.6} ${r * 0.9}`} stroke={i % 3 ? lo : hi} strokeWidth={0.7 + prand(i, 9) * 0.6} opacity={i % 3 ? 0.55 : 0.45} />);
    }
    return <>{out}</>;
  }
  if (kind === 'crest') {
    for (let i = 0; i < 22; i++) {
      const x = 88 + prand(i, seed) * 24; const lean = (x - 100) * 0.35;
      out.push(<path key={i} d={`M${x} 46 C${x + lean * 0.3} 30 ${x + lean} 14 ${x + lean * 1.4 + (prand(i, 4) - 0.5) * 4} ${-6 + prand(i, 5) * 10}`} stroke={i % 3 ? lo : hi} strokeWidth={0.6 + prand(i, 6) * 0.7} opacity=".55" />);
    }
    return <>{out}</>;
  }
  if (kind === 'fall' || kind === 'beard') {
    const n = kind === 'beard' ? 40 : 34;
    const [x0, x1, y0, y1] = kind === 'beard' ? [68, 132, 74, 146] : [56, 144, 40, 160];
    for (let i = 0; i < n; i++) {
      const x = x0 + (i / (n - 1)) * (x1 - x0) + (prand(i, seed) - 0.5) * 3;
      const bend = (x - 100) * (kind === 'beard' ? 0.12 : 0.06);
      const top = y0 + prand(i, seed + 3) * 10;
      out.push(<path key={i} d={`M${x} ${top} C${x + bend} ${top + (y1 - top) * 0.35} ${x - bend + (prand(i, 7) - 0.5) * 6} ${top + (y1 - top) * 0.7} ${x + (prand(i, 8) - 0.5) * 5} ${y1}`} stroke={i % 3 ? lo : hi} strokeWidth={kind === 'beard' ? 0.8 + prand(i, 9) * 0.6 : 0.6 + prand(i, 9) * 0.6} opacity={kind === 'beard' ? 0.6 : 0.5} />);
    }
    return <>{out}</>;
  }
  // flow: combed strands, roughly parallel, running from the crown down to the hairline
  for (let i = 0; i < 46; i++) {
    const t = i / 45;
    const sx = 72 + t * 56 + (prand(i, seed) - 0.5) * 5;
    const sy = 16 + Math.abs(t - 0.45) * 14 + prand(i, seed + 3) * 4;
    const ex = 62 + t * 76 + (prand(i, seed + 2) - 0.5) * 3;
    const ey = 70 - Math.sin(t * Math.PI) * 26 + prand(i, seed + 1) * 4;
    const sweep = 5 + prand(i, 6) * 3;
    out.push(<path key={i} d={`M${sx} ${sy} C${sx + sweep} ${sy + (ey - sy) * 0.3} ${ex + sweep * 0.6} ${sy + (ey - sy) * 0.7} ${ex} ${ey}`} stroke={i % 3 ? lo : hi} strokeWidth={0.5 + prand(i, 4) * 0.6} opacity={i % 3 ? 0.42 : 0.48} />);
  }
  return <>{out}</>;
}

const STRAND_KIND: Partial<Record<HairStyle, 'flow' | 'curl' | 'crest'>> = { curly: 'curl', afro: 'curl', mohawk: 'crest' };

/** Masked strand texture, a sheen and a soft, hairy edge (Lounge style). */
function LHairDetail({ look, uid }: { look: Look; uid: string }) {
  if (look.hair === 'bald') return <ellipse cx="90" cy="40" rx="12" ry="5" fill="#fff" opacity=".12" />;
  const hi = shade(look.hairColor, 0.28);
  const id = `${uid}hm`;
  const buzz = look.hair === 'buzz';
  return (
    <g>
      <mask id={id}><HairFront look={{ ...look, hairColor: '#ffffff' }} /></mask>
      <g mask={`url(#${id})`} fill="none" strokeLinecap="round">
        {!buzz && <Strands look={look} kind={STRAND_KIND[look.hair] ?? 'flow'} />}
        {buzz && Array.from({ length: 120 }, (_, i) => <circle key={i} cx={68 + prand(i) * 64} cy={18 + prand(i, 2) * 46} r=".45" fill={shade(look.hairColor, -0.4)} opacity=".5" />)}
        <ellipse cx="91" cy="33" rx="20" ry="7" fill={hi} opacity=".22" transform="rotate(-8 91 33)" />
        <path d="M66 70 C70 58 120 44 134 70" stroke={shade(look.hairColor, -0.45)} strokeWidth="4" opacity=".14" />
      </g>
    </g>
  );
}

/** The back hair, textured with falling strands (long, bob, ponytail). */
function LHairBack({ look, uid }: { look: Look; uid: string }) {
  const back = HairBack({ look });
  if (!back) return null;
  if (!['long', 'bob', 'ponytail', 'afro'].includes(look.hair)) return back;
  const id = `${uid}hb`;
  return (
    <g>
      {back}
      <mask id={id}><HairBack look={{ ...look, hairColor: '#ffffff' }} /></mask>
      <g mask={`url(#${id})`} fill="none" strokeLinecap="round"><Strands look={look} kind={look.hair === 'afro' ? 'curl' : 'fall'} seed={3} /></g>
    </g>
  );
}

/** A slightly rough edge so hair and beards don't look cut from card. */
function RoughEdge({ id }: { id: string }) {
  return (
    <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="3" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  );
}

/** Head and face in the Lounge style (everything in head coordinates). */
function LHead({ look, mouth, hat, lift, uid }: { look: Look; mouth: Mouth | 'open' | 'frown'; hat?: Item; lift: boolean; uid: string }) {
  const bareTop = !hat || ['visor', 'crown'].includes(hat.kind);
  return (
    <g>
      <LHeadShape look={look} />
      <LFaceShading look={look} />
      <path d="M73 58 C80 50 120 50 127 58" stroke={shade(look.skin, -0.3)} strokeWidth="3" fill="none" opacity=".18" />
      <defs><RoughEdge id={`${uid}rough`} /></defs>
      <LFacialHair look={look} uid={uid} />
      <LEye x={89} dir={-1} look={look} uid={uid} />
      <LEye x={111} dir={1} look={look} uid={uid} />
      <LBrow x={89} dir={-1} look={look} />
      <LBrow x={111} dir={1} look={look} />
      <LNose look={look} />
      <LMouth look={look} mouth={mouth} />
      {bareTop
        ? <><g filter={`url(#${uid}rough)`}><HairFront look={look} /></g><LHairDetail look={look} uid={uid} /></>
        : <g filter={`url(#${uid}rough)`}><HairFront look={look} underHat /></g>}
    </g>
  );
}

/** Tapered arm with a modelled hand (drawn as the viewer's left arm). */
function LArm({ look, sleeve, sleeveLen, pose, wrist, stars, hand, s, tattoo, handTat }: {
  look: Look; sleeve: string; sleeveLen: 'none' | 'short' | 'long'; pose: ArmPose; wrist?: Item; stars: number; hand: 'open' | 'thumb' | 'fist'; s: number; tattoo?: Item; handTat?: Item;
}) {
  const sx = 100 - s + 8;
  const sy = 130;
  const UP = 54;
  const FORE = 50;
  const skin = look.skin;
  const foreFill = sleeveLen === 'long' ? sleeve : skin;
  const sk = shade(skin, -0.3);
  const upper = `M${sx - 12} ${sy - 2} C${sx - 13.5} ${sy + 18} ${sx - 11.5} ${sy + UP - 14} ${sx - 10} ${sy + UP + 2} L${sx + 10} ${sy + UP + 2} C${sx + 11} ${sy + UP - 14} ${sx + 12.5} ${sy + 18} ${sx + 12} ${sy - 2} C${sx + 8} ${sy - 11} ${sx - 8} ${sy - 11} ${sx - 12} ${sy - 2} Z`;
  const shortSleeve = `M${sx - 12} ${sy - 2} C${sx - 13.4} ${sy + 12} ${sx - 13.4} ${sy + 22} ${sx - 13} ${sy + 32} L${sx + 13} ${sy + 32} C${sx + 13.4} ${sy + 22} ${sx + 13.4} ${sy + 12} ${sx + 12} ${sy - 2} C${sx + 8} ${sy - 11} ${sx - 8} ${sy - 11} ${sx - 12} ${sy - 2} Z`;
  const ey = sy + UP;
  const fore = `M${sx - 10} ${ey - 4} C${sx - 10.6} ${ey + 16} ${sx - 8.2} ${ey + FORE - 8} ${sx - 7.4} ${ey + FORE + 1} L${sx + 7.4} ${ey + FORE + 1} C${sx + 8.2} ${ey + FORE - 8} ${sx + 10.6} ${ey + 16} ${sx + 10} ${ey - 4} Z`;
  return (
    <g transform={`rotate(${pose.s} ${sx} ${sy})`}>
      <path d={upper} fill={sleeveLen === 'long' ? sleeve : skin} />
      {sleeveLen === 'short' && <><path d={shortSleeve} fill={sleeve} /><path d={`M${sx - 13} ${sy + 30} L${sx + 13} ${sy + 30}`} stroke={shade(sleeve, -0.15)} strokeWidth="2.4" /></>}
      <path d={`M${sx + 4} ${sy - 4} C${sx + 9} ${sy + 18} ${sx + 8} ${sy + UP - 10} ${sx + 7} ${sy + UP + 2} L${sx + 10} ${sy + UP + 2} C${sx + 11} ${sy + UP - 14} ${sx + 12.5} ${sy + 18} ${sx + 12} ${sy - 2} Z`} fill="#000" opacity=".14" />
      {sleeveLen === 'long' && <path d={`M${sx - 9} ${sy + UP - 6} Q${sx} ${sy + UP - 2} ${sx + 9} ${sy + UP - 7}`} stroke={shade(sleeve, -0.25)} strokeWidth="1" fill="none" opacity=".7" />}
      {Array.from({ length: Math.min(stars, 5) }, (_, i) => (
        <path key={i} transform={`translate(${sx} ${sy + 10 + i * 8}) scale(.5)`} d="M0 -6 L1.8 -1.8 L6.5 -1.8 L2.7 1.2 L4 6 L0 3.2 L-4 6 L-2.7 1.2 L-6.5 -1.8 L-1.8 -1.8 Z" fill="#f0cf86" />
      ))}
      <g transform={`rotate(${pose.e} ${sx} ${ey})`}>
        <circle cx={sx} cy={ey} r="10" fill={foreFill} />
        <path d={fore} fill={foreFill} />
        <path d={`M${sx + 3.5} ${ey} C${sx + 6} ${ey + 16} ${sx + 5} ${ey + FORE - 8} ${sx + 4.5} ${ey + FORE + 1} L${sx + 7.4} ${ey + FORE + 1} C${sx + 8.2} ${ey + FORE - 8} ${sx + 10.6} ${ey + 16} ${sx + 10} ${ey - 4} Z`} fill="#000" opacity=".12" />
        {sleeveLen === 'long' && <rect x={sx - 8.6} y={ey + FORE - 6} width="17.2" height="6" rx="1.5" fill={shade(sleeve, -0.12)} />}
        {sleeveLen !== 'long' && tattoo && <TattooAt item={tattoo} x={sx} y={ey + FORE / 2 - 2} />}
        {wrist && (wrist.kind === 'watch'
          ? <g><rect x={sx - 8} y={ey + FORE - 7} width="16" height="5.5" rx="1" fill={shade(wrist.c1, -0.2)} /><circle cx={sx} cy={ey + FORE - 4.2} r="4" fill={wrist.c1} /><circle cx={sx} cy={ey + FORE - 4.2} r="2.7" fill={wrist.c2} /></g>
          : <rect x={sx - 8} y={ey + FORE - 5} width="16" height="2.6" rx="1.3" fill={wrist.c1} />)}
        <g transform={`translate(${sx} ${ey + FORE + 4}) rotate(${hand === 'open' ? 0 : -(pose.s + pose.e)})`}>
          {hand === 'open' ? (
            <g>
              <path d="M-7 -3 C-8.6 4 -7.6 11 -3.6 14.6 C-0.6 16.8 3.6 16 5.6 12.4 C7.6 8.4 7.8 1.6 7 -3 Z" fill={skin} />
              <path d="M6 -1 C10 1 11 6 9.2 9 C8.2 10.4 6.6 9.6 6.2 7.6 Z" fill={skin} />
              <path d="M-3.2 6 L-3 13 M0.6 7 L0.7 15 M4.2 6 L4 12.4" stroke={sk} strokeWidth=".7" opacity=".5" />
              <path d="M4.5 -2 C7 4 6.5 10 4.5 14" stroke={sk} strokeWidth="2.6" opacity=".18" fill="none" />
              {handTat && <TattooAt item={handTat} x={0} y={3.5} scale={0.46} />}
            </g>
          ) : (
            <g>
              <path d="M-8 -6 C-9.4 1 -8.4 7 -5 9.4 C-1 11.4 4.4 11 7 8 C9 4.6 9 -2 8 -6 Z" fill={skin} />
              <path d="M-6 3 L6.8 3 M-6.6 6.6 L5.6 6.6" stroke={sk} strokeWidth=".7" opacity=".55" />
              {hand === 'thumb' && <path d="M-2.6 -5 C-3.4 -12 -2.4 -19 0.6 -20 C3.6 -20.6 4.4 -14 3.6 -5 Z" fill={skin} />}
              {hand === 'thumb' && <path d="M2.6 -18 C3.4 -14 3.2 -9 2.6 -5" stroke={sk} strokeWidth="1.6" opacity=".25" fill="none" />}
            </g>
          )}
        </g>
      </g>
    </g>
  );
}

/** Light from the upper left: a shadow down the right of the body, a highlight on the left shoulder. */
function LBodyShading({ s, w, hem, h, legsKind }: { s: number; w: number; hem: number; h: number; legsKind?: string }) {
  return (
    <g pointerEvents="none">
      <path d={`M${100 + s * 0.32} 119 L${100 + s - 9} 118.5 Q${100 + s} 120.5 ${100 + s} 132 L${100 + w + 2} ${hem} L${100 + w * 0.42} ${hem} Q${100 + s * 0.5} 170 ${100 + s * 0.32} 119 Z`} fill="#000" opacity=".13" />
      <path d={`M${100 - s + 9} 119 Q${100 - s + 1} 122 ${100 - s + 2} 136 Q${100 - s + 10} 128 ${100 - s * 0.4} 121 Z`} fill="#fff" opacity=".08" />
      <path d={`M${100 - w + 6} ${hem - 30} Q100 ${hem - 24} ${100 + w - 6} ${hem - 30}`} stroke="#000" strokeWidth="1" fill="none" opacity=".08" />
      {(legsKind === undefined || !['skirt', 'pleated', 'shorts'].includes(legsKind)) && (
        <g stroke="#000" fill="none" opacity=".16">
          <path d={`M${100 - h + 6} 300 Q${100 - h / 2 - 2} 305 ${100 - 6} 300 M${100 + 6} 300 Q${100 + h / 2 + 2} 305 ${100 + h - 6} 300`} strokeWidth="1" />
          <path d={`M${100 - 3} 240 L${100 - 5} 360`} strokeWidth="2.5" opacity=".6" />
        </g>
      )}
    </g>
  );
}

// ------------------------------------------------------------------------- component

export interface CharacterProps {
  look: Look;
  pose?: Pose;
  animate?: boolean;
  extras?: Extras;
  /** 'full' = whole body; 'bust' = head and shoulders (for lists); 'seated' = to the waist (seated at a table). */
  crop?: 'full' | 'bust' | 'seated';
  className?: string;
  title?: string;
  width?: number | string;
  height?: number | string;
  /** Hide the ground shadow (e.g. when shown on a table). */
  noShadow?: boolean;
  /** Override the drawing style (otherwise the app setting). */
  variant?: CharStyle;
}

export function Character(props: CharacterProps) {
  const ctx = useContext(CharStyleContext);
  return (props.variant ?? ctx) === 'lounge' ? <LoungeCharacter {...props} /> : <ClassicCharacter {...props} />;
}

const HEM: Record<string, number> = { vest: 238, cardigan: 244, bomber: 236, leather: 236, denim: 236 };
/** The head is drawn a little smaller in Lounge, for grown-up proportions. */
const L_HEAD = 'translate(100 104) scale(.84) translate(-100 -104)';
/** …and the body a touch leaner. */
const L_BODY = 'translate(100 0) scale(.92 1) translate(-100 0)';

function LoungeCharacter({ look, pose = 'idle', animate = false, extras = {}, crop = 'full', className = '', title, width, height, noShadow }: CharacterProps) {
  const uid = `c${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const angles = usePoseAngles(pose, animate);
  const p = POSES[pose] ?? POSES.idle;
  const dims = DIMS[look.build] ?? DIMS.regular;
  const item = (slot: WearSlot) => getItem(look.wear[slot]);
  const top = item('top') ?? getItem('tee-white')!;
  const jacket = item('jacket');
  const sleeveSrc = jacket && jacket.kind !== 'vest' ? jacket : top;
  const sleeveLen: 'none' | 'short' | 'long' = sleeveSrc === top ? (SHORT_SLEEVES.includes(top.kind) ? 'short' : 'long') : 'long';
  const hat = item('hat');
  const ink = inkOf(item);
  const mouth = (p.mouth ?? look.mouth) as Mouth | 'open' | 'frown';
  const viewBox = crop === 'bust' ? '42 17 116 116' : crop === 'seated' ? SEATED_VIEW : '0 -14 200 410';
  const handR: 'open' | 'thumb' | 'fist' = pose === 'thumbs' ? 'thumb' : pose === 'fistpump' ? 'fist' : 'open';
  const rightOverHead = pose === 'facepalm' || pose === 'tiphat';
  const hem = jacket ? HEM[jacket.kind] ?? 248 : 234;
  const sk = shade(look.skin, -0.32);
  const rightArm = (
    <g transform="translate(200 0) scale(-1 1)">
      <LArm look={look} sleeve={shade(sleeveSrc.c1, -0.04)} sleeveLen={sleeveLen} pose={angles.r} stars={0} hand={handR} s={dims.s} />
    </g>
  );
  return (
    <svg className={`character is-lounge ${className}`} viewBox={viewBox} width={width} height={height} role="img" aria-label={title ?? 'Character'} preserveAspectRatio="xMidYMax meet">
      {!noShadow && crop === 'full' && <ellipse cx="100" cy="384" rx="54" ry="8" fill="#000" opacity=".35" />}
      <g transform={L_HEAD}><LHairBack look={look} uid={uid} /></g>
      <g transform={L_BODY}>
      <Legs item={item('legs')} look={look} h={dims.h} />
      <Shoes item={item('shoes')} />
      <path d="M91.5 92 C91 104 90 114 88 126 L112 126 C110 114 109 104 108.5 92 Z" fill={look.skin} />
      <path d="M90 95 Q100 109 110 95 L110.6 106 Q100 115 89.4 106 Z" fill={sk} opacity=".4" />
      <path d="M105 104 C106 112 107 118 109 125" stroke={sk} strokeWidth="2" opacity=".25" fill="none" />
      {ink.neck && <TattooAt item={ink.neck} x={105} y={112} scale={0.42} rotate={-8} />}
      <Top item={top} s={dims.s} w={dims.w} />
      {item('neck') && <Neck item={item('neck')!} />}
      {jacket && <Jacket item={jacket} s={dims.s} w={dims.w} extras={extras} />}
      {item('pin') && <Pin item={item('pin')!} s={dims.s} />}
      <LBodyShading s={dims.s} w={dims.w} hem={hem} h={dims.h} legsKind={item('legs')?.kind} />
      {extras.belt && <TitleBelt />}
      <LArm look={look} sleeve={sleeveSrc.c1} sleeveLen={sleeveLen} pose={angles.l} wrist={item('wrist')} stars={jacket?.kind === 'champion' ? extras.stars ?? 0 : 0} hand="open" s={dims.s} tattoo={ink.arm} handTat={ink.hand} />
      {!rightOverHead && rightArm}
      </g>
      <g transform={L_HEAD}>
        <LHead look={look} mouth={mouth} hat={hat} lift={!!p.hatLift} uid={uid} />
        {item('glasses') && <Glasses item={item('glasses')!} />}
        {hat && <Hat item={hat} lift={!!p.hatLift} />}
      </g>
      {rightOverHead && <g transform={L_BODY}>{rightArm}</g>}
    </svg>
  );
}

const SHORT_SLEEVES = ['tee', 'polo', 'hawaiian'];
/** Head to waist, wide enough for arms resting forward. */
export const SEATED_VIEW = '30 18 140 196';

function ClassicCharacter({ look, pose = 'idle', animate = false, extras = {}, crop = 'full', className = '', title, width, height, noShadow }: CharacterProps) {
  const angles = usePoseAngles(pose, animate);
  const p = POSES[pose] ?? POSES.idle;
  const dims = DIMS[look.build] ?? DIMS.regular;
  const item = (slot: WearSlot) => getItem(look.wear[slot]);
  const top = item('top') ?? getItem('tee-white')!;
  const jacket = item('jacket');
  const sleeveSrc = jacket && jacket.kind !== 'vest' ? jacket : top;
  const sleeveLen: 'none' | 'short' | 'long' = sleeveSrc === top ? (SHORT_SLEEVES.includes(top.kind) ? 'short' : 'long') : 'long';
  const hat = item('hat');
  const ink = inkOf(item);
  const mouth = (p.mouth ?? look.mouth) as Mouth | 'open' | 'frown';
  const viewBox = crop === 'bust' ? '38 14 124 124' : crop === 'seated' ? SEATED_VIEW : '0 -14 200 410';
  const handR: 'open' | 'thumb' | 'fist' = pose === 'thumbs' ? 'thumb' : pose === 'fistpump' ? 'fist' : 'open';
  const rightOverHead = pose === 'facepalm' || pose === 'tiphat';

  return (
    <svg className={`character ${className}`} viewBox={viewBox} width={width} height={height} role="img" aria-label={title ?? 'Character'} preserveAspectRatio="xMidYMax meet">
      {!noShadow && crop === 'full' && <ellipse cx="100" cy="384" rx="54" ry="8" fill="#000" opacity=".35" />}
      <HairBack look={look} />
      <Legs item={item('legs')} look={look} h={dims.h} />
      <Shoes item={item('shoes')} />
      <rect x="89" y="94" width="22" height="32" rx="8" fill={look.skin} />
      <rect x="89" y="100" width="22" height="8" fill="#000" opacity=".1" />
      {ink.neck && <TattooAt item={ink.neck} x={105} y={112} scale={0.42} rotate={-8} />}
      <Top item={top} s={dims.s} w={dims.w} />
      {item('neck') && <Neck item={item('neck')!} />}
      {jacket && <Jacket item={jacket} s={dims.s} w={dims.w} extras={extras} />}
      {item('pin') && <Pin item={item('pin')!} s={dims.s} />}
      {extras.belt && <TitleBelt />}
      <Arm look={look} sleeve={sleeveSrc.c1} sleeveLen={sleeveLen} pose={angles.l} wrist={item('wrist')} stars={jacket?.kind === 'champion' ? extras.stars ?? 0 : 0} hand="open" s={dims.s} tattoo={ink.arm} handTat={ink.hand} />
      {!rightOverHead && (
        <g transform="translate(200 0) scale(-1 1)">
          <Arm look={look} sleeve={sleeveSrc.c1} sleeveLen={sleeveLen} pose={angles.r} stars={0} hand={handR} s={dims.s} />
        </g>
      )}
      {/* head */}
      <ellipse cx="70.5" cy="74" rx="5" ry="7.5" fill={look.skin} />
      <ellipse cx="129.5" cy="74" rx="5" ry="7.5" fill={look.skin} />
      <path d="M70 62 Q70 33 100 33 Q130 33 130 62 L129 78 Q126 99 100 103 Q74 99 71 78 Z" fill={look.skin} />
      <FacialHairLayer look={look} />
      <Face look={look} mouth={mouth} />
      {(!hat || ['visor', 'crown'].includes(hat.kind)) && <HairFront look={look} />}
      {hat && !['visor', 'crown'].includes(hat.kind) && <HairFront look={look} underHat />}
      {item('glasses') && <Glasses item={item('glasses')!} />}
      {hat && <Hat item={hat} lift={!!p.hatLift} />}
      {/* a hand on the face or hat goes in front of the head */}
      {rightOverHead && (
        <g transform="translate(200 0) scale(-1 1)">
          <Arm look={look} sleeve={sleeveSrc.c1} sleeveLen={sleeveLen} pose={angles.r} stars={0} hand={handR} s={dims.s} />
        </g>
      )}
    </svg>
  );
}
