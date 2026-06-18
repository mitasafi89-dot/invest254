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
  let winT = -1, loseT = -1;
  for (let t = 0; t < 3600 && (winT < 0 || loseT < 0); t += 0.05) {
    const o = eng.settle(20000, "buy", t);
    if (o.result === "win" && winT < 0) winT = t;
    if (o.result === "loss" && loseT < 0) loseT = t;
  }
  return { cfg, curve, eng, wallet, clock, gs, winT, loseT };
}

test("winning position: stake debited, auto-settle credits payout once (idempotent)", async () => {
  const { wallet, clock, gs, winT } = makeRig();
  wallet.seed("u1", 100000);
  clock.ms = Math.round(winT * 1000);
  const p = await gs.openPosition({ userId: "u1", stakeCents: 20000, direction: "buy" });
  assert.equal(await wallet.getBalance("u1"), 80000);
  assert.equal(p.outcome.result, "win");
  clock.ms = p.expiresAtMs;
  let settled: any; gs.subscribe({ onSettled: (e) => (settled = e) });
  await gs.step();
  assert.equal(settled.mode, "auto");
  assert.ok(settled.payoutCents > 20000);
  assert.equal(await wallet.getBalance("u1"), 80000 + settled.payoutCents);
  const afterBal = await wallet.getBalance("u1");
  clock.ms += 5000; await gs.step();
  assert.equal(await wallet.getBalance("u1"), afterBal);
  assert.equal(gs.getPosition(p.id)!.status, "settled");
});

test("losing position: payout 0, pnl = -stake, not sellable", async () => {
  const { wallet, clock, gs, loseT } = makeRig();
  wallet.seed("u2", 100000);
  clock.ms = Math.round(loseT * 1000);
  const p = await gs.openPosition({ userId: "u2", stakeCents: 20000, direction: "buy" });
  assert.equal(p.outcome.result, "loss");
  await assert.rejects(() => gs.sell(p.id, "u2"), /NOT_SELLABLE/);
  clock.ms = p.expiresAtMs;
  let settled: any; gs.subscribe({ onSettled: (e) => (settled = e) });
  await gs.step();
  assert.equal(settled.payoutCents, 0);
  assert.equal(settled.pnlCents, -20000);
  assert.equal(await wallet.getBalance("u2"), 80000);
});

test("insufficient funds: open rejected, no balance change", async () => {
  const { wallet, clock, gs, winT } = makeRig();
  wallet.seed("u3", 10000);
  clock.ms = Math.round(winT * 1000);
  await assert.rejects(() => gs.openPosition({ userId: "u3", stakeCents: 20000, direction: "buy" }), /INSUFFICIENT_FUNDS/);
  assert.equal(await wallet.getBalance("u3"), 10000);
});

test("stake validation: below minimum is rejected", async () => {
  const { wallet, clock, gs, winT } = makeRig();
  wallet.seed("u4", 100000);
  clock.ms = Math.round(winT * 1000);
  await assert.rejects(() => gs.openPosition({ userId: "u4", stakeCents: 4999, direction: "buy" }), /STAKE_BELOW_MIN/);
});

test("manual SELL on a winner locks a multiplier in [1, final]; double-sell rejected", async () => {
  const { wallet, clock, gs, winT } = makeRig();
  wallet.seed("u5", 100000);
  clock.ms = Math.round(winT * 1000);
  const p = await gs.openPosition({ userId: "u5", stakeCents: 20000, direction: "buy" });
  clock.ms = p.openedAtMs + 5000;
  const e = await gs.sell(p.id, "u5");
  assert.equal(e.mode, "manual");
  assert.ok(e.lockedMultiplier >= 1 && e.lockedMultiplier <= p.outcome.multiplier + 1e-9);
  assert.equal(e.payoutCents, Math.round(20000 * e.lockedMultiplier));
  assert.equal(gs.getPosition(p.id)!.status, "settled");
  await assert.rejects(() => gs.sell(p.id, "u5"), /ALREADY_SETTLED/);
});

test("payout is credited exactly once under concurrent settle attempts", async () => {
  const { wallet, clock, gs, winT } = makeRig();
  wallet.seed("u6", 100000);
  clock.ms = Math.round(winT * 1000);
  const p = await gs.openPosition({ userId: "u6", stakeCents: 20000, direction: "buy" });
  clock.ms = p.expiresAtMs;
  // fire two concurrent steps; only one credit must apply
  await Promise.all([gs.step(), gs.step()]);
  const bal = await wallet.getBalance("u6");
  const credits = wallet.ledger.filter((l) => l.type === "payout" && l.ref === `payout:${p.id}`);
  assert.equal(credits.length, 1, "exactly one payout ledger entry");
  assert.ok(bal > 80000);
});
