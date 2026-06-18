import {
  CurveGenerator, SettlementEngine, type GameConfig, type Direction, type Outcome, type Tick,
} from "@printpesa/shared";
import type { WalletStore } from "./wallet.js";

export interface Position {
  id: string;
  userId: string;
  stakeCents: number;
  direction: Direction;
  durationS: number;
  openedAtMs: number;
  expiresAtMs: number;
  entryT: number;
  outcome: Outcome;          // committed at open (deterministic from the shared curve)
  status: "open" | "settled";
  sellable: boolean;         // only winning positions can be cashed out early
}

export interface SettledEvent { position: Position; lockedMultiplier: number; payoutCents: number; pnlCents: number; balance: number; mode: "auto" | "manual"; }
export interface UpdateEvent { positionId: string; liveMultiplier: number; livePnlCents: number; secondsLeft: number; sellable: boolean; }

type Listener = {
  onTick?: (t: Tick) => void;
  onUpdate?: (u: UpdateEvent) => void;
  onSettled?: (e: SettledEvent) => void;
};

let counter = 0;
const nextId = () => `pos_${Date.now().toString(36)}_${(counter++).toString(36)}`;

/**
 * Authoritative, transport-agnostic game core. Deterministic given the curve seed
 * and an injectable clock, so the full lifecycle is unit-testable without sockets.
 */
export class GameServer {
  private positions = new Map<string, Position>();
  private listeners = new Set<Listener>();
  private lastRate?: number;
  private tickTimer?: NodeJS.Timeout;

  constructor(
    private readonly curve: CurveGenerator,
    private readonly settlement: SettlementEngine,
    private readonly wallet: WalletStore,
    private readonly cfg: GameConfig,
    private readonly dayStartMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  subscribe(l: Listener): () => void { this.listeners.add(l); return () => this.listeners.delete(l); }
  private emitTick(t: Tick) { for (const l of this.listeners) l.onTick?.(t); }
  private emitUpdate(u: UpdateEvent) { for (const l of this.listeners) l.onUpdate?.(u); }
  private emitSettled(e: SettledEvent) { for (const l of this.listeners) l.onSettled?.(e); }

  /** Start the real-time tick + settlement loop. */
  start(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.step(), this.cfg.tickRateMs);
  }
  stop(): void { if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = undefined; } }

  /** One engine step: emit a tick, push live updates, auto-settle expired positions. */
  step(): void {
    const nowMs = this.now();
    const tick = this.curve.tick(nowMs, this.dayStartMs, this.lastRate);
    this.lastRate = tick.rate;
    this.emitTick(tick);
    for (const p of this.positions.values()) {
      if (p.status !== "open") continue;
      if (nowMs >= p.expiresAtMs) { this.settleAuto(p); continue; }
      const g = (nowMs - p.openedAtMs) / (p.durationS * 1000);
      const live = this.liveMultiplier(p, g);
      this.emitUpdate({
        positionId: p.id, liveMultiplier: live,
        livePnlCents: Math.round(p.stakeCents * live) - p.stakeCents,
        secondsLeft: Math.max(0, (p.expiresAtMs - nowMs) / 1000), sellable: p.sellable,
      });
    }
  }

  private liveMultiplier(p: Position, g: number): number {
    if (p.outcome.result === "win") return this.settlement.liveWinMultiplier(p.outcome.multiplier, g);
    // losing positions decay cosmetically toward 0 and are NOT sellable (loss realised at expiry)
    const x = Math.min(1, Math.max(0, g));
    const s = x * x * x * (x * (x * 6 - 15) + 10);
    return 1 - s;
  }

  openPosition(input: { userId: string; stakeCents: number; direction: Direction; durationS?: number }): Position {
    const durationS = input.durationS ?? this.cfg.defaultDurationS;
    if (!Number.isInteger(input.stakeCents)) throw new RangeError("stake must be integer cents");
    if (input.stakeCents < this.cfg.minStakeCents) throw new Error(`STAKE_BELOW_MIN: min ${this.cfg.minStakeCents}`);
    if (input.stakeCents > this.cfg.maxStakeCents) throw new Error(`STAKE_ABOVE_MAX: max ${this.cfg.maxStakeCents}`);
    if (durationS <= 0) throw new RangeError("duration must be > 0");

    const openedAtMs = this.now();
    const entryT = (openedAtMs - this.dayStartMs) / 1000;
    // Atomic stake debit BEFORE creating the position (no position without paid stake).
    const id = nextId();
    this.wallet.debit(input.userId, input.stakeCents, `stake:${id}`);
    const outcome = this.settlement.settle(input.stakeCents, input.direction, entryT);
    const p: Position = {
      id, userId: input.userId, stakeCents: input.stakeCents, direction: input.direction, durationS,
      openedAtMs, expiresAtMs: openedAtMs + durationS * 1000, entryT, outcome,
      status: "open", sellable: outcome.result === "win",
    };
    this.positions.set(id, p);
    return p;
  }

  /** Manual cashout. Only winning positions are sellable; locks current (<= final) multiplier. */
  sell(positionId: string, userId: string): SettledEvent {
    const p = this.positions.get(positionId);
    if (!p || p.userId !== userId) throw new Error("POSITION_NOT_FOUND");
    if (p.status !== "open") throw new Error("ALREADY_SETTLED");
    if (!p.sellable) throw new Error("NOT_SELLABLE: losing positions settle at expiry");
    const g = (this.now() - p.openedAtMs) / (p.durationS * 1000);
    const locked = this.settlement.liveWinMultiplier(p.outcome.multiplier, g);
    return this.finalize(p, locked, "manual");
  }

  private settleAuto(p: Position): SettledEvent {
    const locked = p.outcome.result === "win" ? p.outcome.multiplier : 0;
    return this.finalize(p, locked, "auto");
  }

  /** Idempotent settlement: credits payout once and marks the position settled. */
  private finalize(p: Position, multiplier: number, mode: "auto" | "manual"): SettledEvent {
    if (p.status === "settled") throw new Error("ALREADY_SETTLED");
    const payoutCents = multiplier >= 1 ? Math.round(p.stakeCents * multiplier) : 0;
    p.status = "settled";
    const balance = this.wallet.credit(p.userId, payoutCents, `payout:${p.id}`);
    const e: SettledEvent = { position: p, lockedMultiplier: multiplier, payoutCents, pnlCents: payoutCents - p.stakeCents, balance, mode };
    this.emitSettled(e);
    return e;
  }

  getPosition(id: string): Position | undefined { return this.positions.get(id); }
  onlineConfigSnapshot() { return { minStakeCents: this.cfg.minStakeCents, maxMultiplier: this.cfg.maxMultiplier, defaultDurationS: this.cfg.defaultDurationS, tickRateMs: this.cfg.tickRateMs }; }
}
