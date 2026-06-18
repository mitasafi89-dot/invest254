import { DEFAULT_CONFIG } from "@printpesa/shared";
import {
  PgGameRepository, PgEngagementRepository, makeVerifier,
  type GameRepository, type EngagementRepository, type Querier, type FairnessRecord,
} from "@printpesa/engine";
import { createApp, type ApiDeps } from "./app.js";

/**
 * Production bootstrap for the HTTP API. Wires the Postgres-backed repositories and the
 * Supabase JWT verifier from the environment, then listens. The public E1 surface needs
 * only fairness + activity reads; player/payments/admin deps (E2) are added here later.
 *
 * `fairnessById` reads the leak-safe `v_fairness` view by id directly (the repository's
 * `getFairness` is keyed by trade_date), so the public seed/commitment endpoint stays a
 * single indexed lookup with no seed leakage before reveal.
 */
const PORT = Number(process.env.PORT ?? 8081);

async function buildDeps(): Promise<ApiDeps> {
  const verifier = makeVerifier();
  const usingDb = Boolean(process.env.DATABASE_URL);
  if (usingDb && !verifier) {
    throw new Error("AUTH: a JWT verifier is required when DATABASE_URL is set (set SUPABASE_JWT_SECRET or SUPABASE_JWKS_URL)");
  }
  if (!usingDb) throw new Error("DATABASE_URL is required to run the API server");

  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const q = pool as unknown as Querier;
  const repo: GameRepository = new PgGameRepository(q);
  const engage: EngagementRepository = new PgEngagementRepository(q);

  return {
    verifier,
    config: DEFAULT_CONFIG,
    fairnessById: async (gameDayId: number): Promise<FairnessRecord | null> => {
      const r = await q.query(
        "select id, trade_date, server_seed_hash, server_seed, revealed_at from v_fairness where id = $1",
        [gameDayId],
      );
      if (!r.rows.length) return null;
      const x = r.rows[0];
      return {
        gameDayId: x.id === null || x.id === undefined ? null : Number(x.id),
        tradeDate: x.trade_date instanceof Date ? x.trade_date.toISOString().slice(0, 10) : String(x.trade_date),
        serverSeedHash: String(x.server_seed_hash),
        serverSeed: x.server_seed ?? null,
        revealedAt: x.revealed_at ? (x.revealed_at instanceof Date ? x.revealed_at.toISOString() : String(x.revealed_at)) : null,
      };
    },
    activity: { recent: (limit: number) => engage.listRecentActivity(limit) },
  };
}

const deps = await buildDeps();
const server = createApp(deps);
server.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}  auth=${deps.verifier ? "jwt" : "dev"}`);
});
