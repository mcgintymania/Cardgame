// The games that can be played online, with their rules engine and AI.
import type { GameModule } from '../core/game.ts';
import type { Rng } from '../core/rng.ts';
import { Take2Module, take2ChooseAction } from '../take2/index.ts';
import { PokerModule, DrawModule, pokerChooseAction, drawChooseAction } from '../poker/index.ts';
import { HeartsModule, heartsAI } from '../hearts/index.ts';
import { GinModule, ginAI } from '../gin/index.ts';
import { BlackjackModule, blackjackAI } from '../blackjack/index.ts';

export type OnlineGame = 'take2' | 'poker' | 'draw' | 'hearts' | 'gin' | 'blackjack';
export const ONLINE_GAMES: OnlineGame[] = ['take2', 'poker', 'draw', 'hearts', 'gin', 'blackjack'];

type AnyModule = GameModule<any, any, any, any, any>;
type AnyAI = (view: any, personality: string | undefined, rng: Rng) => any;

export const ONLINE: Record<OnlineGame, { module: AnyModule; ai: AnyAI; seats: [number, number] }> = {
  take2: { module: Take2Module, ai: take2ChooseAction, seats: [2, 6] },
  poker: { module: PokerModule, ai: pokerChooseAction, seats: [2, 9] },
  draw: { module: DrawModule, ai: drawChooseAction, seats: [2, 6] },
  hearts: { module: HeartsModule, ai: heartsAI, seats: [4, 4] },
  gin: { module: GinModule, ai: ginAI, seats: [2, 2] },
  blackjack: { module: BlackjackModule, ai: blackjackAI, seats: [2, 5] },
};

export const isOnlineGame = (g: unknown): g is OnlineGame => typeof g === 'string' && (ONLINE_GAMES as string[]).includes(g);
