import { test } from "node:test";
import assert from "node:assert/strict";
import { CurveGenerator, SettlementEngine, DEFAULT_CONFIG } from "@printpesa/shared";
import { InMemoryWalletStore } from "./wallet.js";
import { GameServer } from "./game.js";

function makeRig() {
  const cfg = DEFAULT_CONFIG;
  const curve = new CurveGenerator("engine-day", cfg);
  const eng = new SettlementEngine(curve, cfg);
  const wallet = new InMemoryWalletStore();
  const clock = { ms: 0 };
  const gs = new GameServer(curve, eng, wallet, cfg, 0, () => clock.ms);
  // find a deterministic winner and loser entry time for a BUY (dayStart=0 -> entryT = ms/1000)
  let winT = -1, loseT = -1;
  for (let t = 0; t < 3600 && (winT < 0 || loseT < 0); t += 0.05) {
    const o = eng.settle(20000, "buy", t);
    if (o.result === "win" && winT < 0) winT = t;
    if (o.result === "loss" && loseT < 0) loseT = t;
  }
  return { cfg, curve, eng, wallet, clock, gs, winT, loseT };
}

test("winning position: stake debited, auto-settle credits payout once (idempotent)", () => {
  const { wallet, clock, gs, winT } = makeRig();
  wallet.seed("u1", 100000);                 // KES 1000
  clock.ms = Math.round(winT * 1000);
  const p = gs.openPosition({ userId: "u1", stakeCents: 20000, direction: "buy" });
  assert.equal(wallet.getBalance("u1"), 80000);   // stake debited
  assert.equal(p.outcome.result, "win");
  clock.ms = p.expiresAtMs;                        // advance to expiry
  let settled: any; gs.subscribe({ onSettled: (e) => (settled = e) });
  gs.step();                                       // auto-settle
  assert.equal(settled.mode, "auto");
  assert.ok(settled.payoutCents > 20000);
  assert.equal(wallet.getBalance("u1"), 80000 + settled.payoutCents);
  const afterBal = wallet.getBalance("u1");
  clock.ms += 5000; gs.step();                     // idempotency: no double credit
  assert.equal(wallet.getBalance("u1"), afterBal);
  assert.equal(gs.getPosition(p.id)!.status, "settled");
});

test("losing position: payout 0, pnl = -stake, not sellable", () => {
  const { wallet, clock, gs, loseT } = makeRig();
  wallet.seed("u2", 100000);
  clock.ms = Math.round(loseT * 1000);
  const p = gs.openPosition({ userId: "u2", stakeCents: 20000, direction: "buy" });
  assert.equal(p.outcome.result, "loss");
  assert.throws(() => gs.sell(p.id, "u2"), /NOT_SELLABLE/);
  clock.ms = p.expiresAtMs;
  let settled: any; gs.subscribe({ onSettled: (e) => (settled = e) });
  gs.step();
  assert.equal(settled.payoutCents, 0);
  assert.equal(settled.pnlCents, -20000);
  assert.equal(wallet.getBalance("u2"), 80000);    // stake lost, nothing returned
});

test("insufficient funds: open rejected, no balance change, no position", () => {
  const { wallet, clock, gs, winT } = makeRig();
  wallet.seed("u3", 10000);                          // only KES 100
  clock.ms = Math.round(winT * 1000);
  assert.throws(() => gs.openPosition({ userId: "u3", stakeCents: 20000, direction: "buy" }), /INSUFFICIENT_FUNDS/);
  assert.equal(wallet.getBalance("u3"), 10000);
});

test("stake validation: below minimum is rejected", () => {
  const { wallet, clock, gs, winT } = makeRig();
  wallet.seed("u4", 100000);
  clock.ms = Math.round(winT * 1000);
  assert.throws(() => gs.openPosition({ userId: "u4", stakeCents: 4999, direction: "buy" }), /STAKE_BELOW_MIN/);
});

test("manual SELL on a winner locks a multiplier in [1, final]", () => {
  const { wallet, clock, gs, winT } = makeRig();
  wallet.seed("u5", 100000);
  clock.ms = Math.round(winT * 1000);
  const p = gs.openPosition({ userId: "u5", stakeCents: 20000, direction: "buy" });
  clock.ms = p.openedAtMs + 5000;                    // mid-round (g=0.5)
  const e = gs.sell(p.id, "u5");
  assert.equal(e.mode, "manual");
  assert.ok(e.lockedMultiplier >= 1 && e.lockedMultiplier <= p.outcome.multiplier + 1e-9);
  assert.equal(e.payoutCents, Math.round(20000 * e.lockedMultiplier));
  assert.equal(gs.getPosition(p.id)!.status, "settled");
  assert.throws(() => gs.sell(p.id, "u5"), /ALREADY_SETTLED/);
});
