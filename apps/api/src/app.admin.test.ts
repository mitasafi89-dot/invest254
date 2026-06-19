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
