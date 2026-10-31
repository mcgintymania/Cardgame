// Everything a player can wear or own: clothing, table cosmetics, celebrations, emotes.
// Items are data; the Character renderer draws them by `kind` and colours.

import { activeSeason, type SeasonId } from './seasons.ts';

export type WearSlot = 'hat' | 'glasses' | 'top' | 'jacket' | 'legs' | 'shoes' | 'neck' | 'wrist' | 'pin' | 'tattoo' | 'necktat' | 'handtat';
export type TableSlot = 'felt' | 'wood' | 'cardback' | 'celebration' | 'prop';
export type ItemSlot = WearSlot | TableSlot | 'emote';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type TierId = 'member' | 'regular' | 'gold' | 'black';

export type Unlock =
  | { kind: 'starter' }
  | { kind: 'shop'; price: number; tier?: TierId }
  | { kind: 'level'; level: number }
  | { kind: 'signature'; member: string; wins: number }
  | { kind: 'achievement'; key: AchievementKey }
  /** Earned by playing: N games (of one game, or any). */
  | { kind: 'play'; count: number; game?: PlayGame }
  /** Earned by winning: N wins (of one game, or any). */
  | { kind: 'win'; count: number; game?: PlayGame };

/** Every game you can play, including the solo ones. */
export type PlayGame = 'take2' | 'poker' | 'hearts' | 'gin' | 'draw' | 'blackjack' | 'solitaire' | 'pyramid';
export const PLAY_GAMES: PlayGame[] = ['take2', 'poker', 'hearts', 'gin', 'draw', 'blackjack', 'solitaire', 'pyramid'];
export const PLAY_GAME_NAMES: Record<PlayGame, string> = {
  take2: 'Take 2', poker: "Hold'em", hearts: 'Hearts', gin: 'Gin Rummy', draw: 'Five-Card Draw', blackjack: 'Blackjack', solitaire: 'Solitaire', pyramid: 'Beat the Pyramid',
};

/** Club achievements (titles, Cups) plus feats you pull off during a game. */
export type FeatKey =
  | 'rainbow' | 'passSkip' | 'stackTwos' | 'moon' | 'spotless' | 'gin' | 'undercut'
  | 'fullHouse' | 'quads' | 'royalFlush' | 'steal' | 'allInWin' | 'natural' | 'charlie' | 'doubleWin'
  | 'patience' | 'speedster' | 'dailyDeal' | 'summit' | 'pyramid9' | 'streak3' | 'allRounder';
export type AchievementKey = 'firstWin' | 'cupWinner' | 'titleWinner' | 'champion' | 'cups3' | 'defences3' | 'beat10' | FeatKey;

export interface Item {
  id: string;
  name: string;
  slot: ItemSlot;
  /** Drawing variant within the slot, e.g. 'blazer', 'fedora'. */
  kind: string;
  c1: string;
  c2?: string;
  c3?: string;
  rarity: Rarity;
  unlock: Unlock;
  desc?: string;
  /** Seasonal items are featured at that time of year (they can be bought all year). */
  season?: SeasonId;
}

export const TIERS: Array<{ id: TierId; name: string; level: number; blurb: string }> = [
  { id: 'member', name: 'Member', level: 1, blurb: 'Welcome to the club.' },
  { id: 'regular', name: 'Regular', level: 5, blurb: 'Your usual chair is waiting.' },
  { id: 'gold', name: 'Gold Member', level: 12, blurb: 'Velvet, top hats and the black felt.' },
  { id: 'black', name: 'Black Card', level: 20, blurb: 'The best of the house.' },
];

export const ACHIEVEMENTS: Record<AchievementKey, { name: string; how: string; game?: PlayGame }> = {
  firstWin: { name: 'First win', how: 'Win any table.' },
  cupWinner: { name: 'Cup winner', how: 'Win a Club Cup.' },
  titleWinner: { name: 'Title winner', how: 'Win a title.' },
  champion: { name: 'Champion', how: 'Win a title or a Club Cup.' },
  cups3: { name: 'Cup collector', how: 'Win three Club Cups.' },
  defences3: { name: 'Unbeaten', how: 'Defend a title three times in one reign.' },
  beat10: { name: 'Clubbable', how: 'Beat ten different members head to head.' },
  rainbow: { name: 'Rainbow hand', how: 'Get down to four cards, one of each suit (Take 2 or Hearts).', game: 'take2' },
  passSkip: { name: 'Not today', how: 'Get hit with an 8 and pass the skip on with your own (Take 2).', game: 'take2' },
  stackTwos: { name: 'Double trouble', how: 'Stack a 2 on top of a 2 (Take 2).', game: 'take2' },
  moon: { name: 'Over the moon', how: 'Shoot the moon (Hearts).', game: 'hearts' },
  spotless: { name: 'Spotless', how: 'Take no points at all in a hand (Hearts).', game: 'hearts' },
  gin: { name: 'Gin!', how: 'Go gin (Gin Rummy).', game: 'gin' },
  undercut: { name: 'Undercut', how: 'Undercut a knock (Gin Rummy).', game: 'gin' },
  fullHouse: { name: 'Full house', how: "Win a pot with a full house or better (Hold'em or Draw).", game: 'poker' },
  quads: { name: 'Four of a kind', how: 'Win a pot with four of a kind or better.', game: 'poker' },
  royalFlush: { name: 'Royal flush', how: 'Win a pot with a royal flush.', game: 'poker' },
  steal: { name: 'Nerves of steel', how: 'Bet or raise and take the pot without a showdown.', game: 'poker' },
  allInWin: { name: 'All in', how: 'Go all in and win the showdown.', game: 'poker' },
  natural: { name: 'Natural', how: 'Get dealt a blackjack.', game: 'blackjack' },
  charlie: { name: 'Five-card Charlie', how: 'Win a blackjack hand holding five or more cards.', game: 'blackjack' },
  doubleWin: { name: 'Doubled up', how: 'Double down and win (Blackjack).', game: 'blackjack' },
  patience: { name: 'Patience', how: 'Win a game of Solitaire.', game: 'solitaire' },
  speedster: { name: 'Speedster', how: 'Win Solitaire in under three minutes.', game: 'solitaire' },
  dailyDeal: { name: 'Daily dealer', how: 'Win the Solitaire Daily Deal.', game: 'solitaire' },
  summit: { name: 'Summit', how: 'Beat the Pyramid.', game: 'pyramid' },
  pyramid9: { name: 'Great pyramid', how: 'Beat a nine-row pyramid.', game: 'pyramid' },
  streak3: { name: 'Hot streak', how: 'Win three games in a row (any games).' },
  allRounder: { name: 'All-rounder', how: 'Play every game in the club at least once.' },
};
export const FEATS: FeatKey[] = ['rainbow', 'passSkip', 'stackTwos', 'moon', 'spotless', 'gin', 'undercut', 'fullHouse', 'quads', 'royalFlush', 'steal', 'allInWin', 'natural', 'charlie', 'doubleWin', 'patience', 'speedster', 'dailyDeal', 'summit', 'pyramid9', 'streak3', 'allRounder'];

