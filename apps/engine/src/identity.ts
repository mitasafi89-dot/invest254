import { randomUUID } from "node:crypto";
import type { Querier } from "./wallet.js";

/**
 * IdentityRepository: durable boundary for self-managed phone + password identity and the
 * basic-KYC profile. `register` maps to the 0015 `fn_register_user` RPC; `findByPhone` loads
 * the credential for login; `getProfile` reads the profile/KYC state; `setBasicProfile` maps
 * to the 0016 `fn_set_basic_profile` RPC (validates adulthood, DOB immutable once set). The
 * in-memory implementation mirrors the same contracts for tests; both are driven the same way
 * by AuthService. Phones passed in are already normalized MSISDN; dates are ISO `YYYY-MM-DD`.
 */

/** A newly registered identity. */
export interface RegisteredUser { userId: string; role: string; }

/** Stored credential + account state for a login attempt. */
export interface CredentialRecord { userId: string; role: string; status: string; passwordHash: string; }

/** Profile + KYC state (date of birth as ISO `YYYY-MM-DD`, or null until basic KYC). */
export interface ProfileRow {
  userId: string; username: string; role: string; status: string;
  fullName: string | null; dateOfBirth: string | null; kycStatus: string;
}

export interface IdentityRepository {
  /** Atomically create profile + wallet + credentials. Throws PHONE_TAKEN / USERNAME_TAKEN / REGISTRATION_CONFLICT. */
  register(phone: string, username: string, passwordHash: string): Promise<RegisteredUser>;
  /** Load credential + account state by (normalized) phone, or null if no such account. */
  findByPhone(phone: string): Promise<CredentialRecord | null>;
  /** Load the full profile + KYC state by user id, or null if not found. */
  getProfile(userId: string): Promise<ProfileRow | null>;
  /** Set basic KYC (name + DOB). Throws INVALID_NAME / INVALID_DOB / AGE_RESTRICTED / DOB_IMMUTABLE / USER_NOT_FOUND. */
  setBasicProfile(userId: string, fullName: string, dateOfBirth: string): Promise<ProfileRow>;
}

/** Re-raise the bare error code the RPCs raise instead of the wrapped pg message. */
function mapPgError(e: unknown): never {
  const msg = (e as { message?: string })?.message ?? String(e);
  const m = msg.match(/(INVALID_PHONE|INVALID_USERNAME|INVALID_HASH|PHONE_TAKEN|USERNAME_TAKEN|REGISTRATION_CONFLICT|INVALID_NAME|INVALID_DOB|AGE_RESTRICTED|DOB_IMMUTABLE|USER_NOT_FOUND)/);
  throw new Error(m ? m[1] : msg);
}

/** Normalize a pg date/timestamp value to an ISO `YYYY-MM-DD` string, or null. */
function toIsoDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

/** Postgres-backed identity, calling the 0015/0016 RPCs + profile reads. */
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
  async getProfile(userId: string): Promise<ProfileRow | null> {
    const r = await this.q.query(
      "select id, username, role, status, full_name, date_of_birth, kyc_status from profiles where id = $1", [userId]);
    if (!r.rows.length) return null;
    return this.rowToProfile(r.rows[0]);
  }
  async setBasicProfile(userId: string, fullName: string, dateOfBirth: string): Promise<ProfileRow> {
    try {
      await this.q.query("select user_id from fn_set_basic_profile($1,$2,$3)", [userId, fullName, dateOfBirth]);
    } catch (e) { mapPgError(e); }
    const p = await this.getProfile(userId);
    if (!p) throw new Error("USER_NOT_FOUND");
    return p;
  }
  private rowToProfile(x: Record<string, unknown>): ProfileRow {
    return {
      userId: String(x.id), username: String(x.username), role: String(x.role), status: String(x.status),
      fullName: x.full_name == null ? null : String(x.full_name),
      dateOfBirth: toIsoDate(x.date_of_birth), kycStatus: String(x.kyc_status),
    };
  }
}

interface MemUser {
  userId: string; phone: string; username: string; role: string; status: string;
  passwordHash: string; fullName: string | null; dateOfBirth: string | null; kycStatus: string;
}

/** In-memory identity store mirroring the RPC contracts (tests + dev). */
export class InMemoryIdentityRepository implements IdentityRepository {
  private readonly byPhone = new Map<string, MemUser>();
  private readonly byId = new Map<string, MemUser>();
  private readonly usernames = new Set<string>();
  async register(phone: string, username: string, passwordHash: string): Promise<RegisteredUser> {
    if (phone.length < 8) throw new Error("INVALID_PHONE");
    if (username.length < 3) throw new Error("INVALID_USERNAME");
    if (passwordHash.length < 20) throw new Error("INVALID_HASH");
    if (this.byPhone.has(phone)) throw new Error("PHONE_TAKEN");
    if (this.usernames.has(username)) throw new Error("USERNAME_TAKEN");
    const u: MemUser = {
      userId: randomUUID(), phone, username, role: "player", status: "active",
      passwordHash, fullName: null, dateOfBirth: null, kycStatus: "none",
    };
    this.byPhone.set(phone, u); this.byId.set(u.userId, u); this.usernames.add(username);
    return { userId: u.userId, role: u.role };
  }
  async findByPhone(phone: string): Promise<CredentialRecord | null> {
    const u = this.byPhone.get(phone);
    return u ? { userId: u.userId, role: u.role, status: u.status, passwordHash: u.passwordHash } : null;
  }
  async getProfile(userId: string): Promise<ProfileRow | null> {
    const u = this.byId.get(userId);
    return u ? this.toProfile(u) : null;
  }
  async setBasicProfile(userId: string, fullName: string, dateOfBirth: string): Promise<ProfileRow> {
    const u = this.byId.get(userId);
    if (!u) throw new Error("USER_NOT_FOUND");
    if (u.dateOfBirth != null && u.dateOfBirth !== dateOfBirth) throw new Error("DOB_IMMUTABLE");
    u.dateOfBirth = u.dateOfBirth ?? dateOfBirth;
    u.fullName = fullName;
    u.kycStatus = "basic";
    return this.toProfile(u);
  }
  private toProfile(u: MemUser): ProfileRow {
    return {
      userId: u.userId, username: u.username, role: u.role, status: u.status,
      fullName: u.fullName, dateOfBirth: u.dateOfBirth, kycStatus: u.kycStatus,
    };
  }
  /** Test seam: flip an account's status (active | suspended | banned). */
  setStatus(phone: string, status: string): void {
    const u = this.byPhone.get(phone);
    if (u) u.status = status;
  }
}
