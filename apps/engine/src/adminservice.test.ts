import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryIdentityRepository } from "./identity.js";
import { InMemoryPaymentRepository } from "./payments.js";
import { InMemoryAdminRepository } from "./admin.js";
import { AdminService } from "./adminservice.js";
import { AffiliateService } from "./affiliateservice.js";

const HASH = "scrypt$32768$8$1$abcdefghijklmnop$abcdefghijklmnop"; // length >= 20 (repo gate)

/** Build an in-memory admin stack with identity + payments + admin service. */
function stack() {
  const identity = new InMemoryIdentityRepository();
  const payRepo = new InMemoryPaymentRepository();
  const admin = new AdminService(new InMemoryAdminRepository(identity, payRepo));
  return { identity, payRepo, admin, affiliate: new AffiliateService(identity) };
}

test("overview: deterministic aggregates over users, finance, affiliate and game", async () => {
  const { identity, payRepo, admin, affiliate } = stack();
  const adminId = (await identity.register("254700000001", "ops", HASH)).userId; identity.adminSetRole(adminId, "admin");
  const superId = (await identity.register("254700000002", "root", HASH)).userId; identity.adminSetRole(superId, "superadmin");
  const p1 = (await identity.register("254700000003", "p_one", HASH)).userId;
  await identity.register("254700000004", "p_two", HASH);
  const mk = (await identity.register("254700000005", "mk_one", HASH)).userId;
  const code = (await affiliate.enroll(mk)).referralCode;
  const ref = (await identity.register("254700000006", "ref_one", HASH, code)).userId;

  // finance: one settled deposit (+100000) and one pending withdrawal (holds 30000) for p1.
  payRepo.seed(p1, 50_000);
  const dep = await payRepo.createDeposit(p1, 100_000, "254700000003");
  await payRepo.attachStk(dep, "m1", "chk1");
  await payRepo.completeDeposit("chk1", 0, "ok", "RCPT1", {});
  await payRepo.createWithdrawal(p1, 30_000, "254700000003", 1_000); // balance -> 120000, pending wd

  // game: two settled plays for the referred player; accrue affiliate commission.
  identity.recordSettledPlay(ref, "2026-06-10", 10_000, 2_500);
  identity.recordSettledPlay(ref, "2026-06-10", 5_000, 0);
  await affiliate.accrueDaily("2026-06-10"); // floor(0.2 * 12500) = 2500 accrued

  const ov = await admin.overview();
  assert.deepEqual(ov.users, { total: 6, active: 6, suspended: 0, banned: 0, players: 3, marketers: 1, admins: 2 });
  assert.equal(ov.finance.depositsCents, 100_000);
  assert.equal(ov.finance.withdrawalsCents, 0);
  assert.equal(ov.finance.pendingWithdrawals, 1);
  assert.equal(ov.finance.walletLiabilityCents, 120_000);
  assert.equal(ov.affiliate.marketers, 1);
  assert.equal(ov.affiliate.commissionAccruedCents, 2_500);
  assert.equal(ov.affiliate.commissionPaidCents, 0);
  assert.equal(ov.affiliate.pendingPayouts, 0);
  assert.deepEqual(ov.game, { settledPositions: 2, turnoverCents: 15_000, ggrCents: 12_500 });
});

