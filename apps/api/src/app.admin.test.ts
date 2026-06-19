import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestApi, type TestApi } from "./testutil.js";

const json = (res: Response): Promise<any> => res.json() as Promise<any>;

interface ReqOpts { token?: string; body?: unknown; }
function req(api: TestApi, method: string, path: string, opts: ReqOpts = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;
  const init: RequestInit = { method, headers };
  if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  return fetch(`${api.baseUrl}${path}`, init);
}

async function register(api: TestApi, phone: string, username: string): Promise<string> {
  const res = await req(api, "POST", "/api/v1/auth/register", { body: { phone, username, password: "Password1" } });
  assert.equal(res.status, 201, `register ${username} -> ${res.status}`);
  return (await json(res)).userId as string;
}

test("admin routes are role-gated: a player token is forbidden", async () => {
  const api = await startTestApi();
  try {
    const uid = await register(api, "0712000001", "gateuser");
    const res = await req(api, "GET", "/api/v1/admin/overview", { token: uid }); // role defaults to player
    assert.equal(res.status, 403);
  } finally { await api.close(); }
});

test("admin lists users and reads the overview", async () => {
  const api = await startTestApi();
  try {
    await register(api, "0712000002", "user_a");
    await register(api, "0712000003", "user_b");
    const list = await req(api, "GET", "/api/v1/admin/users", { token: "admin-1:admin" });
    assert.equal(list.status, 200);
    const body = await json(list);
    assert.ok(Array.isArray(body.items) && body.items.length >= 2);
    const ov = await json(await req(api, "GET", "/api/v1/admin/overview", { token: "admin-1:admin" }));
    assert.ok(ov.users.total >= 2);
  } finally { await api.close(); }
});

test("admin suspend blocks login and is audited", async () => {
  const api = await startTestApi();
  try {
    const uid = await register(api, "0712000004", "victim");
    const ok = await req(api, "POST", "/api/v1/auth/login", { body: { phone: "0712000004", password: "Password1" } });
    assert.equal(ok.status, 200);

    const sus = await req(api, "POST", `/api/v1/admin/users/${uid}/suspend`, { token: "admin-9:admin", body: { reason: "abuse" } });
    assert.equal(sus.status, 200);
    assert.equal((await json(sus)).status, "suspended");

    const blocked = await req(api, "POST", "/api/v1/auth/login", { body: { phone: "0712000004", password: "Password1" } });
    assert.equal(blocked.status, 403);

    const audit = await json(await req(api, "GET", "/api/v1/admin/audit", { token: "admin-9:admin" }));
    assert.ok(audit.items.some((a: any) => a.action === "user.status" && a.targetId === uid));
  } finally { await api.close(); }
});

test("admin cannot suspend another admin; a superadmin can", async () => {
  const api = await startTestApi();
  try {
    const uid = await register(api, "0712000005", "staff");
    api.identity.adminSetRole(uid, "admin"); // target is now an admin
    const denied = await req(api, "POST", `/api/v1/admin/users/${uid}/suspend`, { token: "admin-2:admin" });
    assert.equal(denied.status, 403);
    const allowed = await req(api, "POST", `/api/v1/admin/users/${uid}/suspend`, { token: "root-1:superadmin" });
    assert.equal(allowed.status, 200);
  } finally { await api.close(); }
});

test("admin manual balance adjustment credits the wallet, requires a reason, and is audited", async () => {
  const api = await startTestApi();
  try {
    const uid = await register(api, "0712000010", "adj_target");

    const credit = await req(api, "POST", `/api/v1/admin/wallets/${uid}/adjust`, { token: "fin-1:admin", body: { amountCents: 25_000, reason: "manual credit" } });
    assert.equal(credit.status, 200);
    const cb = await json(credit);
    assert.equal(cb.newBalanceCents, 25_000);
    assert.equal(cb.direction, "credit");
    assert.equal(await api.payRepo.getBalance(uid), 25_000);

    // direction:debit applies a negative adjustment regardless of magnitude sign
    const debit = await req(api, "POST", `/api/v1/admin/wallets/${uid}/adjust`, { token: "fin-1:admin", body: { amountCents: 5_000, direction: "debit", reason: "clawback" } });
    assert.equal((await json(debit)).newBalanceCents, 20_000);

    const noReason = await req(api, "POST", `/api/v1/admin/wallets/${uid}/adjust`, { token: "fin-1:admin", body: { amountCents: 1_000 } });
    assert.equal(noReason.status, 400);

    const audit = await json(await req(api, "GET", "/api/v1/admin/audit", { token: "fin-1:admin" }));
    assert.ok(audit.items.some((a: any) => a.action === "balance.adjust" && a.targetId === uid));
  } finally { await api.close(); }
});

