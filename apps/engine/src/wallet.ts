import { type Cents, assertCents } from "@printpesa/shared";

/**
 * Async wallet abstraction so the same engine code works over an in-memory store
 * (tests/dev) or a Postgres store (production) where every operation is an atomic,
 * idempotent transaction writing the immutable ledger (see docs/07).
 */
export interface WalletStore {
  getBalance(userId: string): Promise<Cents>;
  /** Atomically debit a stake for a position; throws INSUFFICIENT_FUNDS. Returns new balance. */
  debitStake(userId: string, amount: Cents, positionId: string): Promise<Cents>;
  /** Atomically credit a payout for a position (idempotent by positionId). Returns new balance. */
  creditPayout(userId: string, amount: Cents, positionId: string): Promise<Cents>;
}

export interface LedgerEntry { userId: string; type: "stake" | "payout" | "seed"; amount: Cents; ref: string; ts: number; }

/** In-memory store. Node is single-threaded, so each method body is atomic. */
export class InMemoryWalletStore implements WalletStore {
  private balances = new Map<string, Cents>();
  private creditedPositions = new Set<string>();
  readonly ledger: LedgerEntry[] = [];

  seed(userId: string, amount: Cents): void {
    this.balances.set(userId, assertCents(amount));
    this.ledger.push({ userId, type: "seed", amount, ref: "seed", ts: Date.now() });
  }
  async getBalance(userId: string): Promise<Cents> { return this.balances.get(userId) ?? 0; }

  async debitStake(userId: string, amount: Cents, positionId: string): Promise<Cents> {
    assertCents(amount, "debit");
    if (amount <= 0) throw new RangeError("debit must be positive");
    const bal = this.balances.get(userId) ?? 0;
    if (bal < amount) throw new Error(`INSUFFICIENT_FUNDS: balance ${bal} < ${amount}`);
    const next = bal - amount;
    this.balances.set(userId, next);
    this.ledger.push({ userId, type: "stake", amount: -amount, ref: `stake:${positionId}`, ts: Date.now() });
    return next;
  }
  async creditPayout(userId: string, amount: Cents, positionId: string): Promise<Cents> {
    assertCents(amount, "credit");
    if (amount < 0) throw new RangeError("credit must be >= 0");
    if (this.creditedPositions.has(positionId)) return this.balances.get(userId) ?? 0; // idempotent
    this.creditedPositions.add(positionId);
    const next = (this.balances.get(userId) ?? 0) + amount;
    this.balances.set(userId, next);
    if (amount > 0) this.ledger.push({ userId, type: "payout", amount, ref: `payout:${positionId}`, ts: Date.now() });
    return next;
  }
}
