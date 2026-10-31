// The contract every game mode implements. Rooms, lobby, timers, rewards and
// (later) the online server are written once against this interface.

import type { Rng } from './rng.ts';

export type SeatIndex = number;

export interface SeatInfo {
  /** Stable player id: a user UUID online, or a local id such as "ai-2". */
  playerId: string;
  name: string;
  isAI: boolean;
  /** AI personality id when isAI. */
  personality?: string;
}

export interface ApplyResult<State, Event> {
  state: State;
  events: Event[];
}

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

export interface GameModule<Config, State, Action, View, Event> {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  defaultConfig(): Config;
  /** Fills missing fields and clamps values. Never trust config from a client. */
  normalizeConfig(input: Partial<Config> | undefined): Config;
  setup(config: Config, seats: SeatInfo[], rng: Rng): ApplyResult<State, Event>;
  /** Seats that may act right now (usually one). */
  actingSeats(state: State): SeatIndex[];
  legalActions(state: State, seat: SeatIndex): Action[];
  /** Pure: throws IllegalActionError, never mutates the input state. */
  apply(state: State, seat: SeatIndex, action: Action, rng: Rng): ApplyResult<State, Event>;
  /** The ONLY data a player (human or AI) may see. Hidden cards are stripped here. */
  viewFor(state: State, seat: SeatIndex | 'spectator'): View;
  /** What happens when a player's turn timer runs out. */
  timeoutAction(state: State, seat: SeatIndex): Action;
  isFinished(state: State): boolean;
}
