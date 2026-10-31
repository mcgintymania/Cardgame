// A game session runs one match and hands each player their view.
//
// LocalSession runs entirely in the browser (offline practice vs AI).
// Later, OnlineSession will implement the same GameSession interface but send
// actions to the server and receive views back — the table UI won't change.

import { IllegalActionError, type GameModule, type SeatIndex, type SeatInfo } from './game.ts';
import { cryptoRng, type Rng } from './rng.ts';

export interface SessionUpdate<View, Event> {
  view: View;
  events: Event[];
}

export interface GameSession<Action, View, Event> {
  readonly seat: SeatIndex;
  getView(): View;
  /** Send an action for this player. Rejects with a readable message if illegal. */
  act(action: Action): Promise<void>;
  subscribe(fn: (u: SessionUpdate<View, Event>) => void): () => void;
  dispose(): void;
}

export type AIChooser<View, Action> = (view: View, personality: string | undefined, rng: Rng) => Action;

export interface LocalSessionOptions<Config, View, Action> {
  config?: Partial<Config>;
  seats: SeatInfo[];
  humanSeat: SeatIndex;
  ai: AIChooser<View, Action>;
  /** Returns the AI "thinking" delay in ms for a seat. 0 = instant (tests). */
  thinkDelay?: (seat: SeatInfo) => number;
  rng?: Rng;
}

export class LocalSession<Config, State, Action, View, Event> implements GameSession<Action, View, Event> {
  readonly seat: SeatIndex;
  private state: State;
  private listeners = new Set<(u: SessionUpdate<View, Event>) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private rng: Rng;

  constructor(
    private module: GameModule<Config, State, Action, View, Event>,
    private opts: LocalSessionOptions<Config, View, Action>,
  ) {
    this.seat = opts.humanSeat;
    this.rng = opts.rng ?? cryptoRng();
    const config = module.normalizeConfig(opts.config);
    const { state } = module.setup(config, opts.seats, this.rng);
    this.state = state;
    this.scheduleAI();
  }

  getView(): View {
    return this.module.viewFor(this.state, this.seat);
  }

  subscribe(fn: (u: SessionUpdate<View, Event>) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async act(action: Action): Promise<void> {
    this.applyFor(this.seat, action);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.listeners.clear();
  }

  private applyFor(seat: SeatIndex, action: Action): void {
    if (this.disposed) return;
    const { state, events } = this.module.apply(this.state, seat, action, this.rng);
    this.state = state;
    const view = this.module.viewFor(this.state, this.seat);
    for (const l of this.listeners) l({ view, events });
    this.scheduleAI();
  }

  private scheduleAI(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.disposed || this.module.isFinished(this.state)) return;
    const acting = this.module.actingSeats(this.state);
    const aiSeat = acting.find((s) => this.opts.seats[s]?.isAI);
    if (aiSeat === undefined) return;
    const info = this.opts.seats[aiSeat];
    const delay = this.opts.thinkDelay ? this.opts.thinkDelay(info) : 0;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.disposed) return;
      // The AI gets exactly the same view a human in that seat would get.
      const view = this.module.viewFor(this.state, aiSeat);
      let action = this.opts.ai(view, info.personality, this.rng);
      try {
        this.applyFor(aiSeat, action);
      } catch (e) {
        if (!(e instanceof IllegalActionError)) throw e;
        // Should never happen; fall back to the safe timeout action.
        action = this.module.timeoutAction(this.state, aiSeat);
        this.applyFor(aiSeat, action);
      }
    }, delay);
  }
}
