// Looks for players and club members, plus migration from the old head-only avatars.

import { DEFAULT_LOOK, SKIN_TONES, type Build, type Brows, type Eyes, type FacialHair, type HairStyle, type Look, type Mouth } from '../design/Character.tsx';
import type { WearSlot } from './catalogue.ts';

const OLD_OUTFIT_TO_BLAZER: Record<string, string> = {
  '#2f3e66': 'blazer-navy', '#5b1f2a': 'blazer-oxblood', '#1f4a3b': 'blazer-bottle',
  '#3a2c4f': 'blazer-plum', '#5a4632': 'blazer-tobacco', '#24282e': 'blazer-charcoal',
};
const OLD_SKIN: Record<string, string> = {
  '#f3d2b3': SKIN_TONES[0], '#e6b48f': SKIN_TONES[2], '#c98d63': SKIN_TONES[3], '#a8693f': SKIN_TONES[4], '#7d4a2b': SKIN_TONES[6], '#4f2f1c': SKIN_TONES[7],
};

/** Accepts any saved look (old v1 head avatar or v2) and returns a valid v2 Look. */
export function migrateLook(input: unknown): Look {
  const o = (input ?? {}) as Record<string, unknown>;
  if (o.v === 2 && o.wear) {
    const wear = { ...(o.wear as Look['wear']) };
    // Neck tattoos used to share the arm slot.
    if (wear.tattoo === 'tat-swallow' || wear.tattoo === 'tat-stars') { wear.necktat = wear.necktat ?? wear.tattoo; delete wear.tattoo; }
    return { ...DEFAULT_LOOK, ...(o as Partial<Look>), wear } as Look;
  }
  const acc = o.accessory as string | undefined;
  const wear: Look['wear'] = {
    top: 'shirt-white', jacket: OLD_OUTFIT_TO_BLAZER[o.outfit as string] ?? 'blazer-navy', legs: 'trousers-charcoal', shoes: 'oxford-black', neck: 'tie-red',
  };
  if (acc === 'glasses') wear.glasses = 'round-gold';
  if (acc === 'shades') wear.glasses = 'shades-black';
  return {
    ...DEFAULT_LOOK,
    skin: OLD_SKIN[o.skin as string] ?? (typeof o.skin === 'string' ? o.skin : DEFAULT_LOOK.skin),
    hair: (o.hair as HairStyle) ?? DEFAULT_LOOK.hair,
    hairColor: (o.hairColor as string) ?? DEFAULT_LOOK.hairColor,
    backdrop: (o.backdrop as string) ?? DEFAULT_LOOK.backdrop,
    wear,
  };
}

type W = Partial<Record<WearSlot, string>>;
const L = (skin: number, hair: HairStyle, hairColor: string, build: Build, eyes: Eyes, brows: Brows, mouth: Mouth, facialHair: FacialHair, backdrop: string, wear: W): Look =>
  ({ v: 2, skin: SKIN_TONES[skin], hair, hairColor, build, eyes, brows, mouth, facialHair, backdrop, wear });