const S = (): Unlock => ({ kind: 'starter' });
const $ = (price: number, tier?: TierId): Unlock => ({ kind: 'shop', price, tier });
const L = (level: number): Unlock => ({ kind: 'level', level });
const SIG = (member: string): Unlock => ({ kind: 'signature', member, wins: 5 });
const ACH = (key: AchievementKey): Unlock => ({ kind: 'achievement', key });
const PLAY = (count: number, game?: PlayGame): Unlock => ({ kind: 'play', count, game });
const WIN = (count: number, game?: PlayGame): Unlock => ({ kind: 'win', count, game });

const it = (id: string, name: string, slot: ItemSlot, kind: string, c1: string, rarity: Rarity, unlock: Unlock, c2?: string, c3?: string, desc?: string, season?: Item['season']): Item =>
  ({ id, name, slot, kind, c1, c2, c3, rarity, unlock, desc, season });

export const CATALOGUE: Item[] = [
  // ---------------------------------------------------------------- tops
  it('tee-white', 'White crew tee', 'top', 'tee', '#efe9dc', 'common', S()),
  it('tee-black', 'Black crew tee', 'top', 'tee', '#232226', 'common', S()),
  it('tee-red', 'Red crew tee', 'top', 'tee', '#9a2b2b', 'common', $(150)),
  it('shirt-white', 'White dress shirt', 'top', 'shirt', '#f4f1ea', 'common', S()),
  it('shirt-blue', 'Pale blue shirt', 'top', 'shirt', '#c9d8ea', 'common', S()),
  it('shirt-pink', 'Pink shirt', 'top', 'shirt', '#ecc8cc', 'common', $(200)),
  it('shirt-black', 'Black shirt', 'top', 'shirt', '#1d1d22', 'common', $(300)),
  it('polo-navy', 'Navy polo', 'top', 'polo', '#2f3e66', 'common', $(200)),
  it('polo-green', 'Green polo', 'top', 'polo', '#2a6a50', 'common', $(200)),
  it('turtle-black', 'Black turtleneck', 'top', 'turtle', '#1c1c20', 'rare', $(350)),
  it('turtle-cream', 'Cream turtleneck', 'top', 'turtle', '#e8dcc0', 'rare', $(350)),
  it('hoodie-grey', 'Grey hoodie', 'top', 'hoodie', '#6f7075', 'common', $(250)),
  it('hoodie-wine', 'Wine hoodie', 'top', 'hoodie', '#5b2333', 'common', $(250)),
  it('sequin-gold', 'Gold sequin top', 'top', 'sequin', '#c9a24a', 'epic', $(1400, 'gold'), '#f4dc8e'),

  // -------------------------------------------------------------- jackets
  it('blazer-navy', 'Navy blazer', 'jacket', 'blazer', '#2f3e66', 'common', S(), '#26324f', '#c9a24a'),
  it('blazer-charcoal', 'Charcoal blazer', 'jacket', 'blazer', '#2c3036', 'common', S(), '#22252a', '#9a9a9a'),
  it('blazer-oxblood', 'Oxblood blazer', 'jacket', 'blazer', '#5b1f2a', 'common', $(400), '#47161f', '#c9a24a'),
  it('blazer-bottle', 'Bottle-green blazer', 'jacket', 'blazer', '#1f4a3b', 'common', $(400), '#173a2e', '#c9a24a'),
  it('blazer-plum', 'Plum blazer', 'jacket', 'blazer', '#3a2c4f', 'common', $(400), '#2d223e', '#c9a24a'),
  it('blazer-tobacco', 'Tobacco blazer', 'jacket', 'blazer', '#5a4632', 'common', $(400), '#473726', '#2b2018'),
  it('blazer-club', 'Club crest blazer', 'jacket', 'blazer', '#16243f', 'rare', L(10), '#c9a24a', '#c9a24a', 'Navy with gold piping and the club crest.'),
  it('velvet-plum', 'Plum velvet smoking jacket', 'jacket', 'velvet', '#3d2448', 'epic', $(1600, 'gold'), '#1d1024', '#d9b45c'),
  it('velvet-emerald', 'Emerald velvet smoking jacket', 'jacket', 'velvet', '#1d4a3a', 'epic', $(1600, 'gold'), '#0f2a20', '#d9b45c'),
  it('leather-black', 'Black leather jacket', 'jacket', 'leather', '#1b1a1a', 'rare', $(900), '#0e0d0d', '#9a9a9a'),
  it('bomber-olive', 'Olive bomber', 'jacket', 'bomber', '#4a4a2a', 'common', $(600), '#7a3a1a'),
  it('denim-blue', 'Denim jacket', 'jacket', 'denim', '#3c5a80', 'common', $(450), '#2c4466', '#c9a24a'),
  it('cardigan-oat', 'Oatmeal cardigan', 'jacket', 'cardigan', '#c8b48a', 'common', $(350), '#a8946a'),
  it('cardigan-forest', 'Forest cardigan', 'jacket', 'cardigan', '#2d4a35', 'common', $(350), '#1d3324'),
  it('vest-dealer', "Dealer's waistcoat", 'jacket', 'vest', '#2a2420', 'rare', $(500), '#6b4a2a', '#c9a24a'),
  it('vest-brocade', 'Gold brocade waistcoat', 'jacket', 'vest', '#8a6a2a', 'epic', $(1800, 'gold'), '#c9a24a', '#f0cf86'),
  it('tux-black', 'Tuxedo jacket', 'jacket', 'tux', '#121214', 'epic', $(2500, 'gold'), '#2c2c34', '#d9d9d9'),
  it('dinner-white', 'White dinner jacket', 'jacket', 'tux', '#efe8da', 'legendary', $(3500, 'black'), '#141414', '#c9a24a', 'For Black Card members only.'),
  it('champion-jacket', "Champion's jacket", 'jacket', 'champion', '#4a1414', 'legendary', ACH('champion'), '#c9a24a', '#f0cf86', 'Gains a gold star on the sleeve for every title and Cup you win.'),

  // ----------------------------------------------------------------- legs
  it('trousers-charcoal', 'Charcoal trousers', 'legs', 'trousers', '#2e3138', 'common', S()),
  it('trousers-navy', 'Navy trousers', 'legs', 'trousers', '#273250', 'common', S()),
  it('jeans-blue', 'Blue jeans', 'legs', 'jeans', '#35507a', 'common', S()),
  it('trousers-black', 'Black trousers', 'legs', 'trousers', '#18181b', 'common', $(200)),
  it('trousers-cream', 'Cream trousers', 'legs', 'trousers', '#ddd0b0', 'common', $(300)),
  it('chinos-stone', 'Stone chinos', 'legs', 'trousers', '#b9a988', 'common', $(200)),
  it('chinos-olive', 'Olive chinos', 'legs', 'trousers', '#5d5b39', 'common', $(200)),
  it('jeans-black', 'Black jeans', 'legs', 'jeans', '#202024', 'common', $(250)),
  it('cords-tan', 'Tan corduroys', 'legs', 'cords', '#a2733f', 'common', $(350)),
  it('pinstripe', 'Pinstripe trousers', 'legs', 'pinstripe', '#23283a', 'rare', $(600), '#7a809a'),
  it('shorts-khaki', 'Khaki shorts', 'legs', 'shorts', '#a8976a', 'common', $(200)),
  it('skirt-black', 'Black pencil skirt', 'legs', 'skirt', '#18181b', 'common', $(250)),
  it('skirt-plaid', 'Plaid pleated skirt', 'legs', 'pleated', '#5b1f2a', 'common', $(350), '#c9a24a'),

  // ---------------------------------------------------------------- shoes
  it('oxford-black', 'Black oxfords', 'shoes', 'oxford', '#141414', 'common', S()),
  it('oxford-brown', 'Brown oxfords', 'shoes', 'oxford', '#4a2b18', 'common', S()),
  it('trainer-white', 'White trainers', 'shoes', 'trainer', '#f1ede4', 'common', S(), '#c9c2b2'),
  it('trainer-red', 'Red trainers', 'shoes', 'trainer', '#b8332d', 'common', $(250), '#f1ede4'),
  it('loafer-burgundy', 'Burgundy loafers', 'shoes', 'loafer', '#5b1f2a', 'common', $(350)),
  it('boot-tan', 'Tan boots', 'shoes', 'boot', '#8a5a2b', 'common', $(400)),
  it('heel-black', 'Black heels', 'shoes', 'heel', '#141414', 'common', $(400)),
  it('heel-red', 'Red heels', 'shoes', 'heel', '#a8232b', 'rare', $(450)),
  it('spectator', 'Two-tone spectators', 'shoes', 'oxford', '#f1ede4', 'rare', $(900), '#3a2414'),

  // ----------------------------------------------------------------- hats
  it('flatcap-tweed', 'Tweed flat cap', 'hat', 'flatcap', '#6b5a40', 'common', $(300), '#4a3e2a'),
  it('flatcap-black', 'Black flat cap', 'hat', 'flatcap', '#1d1d20', 'common', $(300), '#111'),
  it('beanie-red', 'Red beanie', 'hat', 'beanie', '#9a2b2b', 'common', $(200)),
  it('beanie-black', 'Black beanie', 'hat', 'beanie', '#202024', 'common', $(200)),
  it('fedora-grey', 'Grey fedora', 'hat', 'fedora', '#5a5a60', 'rare', $(600), '#1d1d22'),
  it('fedora-black', 'Black fedora', 'hat', 'fedora', '#18181b', 'rare', $(700), '#5b1f2a'),
  it('trilby-tan', 'Tan trilby', 'hat', 'trilby', '#a8875a', 'common', $(500), '#3a2414'),
  it('beret-black', 'Black beret', 'hat', 'beret', '#1d1d20', 'common', $(450)),
  it('bowler-black', 'Black bowler', 'hat', 'bowler', '#151517', 'rare', $(800)),
  it('visor-green', "Dealer's visor", 'hat', 'visor', '#2f8463', 'common', $(400)),
  it('tophat', 'Top hat', 'hat', 'tophat', '#141416', 'epic', $(2000, 'gold'), '#5b1f2a'),
  it('crown', 'Champion\'s crown', 'hat', 'crown', '#e2bd68', 'legendary', ACH('titleWinner'), '#a83434', '#2f8463', 'Only for those who have won a title.'),

  // -------------------------------------------------------------- glasses
  it('round-gold', 'Round gold frames', 'glasses', 'round', '#d4a94f', 'common', $(250)),
  it('round-tortoise', 'Tortoiseshell rounds', 'glasses', 'round', '#6b3a1a', 'common', $(250)),
  it('square-black', 'Square black frames', 'glasses', 'square', '#141414', 'common', $(200)),
  it('aviator', 'Aviators', 'glasses', 'aviator', '#c9a24a', 'rare', $(450), '#3a3a40'),
  it('shades-black', 'Black shades', 'glasses', 'shades', '#141414', 'common', $(350)),
  it('cateye-red', 'Red cat-eye frames', 'glasses', 'cateye', '#a8232b', 'rare', $(500)),
  it('monocle', 'Monocle', 'glasses', 'monocle', '#d4a94f', 'epic', $(1200, 'regular')),

  // ----------------------------------------------------------------- neck
  it('tie-red', 'Red tie', 'neck', 'tie', '#8f2424', 'common', S()),
  it('tie-navy', 'Navy tie', 'neck', 'tie', '#24305a', 'common', S()),
  it('tie-green', 'Green tie', 'neck', 'tie', '#24583f', 'common', $(150)),
  it('tie-gold', 'Gold tie', 'neck', 'tie', '#c9a24a', 'common', $(300)),
  it('tie-stripe', 'Club stripe tie', 'neck', 'stripetie', '#1d2440', 'rare', $(350), '#c9a24a'),
  it('bowtie-black', 'Black bow tie', 'neck', 'bowtie', '#141414', 'common', $(300)),
  it('bowtie-red', 'Red bow tie', 'neck', 'bowtie', '#9a2b2b', 'common', $(300)),
  it('bowtie-gold', 'Gold bow tie', 'neck', 'bowtie', '#d4a94f', 'rare', $(600)),
  it('scarf-cream', 'Cream scarf', 'neck', 'scarf', '#e8dcc0', 'common', $(400)),
  it('scarf-tartan', 'Tartan scarf', 'neck', 'scarf', '#8a2424', 'rare', $(500), '#1f4a3b'),
  it('chain-gold', 'Gold chain', 'neck', 'chain', '#e2bd68', 'rare', $(700)),
  it('pearls', 'Pearl necklace', 'neck', 'pearls', '#f4efe2', 'rare', $(900)),
  it('cravat', 'Paisley cravat', 'neck', 'cravat', '#7a2a4a', 'rare', $(800), '#c9a24a'),

  // ---------------------------------------------------------- wrist & pin
  it('watch-steel', 'Steel watch', 'wrist', 'watch', '#b8bcc4', 'common', $(400), '#1d2440'),
  it('watch-gold', 'Gold watch', 'wrist', 'watch', '#e2bd68', 'epic', $(1200, 'regular'), '#f4efe2'),
  it('bracelet-gold', 'Gold bracelet', 'wrist', 'bracelet', '#e2bd68', 'common', $(600)),
  it('pocket-white', 'White pocket square', 'pin', 'pocket', '#f4f1ea', 'common', $(150)),
  it('pocket-red', 'Red pocket square', 'pin', 'pocket', '#9a2b2b', 'common', $(200)),
  it('rose-red', 'Red rose buttonhole', 'pin', 'rose', '#b8232b', 'common', $(300), '#2f6a40'),
  it('chip-pin', 'Lucky chip pin', 'pin', 'chip', '#a83434', 'rare', $(500), '#f1e8d6'),
  it('ace-pin', 'Ace of spades pin', 'pin', 'ace', '#f4efe2', 'rare', $(400), '#141414'),
  it('cup-pin', "Cup winner's pin", 'pin', 'cup', '#e2bd68', 'legendary', ACH('cupWinner'), '#2f8463'),

  // ---------------------------------------------------- members' signatures
  it('sig-mags', "Mags's pearl spectacles", 'glasses', 'halfmoon', '#f4efe2', 'legendary', SIG('mags'), '#d4a94f'),
  it('sig-rocco', "Rocco's mirror shades", 'glasses', 'mirror', '#c9d1dc', 'legendary', SIG('rocco'), '#e2bd68'),
  it('sig-pip', "Pip's lucky beanie", 'hat', 'beanie', '#5a2a7a', 'legendary', SIG('pip'), '#e2bd68'),
  it('sig-juniper', "Juniper's first-night bow", 'neck', 'bowtie', '#9ec4d8', 'legendary', SIG('juniper')),
  it('sig-silas', "Silas's ledger tie", 'neck', 'stripetie', '#2a2a2a', 'legendary', SIG('silas'), '#3f7a5a'),
  it('sig-dot', "Dot's red loafers", 'shoes', 'loafer', '#b8232b', 'legendary', SIG('dot')),
  it('sig-teddy', "Teddy's heavy chain", 'neck', 'chain', '#f0cf86', 'legendary', SIG('teddy'), '#f0cf86'),
  it('sig-lena', "Lena's violet cat-eyes", 'glasses', 'cateye', '#6a3a9a', 'legendary', SIG('lena')),
  it('sig-frank', "Frank's herringbone cap", 'hat', 'flatcap', '#5a4632', 'legendary', SIG('frank'), '#2b2018'),
  it('sig-ines', "Inés's gold visor", 'hat', 'visor', '#c9a24a', 'legendary', SIG('ines')),
  it('sig-wes', "Wes's brown leather", 'jacket', 'leather', '#5a3420', 'legendary', SIG('wes'), '#3a2010', '#c9a24a'),
  it('sig-priya', "Priya's notebook pin", 'pin', 'notebook', '#2f8463', 'legendary', SIG('priya'), '#f1e8d6'),
  it('sig-gus', "Gus's tartan scarf", 'neck', 'scarf', '#2a5a8a', 'legendary', SIG('gus'), '#e2bd68'),
  it('sig-mei', "Mei's ink turtleneck", 'top', 'turtle', '#1a2440', 'legendary', SIG('mei')),
  it('sig-otis', "Otis's midnight fedora", 'hat', 'fedora', '#121218', 'legendary', SIG('otis'), '#a8232b'),
  it('sig-rosa', "Rosa's red sequins", 'top', 'sequin', '#a8232b', 'legendary', SIG('rosa'), '#ff9a8a'),
  it('sig-nigel', "Nigel's half-moons", 'glasses', 'halfmoon', '#b8bcc4', 'legendary', SIG('nigel')),
  it('sig-ama', "Ama's kente scarf", 'neck', 'kente', '#d4a94f', 'legendary', SIG('ama'), '#2f8463', '#a83434'),
  it('sig-declan', "Declan's red bomber", 'jacket', 'bomber', '#8f2424', 'legendary', SIG('declan'), '#e2bd68'),
  it('sig-hattie', "Hattie's lilac cardigan", 'jacket', 'cardigan', '#9a86b8', 'legendary', SIG('hattie'), '#7a669a'),
  it('sig-kofi', "Kofi's midnight velvet", 'jacket', 'velvet', '#1a1f3a', 'legendary', SIG('kofi'), '#0c0f1e', '#e2bd68'),
  it('sig-bea', "Bea's mustard beret", 'hat', 'beret', '#c9a02a', 'legendary', SIG('bea')),
  it('sig-marcus', "Marcus's spectators", 'shoes', 'oxford', '#f1ede4', 'legendary', SIG('marcus'), '#141414'),
  it('sig-sal', "Sal's bowler", 'hat', 'bowler', '#3a2a1a', 'legendary', SIG('sal')),
  it('sig-tilly', "Tilly's yellow rose", 'pin', 'rose', '#e8c43a', 'legendary', SIG('tilly'), '#2f6a40'),

  // ---------------------------------------------------------------- table
  it('felt-green', 'Club green felt', 'felt', 'felt', '#1e5a43', 'common', S(), '#2f8463', '#113526'),
  it('felt-blue', 'Riviera blue felt', 'felt', 'felt', '#1d4466', 'common', $(600), '#2d6290', '#10263a'),
  it('felt-burgundy', 'Burgundy felt', 'felt', 'felt', '#5a1e28', 'rare', $(600), '#7d2c3a', '#33101a'),
  it('felt-purple', 'Royal purple felt', 'felt', 'felt', '#3a2257', 'rare', $(800), '#55347e', '#1f1230'),
  it('felt-black', 'Black baize', 'felt', 'felt', '#1a1a1c', 'epic', $(1500, 'gold'), '#2c2c30', '#0c0c0d'),
  it('wood-walnut', 'Walnut rail', 'wood', 'wood', '#4a2c1b', 'common', S(), '#6b4429', '#26160d'),
  it('wood-mahogany', 'Mahogany rail', 'wood', 'wood', '#5a1f14', 'common', $(500), '#7a2f1f', '#2a0e08'),
  it('wood-ebony', 'Ebony rail', 'wood', 'wood', '#1a1412', 'rare', $(900), '#3a2e28', '#0a0807'),
  it('wood-gilt', 'Gilded rail', 'wood', 'wood', '#8a6a2a', 'legendary', $(3000, 'black'), '#e2bd68', '#4a3612'),
  it('back-oxblood', 'Oxblood card backs', 'cardback', 'back', '#6a1d25', 'common', S()),
  it('back-navy', 'Navy card backs', 'cardback', 'back', '#1d2b4d', 'common', S()),
  it('back-forest', 'Forest card backs', 'cardback', 'back', '#1c4535', 'common', S()),
  it('back-gold', 'Gold filigree backs', 'cardback', 'back', '#8a6a2a', 'rare', $(800)),
  it('back-deco', 'Art deco backs', 'cardback', 'back', '#14161c', 'epic', $(1200, 'regular')),
  it('back-champion', "Champion's backs", 'cardback', 'back', '#4a1414', 'legendary', ACH('cups3')),

  // --------------------------------------------------------- celebrations
  it('cel-confetti', 'Confetti', 'celebration', 'confetti', '#e2bd68', 'common', S()),
  it('cel-chips', 'Chip shower', 'celebration', 'chips', '#a83434', 'rare', $(600)),
  it('cel-sparkle', 'Spotlight sparkle', 'celebration', 'sparkle', '#f0cf86', 'rare', $(900)),
  it('cel-fireworks', 'Fireworks', 'celebration', 'fireworks', '#ff9a5a', 'epic', $(1500, 'gold')),

  // ----------------------------------------------- table props (sit by your seat)
  it('prop-coffee', 'Cup of coffee', 'prop', 'coffee', '#f4f1ea', 'common', S(), '#5a3420'),
  it('prop-lemonade', 'Lemonade', 'prop', 'lemonade', '#f2e27a', 'common', $(200), '#f4f1ea'),
  it('prop-whisky', 'Glass of whisky', 'prop', 'whisky', '#c98a2a', 'common', $(300), '#e9f1f4'),
  it('prop-martini', 'Martini', 'prop', 'martini', '#dfe9e2', 'rare', $(450), '#5f8a3a'),
  it('prop-dice', 'Lucky dice', 'prop', 'dice', '#f4f1ea', 'common', $(300), '#a83434'),
  it('prop-horseshoe', 'Horseshoe', 'prop', 'horseshoe', '#b8bcc4', 'common', $(400)),
  it('prop-duck', 'Rubber duck', 'prop', 'duck', '#f2c63a', 'common', $(250), '#e8742a'),
  it('prop-plant', 'Little cactus', 'prop', 'cactus', '#4f8a4a', 'common', $(300), '#b8622a'),
  it('prop-chips', 'Stack of chips', 'prop', 'chips', '#a83434', 'rare', $(500), '#1d3561'),
  it('prop-luckycat', 'Lucky cat', 'prop', 'cat', '#f4efe2', 'epic', $(900), '#c9302c'),
  it('prop-trophy', 'Mini trophy', 'prop', 'trophy', '#e2bd68', 'legendary', ACH('titleWinner'), '#7a541b', undefined, 'Earned by winning a title.'),
  it('prop-lantern', 'Spooky lantern', 'prop', 'lantern', '#2a2a2e', 'common', $(350), '#f2b23a', undefined, undefined, 'halloween'),
  it('prop-pumpkin', "Jack-o'-lantern", 'prop', 'pumpkin', '#e8742a', 'rare', $(450), '#3f6a2a', undefined, undefined, 'halloween'),
  it('prop-cauldron', 'Bubbling cauldron', 'prop', 'cauldron', '#24232a', 'rare', $(600), '#6fd06a', undefined, undefined, 'halloween'),
  it('prop-crystal', 'Crystal ball', 'prop', 'crystal', '#9ec4f0', 'epic', $(900), '#6a3a9a', undefined, undefined, 'halloween'),
  it('prop-gnome', 'Garden gnome', 'prop', 'gnome', '#c9302c', 'rare', $(500), '#3a6ab0'),

  // ---------------------------------------------------- seasonal & new hats
  it('hat-witch', 'Witch hat', 'hat', 'witch', '#1d1a24', 'rare', $(700), '#6a3a9a', undefined, undefined, 'halloween'),
  it('hat-wizard', 'Wizard hat', 'hat', 'wizard', '#2a2a6a', 'epic', $(900), '#f0cf86', undefined, undefined, 'halloween'),
  it('hat-gnome', 'Gnome hat', 'hat', 'gnome', '#c9302c', 'common', $(450)),
  // ---- seasonal: Christmas
  it('hat-santa', 'Santa hat', 'hat', 'santa', '#b8282a', 'common', $(300), '#f4f1ea', undefined, undefined, 'christmas'),
  it('jumper-xmas', 'Christmas jumper', 'top', 'jumper', '#8a1f24', 'rare', $(600), '#f4f1ea', '#2f6a40', undefined, 'christmas'),
  it('jumper-fairisle', 'Fair Isle jumper', 'top', 'jumper', '#1d2a4a', 'rare', $(700), '#e9d9a6', '#a8232b', undefined, 'christmas'),
  it('prop-mulled', 'Mulled wine', 'prop', 'mulled', '#7a1f2a', 'common', $(300), '#d9a05a', undefined, undefined, 'christmas'),
  it('prop-tree', 'Little Christmas tree', 'prop', 'tree', '#2f6a40', 'rare', $(600), '#e2bd68', undefined, undefined, 'christmas'),
  it('prop-snowglobe', 'Snow globe', 'prop', 'snowglobe', '#bcd8f0', 'epic', $(900), '#6b4a2a', undefined, undefined, 'christmas'),
  it('felt-winter', 'Winter berry felt', 'felt', 'felt', '#6a1a22', 'rare', $(700), '#8e2a32', '#3a0c12', undefined, 'christmas'),
  it('back-holly', 'Holly card backs', 'cardback', 'back', '#1f4a30', 'rare', $(600), undefined, undefined, undefined, 'christmas'),
  it('cel-snow', 'Snowfall', 'celebration', 'snow', '#f4f8ff', 'rare', $(800), undefined, undefined, undefined, 'christmas'),
  // ---- New Year
  it('hat-glitter', 'Midnight top hat', 'hat', 'tophat', '#1a1a22', 'epic', $(900), '#e2bd68', undefined, 'Black silk with a gold band.', 'newyear'),
  it('prop-champagne', 'Champagne flute', 'prop', 'champagne', '#f2dc8a', 'common', $(350), '#f4f1ea', undefined, undefined, 'newyear'),
  it('felt-midnight', 'Midnight felt', 'felt', 'felt', '#152040', 'rare', $(700), '#22305a', '#0a1022', undefined, 'newyear'),
  it('back-midnight', 'Midnight card backs', 'cardback', 'back', '#152040', 'rare', $(600), undefined, undefined, undefined, 'newyear'),
  // ---- Valentine's
  it('prop-roses', 'Red roses', 'prop', 'roses', '#b8202e', 'common', $(350), '#2f6a40', undefined, undefined, 'valentines'),
  it('prop-chocolates', 'Box of chocolates', 'prop', 'chocolates', '#8a1f2e', 'common', $(300), '#4a2a1a', undefined, undefined, 'valentines'),
  it('felt-rose', 'Rosewood felt', 'felt', 'felt', '#5a1a2e', 'rare', $(700), '#7a2a42', '#2e0a16', undefined, 'valentines'),
  it('back-hearts', 'Queen of Hearts backs', 'cardback', 'back', '#7a1a2e', 'rare', $(600), undefined, undefined, undefined, 'valentines'),
  it('cel-hearts', 'Heartbeat', 'celebration', 'hearts', '#e04a6a', 'rare', $(800), undefined, undefined, undefined, 'valentines'),
  // ---- St Patrick's
  it('hat-paddy', 'Green bowler', 'hat', 'bowler', '#1f6a3a', 'common', $(400), undefined, undefined, undefined, 'stpatricks'),
  it('prop-stout', 'Pint of stout', 'prop', 'stout', '#1a120e', 'common', $(300), '#efe4cc', undefined, undefined, 'stpatricks'),
  it('felt-shamrock', 'Shamrock felt', 'felt', 'felt', '#1d6a3a', 'rare', $(700), '#2a8a4e', '#0c3a1e', undefined, 'stpatricks'),
  it('back-clover', 'Four-leaf card backs', 'cardback', 'back', '#1f5a34', 'rare', $(600), undefined, undefined, undefined, 'stpatricks'),
  // ---- Easter
  it('prop-daffodils', 'Daffodils', 'prop', 'daffodils', '#f2cf3a', 'common', $(300), '#4f8a3a', undefined, undefined, 'easter'),
  it('prop-goldegg', 'Golden egg', 'prop', 'goldegg', '#e2bd68', 'epic', $(1000), '#f0cf86', undefined, undefined, 'easter'),
  it('felt-spring', 'Spring meadow felt', 'felt', 'felt', '#3a5a32', 'rare', $(700), '#557a46', '#1f3418', undefined, 'easter'),
  it('back-spring', 'Blossom card backs', 'cardback', 'back', '#e8d8d0', 'rare', $(600), undefined, undefined, undefined, 'easter'),
  it('cel-petals', 'Blossom shower', 'celebration', 'petals', '#f0b8c8', 'rare', $(800), undefined, undefined, undefined, 'easter'),
  // ---- Summer
  it('hat-panama', 'Panama hat', 'hat', 'fedora', '#e8dcb8', 'rare', $(600), '#1d1a18', undefined, undefined, 'summer'),
  it('shirt-hawaiian', 'Hawaiian shirt', 'top', 'hawaiian', '#1f7a8a', 'rare', $(550), '#f2a35a', '#f4f1ea', undefined, 'summer'),
  it('prop-cocktail', 'Sunset cocktail', 'prop', 'cocktail', '#f08a3a', 'common', $(350), '#f2cf3a', undefined, undefined, 'summer'),
  it('felt-poolside', 'Poolside felt', 'felt', 'felt', '#156a72', 'rare', $(700), '#1f8a92', '#0a3a40', undefined, 'summer'),
  it('back-palms', 'Palm card backs', 'cardback', 'back', '#f08a3a', 'rare', $(600), undefined, undefined, undefined, 'summer'),
  it('felt-pumpkin', 'Pumpkin felt', 'felt', 'felt', '#8a3f12', 'rare', $(700), '#b8581f', '#4a1f08', undefined, 'halloween'),
  it('back-cobweb', 'Cobweb card backs', 'cardback', 'back', '#1a1a20', 'rare', $(600), undefined, undefined, undefined, 'halloween'),
  it('back-starry', 'Starry night backs', 'cardback', 'back', '#1a1f4a', 'epic', $(800)),

  // --------------------------------------------------------------- tattoos
  // ---- tattoos: forearm (show with short sleeves, no jacket)
  it('tat-ace', 'Ace of spades', 'tattoo', 'ace', '#1d2440', 'common', $(400), undefined, undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-rose', 'Rose', 'tattoo', 'rose', '#a8232b', 'common', $(400), '#2f6a40', undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-dice', 'Dice', 'tattoo', 'dice', '#1d2440', 'common', $(350), '#a8232b', undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-anchor', 'Anchor', 'tattoo', 'anchor', '#1d2a4a', 'common', $(350), undefined, undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-skull', 'Skull', 'tattoo', 'skull', '#1d1d24', 'common', $(450), undefined, undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-dagger', 'Dagger', 'tattoo', 'dagger', '#1d2440', 'common', $(400), '#a8232b', undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-snake', 'Snake', 'tattoo', 'snake', '#2f5a3a', 'rare', $(600), '#a8232b', undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-compass', 'Compass', 'tattoo', 'compass', '#1d2440', 'common', $(450), '#a8232b', undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-heart', 'Heart and banner', 'tattoo', 'heart', '#1d2440', 'common', $(400), '#b8202e', undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-clock', 'Pocket watch', 'tattoo', 'clock', '#1d2440', 'rare', $(550), '#8a6a2a', undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-cards', 'Hand of cards', 'tattoo', 'cards', '#1d2440', 'rare', $(650), '#b8202e', undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-chip', 'Poker chip', 'tattoo', 'chip', '#1d2440', 'common', $(400), '#a8232b', undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-koi', 'Koi', 'tattoo', 'koi', '#1d2440', 'rare', $(700), '#e8742a', undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-moon', 'Moon and stars', 'tattoo', 'moon', '#1d2440', 'common', $(450), '#b8862a', undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-butterfly', 'Butterfly', 'tattoo', 'butterfly', '#1d2440', 'common', $(450), '#3a6ab0', undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-feather', 'Feather', 'tattoo', 'feather', '#1d2440', 'common', $(350), undefined, undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-wave', 'Great wave', 'tattoo', 'wave', '#1d2a4a', 'rare', $(600), '#3a6ab0', undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-mountain', 'Mountains', 'tattoo', 'mountain', '#1d2440', 'common', $(400), '#b8862a', undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-tribal', 'Tribal band', 'tattoo', 'tribal', '#151518', 'rare', $(600), undefined, undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-geo', 'Geometric', 'tattoo', 'geometric', '#1d2440', 'common', $(450), '#a8232b', undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-lucky', 'Lucky (script)', 'tattoo', 'script-lucky', '#1d2440', 'common', $(350), undefined, undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-allin', 'All in (script)', 'tattoo', 'script-allin', '#1d2440', 'common', $(350), undefined, undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-family', 'Family (script)', 'tattoo', 'script-family', '#1d2440', 'common', $(350), undefined, undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-eightball', 'Eight ball', 'tattoo', 'eightball', '#151518', 'common', $(400), undefined, undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-lion', 'Lion', 'tattoo', 'lion', '#1d2440', 'epic', $(1100), '#b8862a', undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-sleeve', 'Full sleeve', 'tattoo', 'sleeve', '#1d2440', 'epic', $(1200), '#a8232b', undefined, 'Forearm. Shows with short sleeves.'),
  it('tat-crown', 'Crown', 'tattoo', 'crown', '#b8862a', 'legendary', ACH('champion'), undefined, undefined, 'Forearm.'),
  it('tat-royal', 'Royal flush', 'tattoo', 'royal', '#1d2440', 'legendary', ACH('royalFlush'), '#b8202e', undefined, 'Forearm.'),
  // ---- neck tattoos (always show)
  it('tat-swallow', 'Swallow', 'necktat', 'swallow', '#1d2a4a', 'rare', $(600), '#a8232b', undefined, 'On the neck: always shows.'),
  it('tat-stars', 'Stars', 'necktat', 'stars', '#1d2440', 'rare', $(500), undefined, undefined, 'On the neck: always shows.'),
  it('neck-rose', 'Rose', 'necktat', 'rose', '#a8232b', 'rare', $(550), '#2f6a40', undefined, 'On the neck: always shows.'),
  it('neck-web', 'Spider web', 'necktat', 'web', '#1d1d24', 'rare', $(500), undefined, undefined, 'On the neck: always shows.'),
  it('neck-butterfly', 'Butterfly', 'necktat', 'butterfly', '#1d2440', 'rare', $(550), '#3a6ab0', undefined, 'On the neck: always shows.'),
  it('neck-note', 'Music note', 'necktat', 'note', '#1d2440', 'common', $(400), undefined, undefined, 'On the neck: always shows.'),
  it('neck-777', 'Triple seven', 'necktat', 'sevens', '#1d2440', 'rare', $(600), undefined, undefined, 'On the neck: always shows.'),
  it('neck-barcode', 'Barcode', 'necktat', 'barcode', '#151518', 'common', $(400), undefined, undefined, 'On the neck: always shows.'),
  it('neck-crown', 'Little crown', 'necktat', 'crown', '#b8862a', 'epic', $(1000), undefined, undefined, 'On the neck: always shows.'),
  // ---- hand tattoos (always show)
  it('hand-suits', 'Four suits', 'handtat', 'suits', '#1d2440', 'rare', $(600), '#a8232b', undefined, 'On the back of the hand.'),
  it('hand-star', 'Star', 'handtat', 'stars', '#1d2440', 'common', $(350), undefined, undefined, 'On the back of the hand.'),
  it('hand-swallow', 'Swallow', 'handtat', 'swallow', '#1d2a4a', 'common', $(400), '#a8232b', undefined, 'On the back of the hand.'),
  it('hand-spade', 'Spade', 'handtat', 'ace', '#1d2440', 'common', $(350), undefined, undefined, 'On the back of the hand.'),
  it('hand-heart', 'Heart', 'handtat', 'heart', '#1d2440', 'common', $(350), '#b8202e', undefined, 'On the back of the hand.'),
  it('hand-clover', 'Four-leaf clover', 'handtat', 'clover', '#2f6a40', 'common', $(400), undefined, undefined, 'On the back of the hand.'),
  it('hand-bolt', 'Lightning', 'handtat', 'bolt', '#1d2440', 'common', $(350), undefined, undefined, 'On the back of the hand.'),
  it('hand-8ball', 'Eight ball', 'handtat', 'eightball', '#151518', 'common', $(400), undefined, undefined, 'On the back of the hand.'),

  // --------------------------------------------------------------- emotes
  it('emote-wave', 'Wave', 'emote', 'wave', '#e2bd68', 'common', S()),
  it('emote-thumbs', 'Thumbs up', 'emote', 'thumbs', '#e2bd68', 'common', S()),
  it('emote-clap', 'Applaud', 'emote', 'clap', '#e2bd68', 'common', L(3)),
  it('emote-cheer', 'Cheer', 'emote', 'cheer', '#e2bd68', 'common', L(5)),
  it('emote-shrug', 'Shrug', 'emote', 'shrug', '#e2bd68', 'common', $(200)),
  it('emote-tiphat', 'Tip your hat', 'emote', 'tiphat', '#e2bd68', 'rare', $(300)),
  it('emote-facepalm', 'Facepalm', 'emote', 'facepalm', '#e2bd68', 'rare', $(300)),
  it('emote-fistpump', 'Fist pump', 'emote', 'fistpump', '#e2bd68', 'epic', $(0, 'gold')),
];

// ---------------------------------------------------------- earned by playing
// Most of the wardrobe is earned at the tables, not bought: by playing, winning
// and pulling off feats. The shop keeps the basics, seasonal items and bundles.
const EARN: Record<string, Unlock> = {
  // games played (any game)
  'emote-shrug': PLAY(3), 'tie-stripe': PLAY(5), 'prop-whisky': PLAY(5), 'emote-tiphat': PLAY(10), 'fedora-grey': PLAY(10),
  'pinstripe': PLAY(10), 'leather-black': PLAY(15), 'chain-gold': PLAY(15), 'emote-facepalm': PLAY(20), 'felt-burgundy': PLAY(20),
  'tat-snake': PLAY(25), 'cravat': PLAY(25), 'spectator': PLAY(25), 'wood-ebony': PLAY(40), 'bowler-black': PLAY(40),
  'cel-chips': PLAY(50), 'tat-wave': PLAY(50), 'pearls': PLAY(50), 'tat-koi': PLAY(75), 'scarf-tartan': PLAY(75),
  'back-starry': PLAY(100), 'tat-sleeve': PLAY(100), 'tat-tribal': PLAY(150), 'neck-web': PLAY(200),
  // wins (any game)
  'fedora-black': WIN(5), 'bowtie-gold': WIN(10), 'tat-skull': WIN(15), 'monocle': WIN(25), 'neck-barcode': WIN(40), 'cateye-red': WIN(50),
  // per game
  'turtle-black': PLAY(10, 'take2'), 'vest-dealer': WIN(5, 'take2'), 'tat-heart': WIN(20, 'take2'),
  'tat-chip': PLAY(10, 'poker'), 'chip-pin': WIN(5, 'poker'), 'prop-luckycat': WIN(20, 'poker'),
  'tat-rose': PLAY(10, 'hearts'), 'hand-heart': WIN(5, 'hearts'), 'heel-red': WIN(20, 'hearts'),
  'turtle-cream': PLAY(10, 'gin'), 'tat-butterfly': WIN(5, 'gin'), 'tat-feather': WIN(20, 'gin'),
  'tat-ace': PLAY(10, 'draw'), 'ace-pin': WIN(5, 'draw'), 'hand-star': WIN(20, 'draw'),
  'prop-horseshoe': PLAY(10, 'blackjack'), 'hand-spade': WIN(5, 'blackjack'), 'tat-eightball': WIN(20, 'blackjack'),
  'tat-moon': WIN(10, 'solitaire'), 'hand-clover': WIN(5, 'pyramid'),
  // feats
  'hand-suits': ACH('rainbow'), 'hand-8ball': ACH('passSkip'), 'tat-dice': ACH('stackTwos'), 'neck-crown': ACH('moon'), 'neck-rose': ACH('spotless'),
  'prop-martini': ACH('gin'), 'tat-dagger': ACH('undercut'), 'tat-cards': ACH('fullHouse'), 'neck-777': ACH('quads'), 'tat-royal': ACH('royalFlush'),
  'aviator': ACH('steal'), 'tat-allin': ACH('allInWin'), 'prop-chips': ACH('natural'), 'tat-clock': ACH('charlie'), 'watch-gold': ACH('doubleWin'),
  'back-deco': ACH('patience'), 'hand-bolt': ACH('speedster'), 'cel-sparkle': ACH('dailyDeal'), 'tat-mountain': ACH('summit'), 'tat-geo': ACH('pyramid9'),
  'tat-lucky': ACH('streak3'), 'tat-compass': ACH('allRounder'), 'tat-lion': ACH('cups3'),
};
for (const [id, unlock] of Object.entries(EARN)) {
  const item = CATALOGUE.find((x) => x.id === id);
  if (item) item.unlock = unlock;
}

export const itemById = new Map(CATALOGUE.map((i) => [i.id, i]));
export const getItem = (id: string | undefined | null) => (id ? itemById.get(id) : undefined);

export const STARTER_IDS = CATALOGUE.filter((i) => i.unlock.kind === 'starter').map((i) => i.id);

export const SLOT_LABEL: Record<ItemSlot, string> = {
  hat: 'Hats', glasses: 'Glasses', top: 'Tops', jacket: 'Jackets', legs: 'Trousers & skirts', shoes: 'Shoes',
  neck: 'Ties & neckwear', wrist: 'Watches', pin: 'Pins & pockets', felt: 'Table felt', wood: 'Table rail',
  cardback: 'Card backs', celebration: 'Win celebrations', emote: 'Emotes', prop: 'Table props', tattoo: 'Arm tattoos', necktat: 'Neck tattoos', handtat: 'Hand tattoos',
};

// ------------------------------------------------------------------ bundles
export interface Bundle { id: string; name: string; blurb: string; items: string[]; season?: SeasonId }

export const BUNDLES: Bundle[] = [
  { id: 'bundle-lantern', name: 'Spooky Lantern Bundle', blurb: 'A lantern by your chips and cobwebs on your cards.', items: ['prop-lantern', 'back-cobweb'], season: 'halloween' },
  { id: 'bundle-monster', name: 'Monster Mash', blurb: "A jack-o'-lantern, pumpkin felt and a cauldron on the boil.", items: ['prop-pumpkin', 'felt-pumpkin', 'prop-cauldron'], season: 'halloween' },
  { id: 'bundle-witchy', name: 'Witchy Ways', blurb: 'Witch hat, cauldron and royal purple felt.', items: ['hat-witch', 'prop-cauldron', 'felt-purple'], season: 'halloween' },
  { id: 'bundle-wizard', name: 'Wizardly Bundle', blurb: 'Wizard hat, crystal ball and a plum velvet jacket.', items: ['hat-wizard', 'prop-crystal', 'velvet-plum'], season: 'halloween' },
  { id: 'bundle-xmas-cosy', name: 'Cosy Christmas', blurb: 'A Christmas jumper, mulled wine and winter berry felt.', items: ['jumper-xmas', 'prop-mulled', 'felt-winter'], season: 'christmas' },
  { id: 'bundle-xmas-tree', name: 'Deck the Table', blurb: 'A tree, a snow globe, holly backs and a snowfall when you win.', items: ['prop-tree', 'prop-snowglobe', 'back-holly', 'cel-snow'], season: 'christmas' },
  { id: 'bundle-midnight', name: 'Midnight Bundle', blurb: 'Top hat, champagne, midnight felt and backs.', items: ['hat-glitter', 'prop-champagne', 'felt-midnight', 'back-midnight'], season: 'newyear' },
  { id: 'bundle-sweetheart', name: 'Sweetheart', blurb: 'Roses, chocolates and the Queen of Hearts.', items: ['prop-roses', 'prop-chocolates', 'back-hearts'], season: 'valentines' },
  { id: 'bundle-romance', name: 'Table for Two', blurb: 'Rosewood felt, champagne and a heartbeat when you win.', items: ['felt-rose', 'prop-champagne', 'cel-hearts'], season: 'valentines' },
  { id: 'bundle-paddy', name: 'Luck of the Irish', blurb: 'Green bowler, a pint, shamrock felt and four-leaf backs.', items: ['hat-paddy', 'prop-stout', 'felt-shamrock', 'back-clover'], season: 'stpatricks' },
  { id: 'bundle-spring', name: 'Spring Clean', blurb: 'Daffodils, meadow felt, blossom backs and a blossom shower.', items: ['prop-daffodils', 'felt-spring', 'back-spring', 'cel-petals'], season: 'easter' },
  { id: 'bundle-golden', name: 'Golden Egg Hunt', blurb: 'The golden egg and a bunch of daffodils.', items: ['prop-goldegg', 'prop-daffodils'], season: 'easter' },
  { id: 'bundle-poolside', name: 'Poolside', blurb: 'Hawaiian shirt, panama hat and a sunset cocktail.', items: ['shirt-hawaiian', 'hat-panama', 'prop-cocktail'], season: 'summer' },
  { id: 'bundle-tropic', name: 'Tropic Table', blurb: 'Poolside felt, palm backs and a lemonade on ice.', items: ['felt-poolside', 'back-palms', 'prop-lemonade'], season: 'summer' },
  { id: 'bundle-gnome', name: 'Gnome Bundle', blurb: 'A pointy red hat and a gnome to guard your stack.', items: ['hat-gnome', 'prop-gnome'] },
  { id: 'bundle-lucky', name: 'Lucky Streak', blurb: 'Lucky dice, a rubber duck and a little cactus for the table.', items: ['prop-dice', 'prop-duck', 'prop-plant'] },
  { id: 'bundle-highroller', name: 'High Roller', blurb: 'Gold card backs, a steel watch and a glass of lemonade, no ice.', items: ['back-gold', 'watch-steel', 'prop-lemonade'] },
  { id: 'bundle-ink', name: 'Sailor', blurb: 'An anchor on the arm, a swallow on the neck and another on the hand.', items: ['tat-anchor', 'tat-swallow', 'hand-swallow'] },
  { id: 'bundle-oldschool', name: 'Old School', blurb: "'Family' in script, stars on the neck and a music note.", items: ['tat-family', 'tat-stars', 'neck-note'] },
];

/** Bundles take a quarter off whatever you don't already own. */
export const BUNDLE_DISCOUNT = 0.25;

// ------------------------------------------------------------------- boosts
export type BoostKind = 'xp' | 'coins';
export interface Boost { id: string; kind: BoostKind; name: string; hours: number; price: number; blurb: string }
export const BOOSTS: Boost[] = [
  { id: 'boost-xp-1', kind: 'xp', name: 'Double XP · 1 hour', hours: 1, price: 250, blurb: 'Every table earns twice the XP for an hour.' },
  { id: 'boost-xp-12', kind: 'xp', name: 'Double XP · 12 hours', hours: 12, price: 1500, blurb: 'Twice the XP all day.' },
  { id: 'boost-coins-1', kind: 'coins', name: 'Coin boost · 1 hour', hours: 1, price: 400, blurb: '50% more coins from every win and finish for an hour.' },
  { id: 'boost-coins-12', kind: 'coins', name: 'Coin boost · 12 hours', hours: 12, price: 2400, blurb: '50% more coins all day.' },
];

// ---------------------------------------------------------- mystery cases
export interface MysteryCase { id: string; name: string; price: number; odds: Record<Rarity, number>; blurb: string }
export const CASES: MysteryCase[] = [
  { id: 'case-club', name: 'Club case', price: 400, odds: { common: 70, rare: 25, epic: 5, legendary: 0 }, blurb: 'One random item you don\'t own yet.' },
  { id: 'case-gold', name: 'Gold case', price: 1000, odds: { common: 30, rare: 45, epic: 20, legendary: 5 }, blurb: 'Better odds of the rare stuff.' },
];

/** Is this season on now (by the calendar)? The app's useSeason() also honours settings. */
export function inSeason(season: Item['season'], now = new Date()): boolean {
  return !!season && activeSeason(now)?.id === season;
}

export const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
