import { type Cents, assertCents } from "@printpesa/shared";

/**
 * Wallet abstraction. The in-memory implementation is authoritative for the
 * prototype; a Postgres implementation will perform the same operations inside a
 * `SELECT ... FOR UPDATE` transaction writing the immutable ledger (see docs/07).
 * Node is single-threaded so in-memory ops are inherently atomic.
 */
export interface WalletStore {
  getBalance(userId: string): Cents;
  /** Debit stake; throws if insufficient. Returns new balance. */
  debit(userId: string, amount: Cents, ref: string): Cents;
  /** Credit payout/refund. Returns new balance. */
  credit(userId: string, amount: Cents, ref: string): Cents;
}

export interface LedgerEntry { userId: string; type: "stake" | "payout" | "refund" | "seed"; amount: Cents; ref: string; ts: number; }

export class InMemoryWalletStore implements WalletStore {
  private balances = new Map<string, Cents>();
  readonly ledger: LedgerEntry[] = [];

  seed(userId: string, amount: Cents): void {
    this.balances.set(userId, assertCents(amount));
    this.ledger.push({ userId, type: "seed", amount, ref: "seed", ts: Date.now() });
  }
  getBalance(userId: string): Cents { return this.balances.get(userId) ?? 0; }

  debit(userId: string, amount: Cents, ref: string): Cents {
    assertCents(amount, "debit");
    if (amount <= 0) throw new RangeError("debit must be positive");
    const bal = this.getBalance(userId);
    if (bal < amount) throw new Error(`INSUFFICIENT_FUNDS: balance ${bal} < ${amount}`);
    const next = bal - amount;
    this.balances.set(userId, next);
    this.ledger.push({ userId, type: "stake", amount: -amount, ref, ts: Date.now() });
    return next;
  }
  credit(userId: string, amount: Cents, ref: string): Cents {
    assertCents(amount, "credit");
    if (amount < 0) throw new RangeError("credit must be >= 0");
    const next = this.getBalance(userId) + amount;
    this.balances.set(userId, next);
    if (amount > 0) this.ledger.push({ userId, type: "payout", amount, ref, ts: Date.now() });
    return next;
  }
}