/** Every member's full look. Each wears their signature item, which you can win from them. */
export const MEMBER_LOOKS: Record<string, Look> = {
  mags: L(2, 'bun', '#b8b2a6', 'slim', 'sleepy', 'arched', 'smile', 'none', '#2a3a33', { top: 'turtle-cream', jacket: 'cardigan-forest', legs: 'skirt-plaid', shoes: 'loafer-burgundy', glasses: 'sig-mags', neck: 'pearls' }),
  rocco: L(3, 'slick', '#141010', 'broad', 'narrow', 'bold', 'smirk', 'stubble', '#3d2226', { top: 'shirt-black', jacket: 'blazer-oxblood', legs: 'trousers-black', shoes: 'oxford-black', glasses: 'sig-rocco', neck: 'chain-gold' }),
  pip: L(7, 'curly', '#141010', 'slim', 'wide', 'soft', 'grin', 'none', '#33293d', { top: 'hoodie-wine', jacket: 'denim-blue', legs: 'jeans-black', shoes: 'trainer-red', hat: 'sig-pip' }),
  juniper: L(0, 'long', '#d4a858', 'slim', 'wide', 'soft', 'smile', 'none', '#22303d', { top: 'shirt-blue', jacket: 'cardigan-oat', legs: 'chinos-stone', shoes: 'trainer-white', neck: 'sig-juniper' }),
  silas: L(4, 'bald', '#141010', 'regular', 'narrow', 'bold', 'neutral', 'moustache', '#3d2f1f', { top: 'shirt-white', jacket: 'vest-dealer', legs: 'pinstripe', shoes: 'oxford-brown', glasses: 'square-black', neck: 'sig-silas', wrist: 'watch-steel' }),
  dot: L(2, 'short', '#8d2f23', 'slim', 'round', 'arched', 'smirk', 'none', '#3b2b22', { top: 'tee-black', jacket: 'leather-black', legs: 'skirt-black', shoes: 'sig-dot', neck: 'chain-gold' }),
  teddy: L(6, 'buzz', '#141010', 'broad', 'round', 'bold', 'grin', 'goatee', '#2a3a33', { top: 'polo-green', jacket: 'bomber-olive', legs: 'chinos-olive', shoes: 'boot-tan', neck: 'sig-teddy', wrist: 'watch-gold' }),
  lena: L(0, 'curly', '#8d2f23', 'slim', 'wide', 'arched', 'smile', 'none', '#33293d', { top: 'turtle-black', jacket: 'blazer-plum', legs: 'trousers-cream', shoes: 'heel-black', glasses: 'sig-lena' }),
  frank: L(2, 'short', '#ece6dc', 'broad', 'sleepy', 'bold', 'neutral', 'beard', '#3d2f1f', { top: 'shirt-blue', jacket: 'blazer-tobacco', legs: 'cords-tan', shoes: 'boot-tan', hat: 'sig-frank', neck: 'tie-green' }),
  ines: L(3, 'long', '#141010', 'slim', 'narrow', 'arched', 'smirk', 'none', '#3d2226', { top: 'shirt-white', jacket: 'vest-dealer', legs: 'trousers-black', shoes: 'heel-red', hat: 'sig-ines', neck: 'bowtie-black' }),
  wes: L(1, 'quiff', '#d4a858', 'regular', 'round', 'soft', 'grin', 'stubble', '#22303d', { top: 'tee-white', jacket: 'sig-wes', legs: 'jeans-blue', shoes: 'boot-tan', glasses: 'aviator' }),
  priya: L(4, 'bun', '#141010', 'slim', 'round', 'arched', 'smile', 'none', '#2a3a33', { top: 'shirt-white', jacket: 'blazer-bottle', legs: 'trousers-navy', shoes: 'loafer-burgundy', glasses: 'round-tortoise', pin: 'sig-priya' }),
  gus: L(2, 'curly', '#7a4a24', 'broad', 'round', 'soft', 'grin', 'beard', '#3b2b22', { top: 'polo-navy', jacket: 'cardigan-oat', legs: 'chinos-stone', shoes: 'trainer-white', neck: 'sig-gus' }),
  mei: L(0, 'bob', '#141010', 'slim', 'narrow', 'soft', 'neutral', 'none', '#22303d', { top: 'sig-mei', jacket: 'blazer-charcoal', legs: 'trousers-black', shoes: 'oxford-black', wrist: 'watch-steel' }),
  otis: L(7, 'bald', '#141010', 'regular', 'narrow', 'bold', 'smirk', 'goatee', '#3d2226', { top: 'shirt-black', jacket: 'blazer-charcoal', legs: 'pinstripe', shoes: 'spectator', hat: 'sig-otis', glasses: 'shades-black', pin: 'chip-pin' }),
  rosa: L(3, 'curly', '#2e1d14', 'regular', 'wide', 'arched', 'grin', 'none', '#33293d', { top: 'sig-rosa', legs: 'trousers-black', shoes: 'heel-red', neck: 'chain-gold', wrist: 'bracelet-gold' }),
  nigel: L(0, 'short', '#b8b2a6', 'slim', 'round', 'soft', 'smile', 'none', '#22303d', { top: 'shirt-white', jacket: 'blazer-navy', legs: 'trousers-cream', shoes: 'oxford-brown', glasses: 'sig-nigel', neck: 'tie-stripe' }),
  ama: L(6, 'afro', '#141010', 'regular', 'wide', 'arched', 'smile', 'none', '#2a3a33', { top: 'turtle-black', jacket: 'blazer-bottle', legs: 'trousers-black', shoes: 'heel-black', neck: 'sig-ama' }),
  declan: L(1, 'quiff', '#8d2f23', 'regular', 'round', 'bold', 'grin', 'stubble', '#3d2226', { top: 'tee-white', jacket: 'sig-declan', legs: 'jeans-blue', shoes: 'trainer-white', neck: 'chain-gold' }),
  hattie: L(1, 'bob', '#ece6dc', 'regular', 'sleepy', 'arched', 'neutral', 'none', '#3b2b22', { top: 'shirt-white', jacket: 'sig-hattie', legs: 'skirt-plaid', shoes: 'loafer-burgundy', glasses: 'round-gold', neck: 'pearls' }),
  kofi: L(7, 'buzz', '#141010', 'regular', 'narrow', 'soft', 'smirk', 'beard', '#2a3a33', { top: 'turtle-black', jacket: 'sig-kofi', legs: 'trousers-black', shoes: 'oxford-black', wrist: 'watch-gold' }),
  bea: L(0, 'ponytail', '#d4a858', 'slim', 'wide', 'soft', 'grin', 'none', '#33293d', { top: 'tee-red', jacket: 'denim-blue', legs: 'skirt-black', shoes: 'boot-tan', hat: 'sig-bea' }),
  marcus: L(4, 'slick', '#141010', 'broad', 'narrow', 'bold', 'smirk', 'stubble', '#22303d', { top: 'shirt-white', jacket: 'blazer-navy', legs: 'pinstripe', shoes: 'sig-marcus', glasses: 'shades-black', neck: 'tie-gold', pin: 'pocket-white' }),
  sal: L(3, 'bald', '#b8b2a6', 'broad', 'sleepy', 'bold', 'neutral', 'moustache', '#3d2226', { top: 'shirt-white', jacket: 'vest-brocade', legs: 'trousers-charcoal', shoes: 'oxford-black', hat: 'sig-sal', neck: 'bowtie-red' }),
  tilly: L(1, 'curly', '#d4a858', 'slim', 'wide', 'soft', 'grin', 'none', '#2a3a33', { top: 'shirt-pink', jacket: 'cardigan-forest', legs: 'chinos-stone', shoes: 'trainer-white', glasses: 'round-gold', pin: 'sig-tilly' }),
};