test("listUsers: filters by role, status and search; getUserDetail returns balance + turnover", async () => {
  const { identity, payRepo, admin } = stack();
  const p1 = (await identity.register("254700000010", "alpha", HASH)).userId;
  await identity.register("254700000011", "beta", HASH);
  const adminId = (await identity.register("254700000012", "gamma", HASH)).userId; identity.adminSetRole(adminId, "admin");
  payRepo.seed(p1, 77_000);
  identity.recordSettledPlay(p1, "2026-06-10", 9_000, 1_000);

  assert.equal((await admin.listUsers({ role: "admin" })).items.length, 1);
  assert.equal((await admin.listUsers({ role: "player" })).items.length, 2);
  const search = await admin.listUsers({ q: "alph" });
  assert.equal(search.items.length, 1);
  assert.equal(search.items[0]!.username, "alpha");

  const detail = await admin.getUserDetail(p1);
  assert.equal(detail.username, "alpha");
  assert.equal(detail.realBalanceCents, 77_000);
  assert.equal(detail.turnoverCents, 9_000);
  assert.equal(detail.ggrCents, 8_000);
  await assert.rejects(admin.getUserDetail("00000000-0000-0000-0000-000000000000"), /USER_NOT_FOUND/);
});

test("setUserStatus: hierarchy guards, self-action, validation, and audit", async () => {
  const { identity, admin } = stack();
  const player = (await identity.register("254700000020", "victim", HASH)).userId;
  const staff = (await identity.register("254700000021", "staff", HASH)).userId; identity.adminSetRole(staff, "admin");
  const actor = "11111111-1111-1111-1111-111111111111";

  // admin suspends a player -> ok + audited + status flips
  const r = await admin.setUserStatus(actor, "admin", player, "suspended", "abuse");
  assert.deepEqual(r, { userId: player, status: "suspended" });
  assert.equal(identity.adminUser(player)!.status, "suspended");

  await assert.rejects(admin.setUserStatus("99", "player", player, "active", null), /NOT_AUTHORIZED/);
  await assert.rejects(admin.setUserStatus(actor, "admin", player, "nope", null), /INVALID_STATUS/);
  await assert.rejects(admin.setUserStatus(actor, "admin", actor, "banned", null), /NO_SELF_ACTION/);
  await assert.rejects(admin.setUserStatus(actor, "admin", staff, "suspended", null), /INSUFFICIENT_PRIVILEGE/);
  // a superadmin may act on an admin
  assert.equal((await admin.setUserStatus("super", "superadmin", staff, "suspended", null)).status, "suspended");

  const audit = await admin.listAudit({});
  assert.equal(audit.items.length, 2); // the two successful mutations, newest first
  assert.equal(audit.items[0]!.action, "user.status");
  assert.equal(audit.items[0]!.targetId, staff);
  assert.equal(audit.items[1]!.targetId, player);
});

test("setCommissionRate: sets rate, rejects non-affiliate and out-of-range", async () => {
  const { identity, admin, affiliate } = stack();
  const mk = (await identity.register("254700000030", "mk_rate", HASH)).userId;
  await affiliate.enroll(mk);
  const plain = (await identity.register("254700000031", "plain", HASH)).userId;

  const r = await admin.setCommissionRate("actor", "admin", mk, 0.35);
  assert.deepEqual(r, { userId: mk, commissionRate: 0.35 });
  assert.equal(identity.adminAffiliate(mk)!.commissionRate, 0.35);
  await assert.rejects(admin.setCommissionRate("actor", "admin", plain, 0.4), /NOT_AFFILIATE/);
  await assert.rejects(admin.setCommissionRate("actor", "admin", mk, 1.5), /INVALID_RATE/);
  await assert.rejects(admin.setCommissionRate("actor", "player", mk, 0.4), /NOT_AUTHORIZED/);
});

test("listWithdrawals: lists withdrawal transactions, filterable by status", async () => {
  const { identity, payRepo, admin } = stack();
  const p1 = (await identity.register("254700000040", "wd_user", HASH)).userId;
  payRepo.seed(p1, 200_000);
  await payRepo.createWithdrawal(p1, 30_000, "254700000040", 1_000);
  await payRepo.createWithdrawal(p1, 20_000, "254700000040", 1_000);

  const all = await admin.listWithdrawals({});
  assert.equal(all.items.length, 2);
  assert.ok(all.items.every((w) => w.status === "pending"));
  assert.equal((await admin.listWithdrawals({ status: "success" })).items.length, 0);
});
