/**
 * Credential input rules for phone + password auth. Pure and deterministic so the engine
 * (AuthService) and the HTTP layer can share one source of truth. Phone normalization is
 * handled by `normalizeMsisdn` (see payments.ts); these helpers cover password strength and
 * the public display username (which is unique and shown in chat/feed).
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128; // cap input to bound hashing cost (DoS guard)
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

/** alphanumeric, with single internal dots/underscores; must start & end alphanumeric. */
const USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9._]*[a-zA-Z0-9])?$/;

export interface CredentialCheck { ok: boolean; reason?: string }

/** Validate a password: length bounds + at least one letter and one digit. */
export function validatePassword(password: unknown): CredentialCheck {
  if (typeof password !== "string") return { ok: false, reason: "INVALID" };
  if (password.length < PASSWORD_MIN_LENGTH) return { ok: false, reason: "TOO_SHORT" };
  if (password.length > PASSWORD_MAX_LENGTH) return { ok: false, reason: "TOO_LONG" };
  if (!/[A-Za-z]/.test(password)) return { ok: false, reason: "NEEDS_LETTER" };
  if (!/[0-9]/.test(password)) return { ok: false, reason: "NEEDS_DIGIT" };
  return { ok: true };
}

/** Validate a public display username: length bounds + allowed charset. */
export function validateUsername(username: unknown): CredentialCheck {
  if (typeof username !== "string") return { ok: false, reason: "INVALID" };
  if (username.length < USERNAME_MIN_LENGTH) return { ok: false, reason: "TOO_SHORT" };
  if (username.length > USERNAME_MAX_LENGTH) return { ok: false, reason: "TOO_LONG" };
  if (!USERNAME_RE.test(username)) return { ok: false, reason: "INVALID_CHARS" };
  return { ok: true };
}
