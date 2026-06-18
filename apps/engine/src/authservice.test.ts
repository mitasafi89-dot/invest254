import { test } from "node:test";
import assert from "node:assert/strict";
import { AuthService, hashPassword, verifyPassword } from "./authservice.js";
import { InMemoryIdentityRepository, type IdentityRepository } from "./identity.js";
import { verifierFromKey } from "./auth.js";

const SECRET = "test-secret-which-is-long-enough-123456";
const HS = new TextEncoder().encode(SECRET);

function svc(repo: IdentityRepository = new InMemoryIdentityRepository()) {
  return { repo, auth: new AuthService(repo, { jwtSecret: SECRET, jwtTtlSeconds: 3600 }) };
}

// ── password hashing ───────────────────────────────────────────────────────
test("hashPassword/verifyPassword round-trips and rejects the wrong password", async () => {
  const h = await hashPassword("Sup3rSecret!");
  assert.match(h, /^scrypt\$\d+\$\d+\$\d+\$[^$]+\$[^$]+$/);
  assert.equal(await verifyPassword("Sup3rSecret!", h), true);
  assert.equal(await verifyPassword("wrong-password-1", h), false);
});

test("verifyPassword returns false for a malformed stored hash", async () => {
  assert.equal(await verifyPassword("whatever1", "not-a-hash"), false);
  assert.equal(await verifyPassword("whatever1", "scrypt$bad"), false);
});

// ── registration ───────────────────────────────────────────────────
test("register issues an HS256 token verifiable by makeVerifier's verifier", async () => {
  const { auth } = svc();
  const s = await auth.register({ phone: "0712345678", username: "alice", password: "Password1" });
  assert.ok(s.userId);
  assert.equal(s.role, "player");
  const claims = await verifierFromKey(HS, ["HS256"])(s.token);
  assert.equal(claims.userId, s.userId);
  assert.equal(claims.role, "player");
});

test("register rejects weak password and bad username before touching the repo", async () => {
  const { auth } = svc();
  await assert.rejects(() => auth.register({ phone: "0712345678", username: "alice", password: "short" }), /PASSWORD_TOO_SHORT/);
  await assert.rejects(() => auth.register({ phone: "0712345678", username: "al", password: "Password1" }), /USERNAME_TOO_SHORT/);
  await assert.rejects(() => auth.register({ phone: "not-a-phone", username: "alice", password: "Password1" }), /INVALID_PHONE/);
});

test("register surfaces PHONE_TAKEN and USERNAME_TAKEN", async () => {
  const { auth } = svc();
  await auth.register({ phone: "0712345678", username: "alice", password: "Password1" });
  await assert.rejects(() => auth.register({ phone: "0712345678", username: "bob", password: "Password1" }), /PHONE_TAKEN/);
  await assert.rejects(() => auth.register({ phone: "0722222222", username: "alice", password: "Password1" }), /USERNAME_TAKEN/);
});

// ── login ───────────────────────────────────────────────────────────
test("login succeeds with correct credentials and returns a fresh token", async () => {
  const { auth } = svc();
  const reg = await auth.register({ phone: "0712345678", username: "alice", password: "Password1" });
  const s = await auth.login({ phone: "+254712345678", password: "Password1" }); // any accepted phone format
  assert.equal(s.userId, reg.userId);
  assert.equal(s.role, "player");
  assert.equal((await verifierFromKey(HS, ["HS256"])(s.token)).userId, reg.userId);
});

test("login rejects wrong password and unknown phone with a generic error", async () => {
  const { auth } = svc();
  await auth.register({ phone: "0712345678", username: "alice", password: "Password1" });
  await assert.rejects(() => auth.login({ phone: "0712345678", password: "WrongPass9" }), /INVALID_CREDENTIALS/);
  await assert.rejects(() => auth.login({ phone: "0700000000", password: "Password1" }), /INVALID_CREDENTIALS/);
  await assert.rejects(() => auth.login({ phone: "garbage", password: "Password1" }), /INVALID_CREDENTIALS/);
});

test("login is gated on active status (suspended/banned rejected)", async () => {
  const repo = new InMemoryIdentityRepository();
  const { auth } = svc(repo);
  await auth.register({ phone: "0712345678", username: "alice", password: "Password1" });
  repo.setStatus("254712345678", "suspended");
  await assert.rejects(() => auth.login({ phone: "0712345678", password: "Password1" }), /ACCOUNT_SUSPENDED/);
  repo.setStatus("254712345678", "banned");
  await assert.rejects(() => auth.login({ phone: "0712345678", password: "Password1" }), /ACCOUNT_BANNED/);
});

test("AuthService requires a jwt secret", () => {
  assert.throws(() => new AuthService(new InMemoryIdentityRepository(), { jwtSecret: "" }), /JWT_SECRET_REQUIRED/);
});

// ── basic-KYC profile (H1) ─────────────────────────────────────────────────────────────────
test("me reflects profile + computed ageVerified before and after basic KYC", async () => {
  const { auth } = svc();
  const reg = await auth.register({ phone: "0712345678", username: "alice", password: "Password1" });
  let me = await auth.me(reg.userId);
  assert.equal(me.username, "alice");
  assert.equal(me.kycStatus, "none");
  assert.equal(me.ageVerified, false);
  assert.equal(me.dateOfBirth, null);
  await auth.completeBasicProfile(reg.userId, { fullName: "Alice A.", dateOfBirth: "2000-01-01" });
  me = await auth.me(reg.userId);
  assert.equal(me.kycStatus, "basic");
  assert.equal(me.ageVerified, true);
  assert.equal(me.fullName, "Alice A.");
  assert.equal(me.dateOfBirth, "2000-01-01");
});

test("completeBasicProfile rejects underage / bad name / bad date, and DOB is immutable", async () => {
  const { auth } = svc();
  const reg = await auth.register({ phone: "0712345678", username: "alice", password: "Password1" });
  await assert.rejects(() => auth.completeBasicProfile(reg.userId, { fullName: "Alice A.", dateOfBirth: "2020-01-01" }), /AGE_RESTRICTED/);
  await assert.rejects(() => auth.completeBasicProfile(reg.userId, { fullName: "A", dateOfBirth: "2000-01-01" }), /NAME_TOO_SHORT/);
  await assert.rejects(() => auth.completeBasicProfile(reg.userId, { fullName: "Alice A.", dateOfBirth: "nope" }), /DOB_INVALID_FORMAT/);
  await auth.completeBasicProfile(reg.userId, { fullName: "Alice A.", dateOfBirth: "2000-01-01" });
  await assert.rejects(() => auth.completeBasicProfile(reg.userId, { fullName: "Alice A.", dateOfBirth: "1990-01-01" }), /DOB_IMMUTABLE/);
});

test("me throws NOT_FOUND for an unknown user", async () => {
  const { auth } = svc();
  await assert.rejects(() => auth.me("no-such-user"), /NOT_FOUND/);
});
