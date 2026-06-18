import type { AddressInfo } from "node:net";
import { DEFAULT_CONFIG } from "@printpesa/shared";
import {
  InMemoryEngagementRepository, type FairnessRecord, type AuthClaims, type Verifier,
} from "@printpesa/engine";
import { createApp, type ApiDeps } from "./app.js";

/**
 * In-memory test harness: builds an app from fake deps, listens on an ephemeral port,
 * and returns the base URL + a close fn + the underlying fakes so tests can pre-seed and
 * assert. No Postgres, no real network calls. The stub verifier accepts a `<userId>` or
 * `<userId>:<role>` bearer token so auth/role gates can be exercised in E2 without JWTs.
 */
export function stubVerifier(): Verifier {
  return async (token: string): Promise<AuthClaims> => {
    if (!token) throw new Error("TOKEN_REQUIRED");
    const [userId, role] = token.split(":");
    if (!userId) throw new Error("TOKEN_INVALID");
    return { userId, role: role || "player", raw: {} };
  };
}

export interface TestApi {
  baseUrl: string;
  deps: ApiDeps;
  engage: InMemoryEngagementRepository;
  fairness: Map<number, FairnessRecord>;
  close(): Promise<void>;
}

export async function startTestApi(overrides: Partial<ApiDeps> = {}): Promise<TestApi> {
  const engage = new InMemoryEngagementRepository();
  // Seed a couple of real activity rows (newest last; repo returns newest-first).
  await engage.insertActivity({ kind: "signup", username: "newbie", amountCents: null, isSimulated: false, message: "@newbie just joined PrintPesa" });
  await engage.insertActivity({ kind: "win", username: "wanj***", amountCents: 500_000, isSimulated: false, message: "@wanj*** just won KES 5,000.00 on a ×3.50 trade" });

  const fairness = new Map<number, FairnessRecord>([
    [1, { gameDayId: 1, tradeDate: "2026-06-17", serverSeedHash: "hash-yesterday", serverSeed: "revealed-seed-yesterday", revealedAt: "2026-06-18T00:00:00.000Z" }],
    [2, { gameDayId: 2, tradeDate: "2026-06-18", serverSeedHash: "hash-today", serverSeed: null, revealedAt: null }],
  ]);

  const deps: ApiDeps = {
    verifier: stubVerifier(),
    config: DEFAULT_CONFIG,
    fairnessById: async (id) => fairness.get(id) ?? null,
    activity: { recent: (limit) => engage.listRecentActivity(limit) },
    ...overrides,
  };

  const server = createApp(deps);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    deps,
    engage,
    fairness,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