test("admin deposits monitor lists deposits and the reconcile read returns a summary + stale list", async () => {
  const api = await startTestApi();
  try {
    const dep = await api.payRepo.createDeposit("u-test", 30_000, "254700000099");
    await api.payRepo.attachStk(dep, "m1", "chk-x"); // -> processing (non-terminal)

    const list = await json(await req(api, "GET", "/api/v1/admin/deposits", { token: "fin-1:admin" }));
    assert.ok(Array.isArray(list.items) && list.items.length >= 1);
    assert.ok(list.items.some((d: any) => d.checkoutRequestId === "chk-x" && d.status === "processing"));

    const rec = await json(await req(api, "GET", "/api/v1/admin/deposits/reconcile?staleMinutes=0", { token: "fin-1:admin" }));
    assert.equal(rec.staleMinutes, 0);
    assert.ok(Array.isArray(rec.summary));
    assert.ok(rec.stale.some((d: any) => d.checkoutRequestId === "chk-x"));
  } finally { await api.close(); }
});

test("admin reports: per-day & per-user JSON, CSV export, and the date-range filter (J4)", async () => {
  const api = await startTestApi();
  try {
    const uid = await register(api, "0712000030", "reporter");
    api.payRepo.seed(uid, 0);

    // A settled play on a fixed trade-date + a success deposit (lands on "today").
    api.identity.recordSettledPlay(uid, "2026-06-10", 10_000, 2_500); // turnover 10000, ggr 7500
    const dep = await api.payRepo.createDeposit(uid, 50_000, "0712000030");
    await api.payRepo.attachStk(dep, "m", "chk-r");
    await api.payRepo.completeDeposit("chk-r", 0, "ok", "RCPT", {});
    const today = new Date().toISOString().slice(0, 10);

    // Per-user JSON.
    const users = (await json(await req(api, "GET", "/api/v1/admin/reports/users", { token: "admin-1:admin" }))).items as any[];
    const urow = users.find((r) => r.userId === uid)!;
    assert.equal(urow.turnoverCents, 10_000);
    assert.equal(urow.ggrCents, 7_500);
    assert.equal(urow.depositsCents, 50_000);

    // Per-day JSON: game day carries turnover/GGR; the deposit day carries the cash.
    const daily = (await json(await req(api, "GET", "/api/v1/admin/reports/daily", { token: "admin-1:admin" }))).items as any[];
    const d10 = daily.find((r) => r.date === "2026-06-10")!;
    assert.equal(d10.turnoverCents, 10_000);
    assert.equal(d10.ggrCents, 7_500);
    assert.equal(daily.find((r) => r.date === today)!.depositsCents, 50_000);

    // CSV export: content-type + header + a data row.
    const csvRes = await req(api, "GET", "/api/v1/admin/reports/daily?format=csv", { token: "admin-1:admin" });
    assert.equal(csvRes.status, 200);
    assert.match(csvRes.headers.get("content-type") ?? "", /text\/csv/);
    const csvLines = (await csvRes.text()).trim().split("\r\n");
    assert.equal(csvLines[0], "date,deposits_cents,withdrawals_cents,turnover_cents,ggr_cents");
    assert.ok(csvLines.some((l) => l.startsWith("2026-06-10,")));

    // Date-range filter excludes the old game day.
    const filtered = (await json(await req(api, "GET", "/api/v1/admin/reports/daily?from=2030-01-01", { token: "admin-1:admin" }))).items as any[];
    assert.ok(!filtered.some((r) => r.date === "2026-06-10"));

    // Malformed date -> 400; player token -> 403.
    assert.equal((await req(api, "GET", "/api/v1/admin/reports/daily?from=2026/06/10", { token: "admin-1:admin" })).status, 400);
    assert.equal((await req(api, "GET", "/api/v1/admin/reports/daily", { token: uid })).status, 403);
  } finally { await api.close(); }
});
