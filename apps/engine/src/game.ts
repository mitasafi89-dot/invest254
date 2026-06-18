import {
  CurveGenerator, SettlementEngine, type GameConfig, type Direction, type Outcome, type Tick,
} from "@printpesa/shared";
import type { WalletStore } from "./wallet.js";

export interface Position {
  id: string; userId: string; stakeCents: number; direction: Direction; durationS: number;
  openedAtMs: number; expiresAtMs: number; entryT: number;
  outcome: Outcome;                       // committed at open; kept server-side only (never leaked pre-settle)
  status: "open" | "settled";
  sellable: boolean;
}
export interface SettledEvent { position: Position; lockedMultiplier: number; payoutCents: number; pnlCents: number; balance: number; mode: "auto" | "manual"; }
export interface UpdateEvent { positionId: string; liveMultiplier: number; livePnlCents: number; secondsLeft: number; sellable: boolean; }
type Listener = { onTick?: (t: Tick) => void; onUpdate?: (u: UpdateEvent) => void; onSettled?: (e: SettledEvent) => void; onError?: (err: Error, ctx: string) => void; };

let counter = 0;
const nextId = () => `pos_${Date.now().toString(36)}_${(counter++).toString(36)}`;

/** Authoritative, transport-agnostic game core. Deterministic given seed + injectable clock. */
export class GameServer {
  private positions = new Map<string, Position>();
  private listeners = new Set<Listener>();
  private lastRate?: number;
  private tickTimer?: NodeJS.Timeout;
  private stepping = false;

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
  private emitError(err: Error, ctx: string) { for (const l of this.listeners) l.onError?.(err, ctx); }

  start(): void { if (!this.tickTimer) this.tickTimer = setInterval(() => { void this.step(); }, this.cfg.tickRateMs); }
  stop(): void { if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = undefined; } }

  /** One engine step: emit tick, push live updates, auto-settle expired positions. Re-entrancy-guarded. */
  async step(): Promise<void> {
    if (this.stepping) return;            // skip overlapping ticks if a settle is slow
    this.stepping = true;
    try {
      const nowMs = this.now();
      const tick = this.curve.tick(nowMs, this.dayStartMs, this.lastRate);
      this.lastRate = tick.rate;
      this.emitTick(tick);
      const expired: Position[] = [];
      for (const p of this.positions.values()) {
        if (p.status !== "open") continue;
        if (nowMs >= p.expiresAtMs) { expired.push(p); continue; }
        const g = (nowMs - p.openedAtMs) / (p.durationS * 1000);
        const live = this.liveMultiplier(p, g);
        this.emitUpdate({ positionId: p.id, liveMultiplier: live, livePnlCents: Math.round(p.stakeCents * live) - p.stakeCents, secondsLeft: Math.max(0, (p.expiresAtMs - nowMs) / 1000), sellable: p.sellable });
      }
      for (const p of expired) {
        try { await this.settleAuto(p); } catch (err) { this.emitError(err as Error, `auto-settle ${p.id}`); }
      }
    } finally { this.stepping = false; }
  }

  private liveMultiplier(p: Position, g: number): number {
    if (p.outcome.result === "win") return this.settlement.liveWinMultiplier(p.outcome.multiplier, g);
    const x = Math.min(1, Math.max(0, g));
    return 1 - x * x * x * (x * (x * 6 - 15) + 10);   // cosmetic decay toward 0; losers are not sellable
  }

  async openPosition(input: { userId: string; stakeCents: number; direction: Direction; durationS?: number }): Promise<Position> {
    const durationS = input.durationS ?? this.cfg.defaultDurationS;
    if (!Number.isInteger(input.stakeCents)) throw new RangeError("stake must be integer cents");
    if (input.stakeCents < this.cfg.minStakeCents) throw new Error(`STAKE_BELOW_MIN: min ${this.cfg.minStakeCents}`);
    if (input.stakeCents > this.cfg.maxStakeCents) throw new Error(`STAKE_ABOVE_MAX: max ${this.cfg.maxStakeCents}`);
    if (durationS <= 0) throw new RangeError("duration must be > 0");
    const openedAtMs = this.now();
    const entryT = (openedAtMs - this.dayStartMs) / 1000;
    const id = nextId();
    await this.wallet.debitStake(input.userId, input.stakeCents, id);     // atomic; throws before any position exists
    const outcome = this.settlement.settle(input.stakeCents, input.direction, entryT);
    const p: Position = { id, userId: input.userId, stakeCents: input.stakeCents, direction: input.direction, durationS, openedAtMs, expiresAtMs: openedAtMs + durationS * 1000, entryT, outcome, status: "open", sellable: outcome.result === "win" };
    this.positions.set(id, p);
    return p;
  }

  async sell(positionId: string, userId: string): Promise<SettledEvent> {
    const p = this.positions.get(positionId);
    if (!p || p.userId !== userId) throw new Error("POSITION_NOT_FOUND");
    if (p.status !== "open") throw new Error("ALREADY_SETTLED");
    if (!p.sellable) throw new Error("NOT_SELLABLE: losing positions settle at expiry");
    const g = (this.now() - p.openedAtMs) / (p.durationS * 1000);
    return this.finalize(p, this.settlement.liveWinMultiplier(p.outcome.multiplier, g), "manual");
  }

  private async settleAuto(p: Position): Promise<SettledEvent> {
    return this.finalize(p, p.outcome.result === "win" ? p.outcome.multiplier : 0, "auto");
  }

  /** Idempotent settlement. Status is locked synchronously BEFORE the async credit to prevent double-settle. */
  private async finalize(p: Position, multiplier: number, mode: "auto" | "manual"): Promise<SettledEvent> {
    if (p.status !== "open") throw new Error("ALREADY_SETTLED");
    p.status = "settled";
    const payoutCents = multiplier >= 1 ? Math.round(p.stakeCents * multiplier) : 0;
    try {
      const balance = await this.wallet.creditPayout(p.userId, payoutCents, p.id);
      const e: SettledEvent = { position: p, lockedMultiplier: multiplier, payoutCents, pnlCents: payoutCents - p.stakeCents, balance, mode };
      this.emitSettled(e);
      return e;
    } catch (err) { p.status = "open"; throw err; }     // revert lock so a retry can settle
  }

  getPosition(id: string): Position | undefined { return this.positions.get(id); }
  onlineConfigSnapshot() { return { minStakeCents: this.cfg.minStakeCents, maxMultiplier: this.cfg.maxMultiplier, defaultDurationS: this.cfg.defaultDurationS, tickRateMs: this.cfg.tickRateMs }; }
}
