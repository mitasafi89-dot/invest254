import { randomUUID } from "node:crypto";
import type { Querier } from "./wallet.js";

/**
 * IdentityRepository: durable boundary for self-managed phone + password identity.
 * `register` maps 1:1 to the migration-0015 SECURITY DEFINER RPC `fn_register_user`
 * (atomic profile + wallet + credentials insert, service-role only); `findByPhone`
 * loads the stored hash + account state for a login attempt. The in-memory
 * implementation mirrors the same contract for tests; both are exercised the same way
 * by AuthService. Phones passed in are already normalized MSISDN (see normalizeMsisdn).
 */

/** A newly registered identity. */
export interface RegisteredUser { userId: string; role: string; }

/** Stored credential + account state for a login attempt. */
export interface CredentialRecord { userId: string; role: string; status: string; passwordHash: string; }

export interface IdentityRepository {
  /** Atomically create profile + wallet + credentials. Throws PHONE_TAKEN / USERNAME_TAKEN / REGISTRATION_CONFLICT. */
  register(phone: string, username: string, passwordHash: string): Promise<RegisteredUser>;
  /** Load credential + account state by (normalized) phone, or null if no such account. */
  findByPhone(phone: string): Promise<CredentialRecord | null>;
}

/** Re-raise the bare error code the RPC raises (PHONE_TAKEN, …) instead of the wrapped pg message. */
function mapPgError(e: unknown): never {
  const msg = (e as { message?: string })?.message ?? String(e);
  const m = msg.match(/(INVALID_PHONE|INVALID_USERNAME|INVALID_HASH|PHONE_TAKEN|USERNAME_TAKEN|REGISTRATION_CONFLICT)/);
  throw new Error(m ? m[1] : msg);
}

/** Postgres-backed identity, calling the 0015 RPC + a credential lookup join. */
export class PgIdentityRepository implements IdentityRepository {
  constructor(private readonly q: Querier) {}
  async register(phone: string, username: string, passwordHash: string): Promise<RegisteredUser> {
    try {
      const r = await this.q.query("select user_id, role from fn_register_user($1,$2,$3)", [phone, username, passwordHash]);
      const x = r.rows[0];
      return { userId: String(x.user_id), role: String(x.role) };
    } catch (e) { mapPgError(e); }
  }
  async findByPhone(phone: string): Promise<CredentialRecord | null> {
    const r = await this.q.query(
      `select p.id, p.role, p.status, c.password_hash
         from profiles p join user_credentials c on c.user_id = p.id
        where p.phone = $1`, [phone]);
    if (!r.rows.length) return null;
    const x = r.rows[0];
    return { userId: String(x.id), role: String(x.role), status: String(x.status), passwordHash: String(x.password_hash) };
  }
}

/** In-memory identity store mirroring the RPC contract (tests + dev). */
export class InMemoryIdentityRepository implements IdentityRepository {
  private readonly byPhone = new Map<string, CredentialRecord>();
  private readonly usernames = new Set<string>();
  async register(phone: string, username: string, passwordHash: string): Promise<RegisteredUser> {
    if (phone.length < 8) throw new Error("INVALID_PHONE");
    if (username.length < 3) throw new Error("INVALID_USERNAME");
    if (passwordHash.length < 20) throw new Error("INVALID_HASH");
    if (this.byPhone.has(phone)) throw new Error("PHONE_TAKEN");
    if (this.usernames.has(username)) throw new Error("USERNAME_TAKEN");
    const userId = randomUUID();
    this.byPhone.set(phone, { userId, role: "player", status: "active", passwordHash });
    this.usernames.add(username);
    return { userId, role: "player" };
  }
  async findByPhone(phone: string): Promise<CredentialRecord | null> {
    const r = this.byPhone.get(phone);
    return r ? { ...r } : null;
  }
  /** Test seam: flip an account's status (active | suspended | banned). */
  setStatus(phone: string, status: string): void {
    const r = this.byPhone.get(phone);
    if (r) r.status = status;
  }
}
