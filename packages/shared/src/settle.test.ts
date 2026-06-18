import { test } from "node:test";
import assert from "node:assert/strict";
import { CurveGenerator } from "./curve.js";
import { SettlementEngine } from "./settle.js";
import { SeededRng } from "./prng.js";
import { DEFAULT_CONFIG, rtp } from "./config.js";

function measureRtp(eng: SettlementEngine, dir: "buy" | "sell" | "both", seed: string, n: number, windowS = 3600) {
  const rng = new SeededRng(seed, "measure");
  let stakeSum = 0, payoutSum = 0, wins = 0;
  const stake = 20000; // KES 200
  for (let i = 0; i < n; i++) {
    const d: "buy" | "sell" = dir === "both" ? (rng.next() < 0.5 ? "buy" : "sell") : dir;
    const o = eng.settle(stake, d, rng.range(0, windowS));
    stakeSum += stake; payoutSum += o.payoutCents; if (o.result === "win") wins++;
  }
  return { rtp: payoutSum / stakeSum, winRate: wins / n };
}

test("PROOF: aggregate RTP ~= 25% on held-out samples", () => {
  const curve = new CurveGenerator("rtp-day-1", DEFAULT_CONFIG);
  const eng = new SettlementEngine(curve, DEFAULT_CONFIG);
  const { rtp: r, winRate } = measureRtp(eng, "both", "holdout-A", 300_000);
  assert.ok(Math.abs(r - rtp(DEFAULT_CONFIG)) < 0.015, `RTP ${r.toFixed(4)} not ~0.25`);
  assert.ok(Math.abs(winRate - DEFAULT_CONFIG.targetWinRate) < 0.02, `winRate ${winRate.toFixed(4)} off`);
});

test("PROOF: per-direction RTP ~= 25% (no directional bias)", () => {
  const curve = new CurveGenerator("rtp-day-1", DEFAULT_CONFIG);
  const eng = new SettlementEngine(curve, DEFAULT_CONFIG);
  const buy = measureRtp(eng, "buy", "holdout-buy", 200_000);
  const sell = measureRtp(eng, "sell", "holdout-sell", 200_000);
  assert.ok(Math.abs(buy.rtp - 0.25) < 0.02, `buy RTP ${buy.rtp.toFixed(4)}`);
  assert.ok(Math.abs(sell.rtp - 0.25) < 0.02, `sell RTP ${sell.rtp.toFixed(4)}`);
});

test("PROOF: calibration generalises across multiple daily seeds", () => {
  for (const seed of ["day-A", "day-B", "day-C"]) {
    const curve = new CurveGenerator(seed, DEFAULT_CONFIG);
    const eng = new SettlementEngine(curve, DEFAULT_CONFIG);
    const { rtp: r } = measureRtp(eng, "both", `holdout-${seed}`, 150_000);
    assert.ok(Math.abs(r - 0.25) < 0.02, `seed ${seed}: RTP ${r.toFixed(4)} not ~0.25`);
  }
});

test("multiplier never exceeds the cap; losses lose exactly the stake", () => {
  const curve = new CurveGenerator("rtp-day-1", DEFAULT_CONFIG);
  const eng = new SettlementEngine(curve, DEFAULT_CONFIG);
  const rng = new SeededRng("edge", "x");
  for (let i = 0; i < 50_000; i++) {
    const o = eng.settle(20000, rng.next() < 0.5 ? "buy" : "sell", rng.range(0, 3600));
    if (o.result === "win") { assert.ok(o.multiplier > 1 && o.multiplier <= DEFAULT_CONFIG.maxMultiplier); assert.ok(o.payoutCents > 20000); }
    else { assert.equal(o.payoutCents, 0); assert.equal(o.pnlCents, -20000); }
  }
});

test("manual SELL is non-gameable: live multiplier is monotone and <= final", () => {
  const curve = new CurveGenerator("rtp-day-1", DEFAULT_CONFIG);
  const eng = new SettlementEngine(curve, DEFAULT_CONFIG);
  const final = 3.2; let prev = -Infinity;
  for (let g = 0; g <= 1.0001; g += 0.05) {
    const m = eng.liveWinMultiplier(final, g);
    assert.ok(m >= prev - 1e-9, `not monotone at g=${g}`);
    assert.ok(m <= final + 1e-9, `exceeds final at g=${g}`);
    prev = m;
  }
  assert.ok(Math.abs(eng.liveWinMultiplier(final, 1) - final) < 1e-9);
  assert.ok(Math.abs(eng.liveWinMultiplier(final, 0) - 1) < 1e-9);
});