export const STARTER_LOOKS: Array<{ name: string; wear: W }> = [
  { name: 'Club classic', wear: { top: 'shirt-white', jacket: 'blazer-navy', legs: 'trousers-charcoal', shoes: 'oxford-black', neck: 'tie-red' } },
  { name: 'Smart casual', wear: { top: 'shirt-blue', jacket: 'blazer-charcoal', legs: 'jeans-blue', shoes: 'oxford-brown' } },
  { name: 'Off duty', wear: { top: 'tee-white', legs: 'jeans-blue', shoes: 'trainer-white' } },
  { name: 'After hours', wear: { top: 'tee-black', jacket: 'blazer-charcoal', legs: 'trousers-navy', shoes: 'oxford-black', neck: 'tie-navy' } },
];

/** The little thing each member keeps by their seat (table props from the shop). */
export const MEMBER_PROPS: Record<string, string> = {
  mags: 'prop-coffee', rocco: 'prop-whisky', pip: 'prop-duck', juniper: 'prop-lemonade', silas: 'prop-chips', dot: 'prop-dice',
  teddy: 'prop-horseshoe', lena: 'prop-martini', frank: 'prop-coffee', ines: 'prop-crystal', wes: 'prop-whisky', priya: 'prop-plant',
  gus: 'prop-gnome', mei: 'prop-luckycat', otis: 'prop-martini', rosa: 'prop-lemonade', nigel: 'prop-plant', ama: 'prop-crystal',
  declan: 'prop-dice', hattie: 'prop-coffee', kofi: 'prop-chips', bea: 'prop-duck', marcus: 'prop-whisky', sal: 'prop-luckycat', tilly: 'prop-horseshoe',
};
