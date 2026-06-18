import { SeededRng } from "./prng.js";
import { formatKes, type Cents } from "./money.js";

/**
 * Deterministic generators for the "Live Activity" social-proof feed and simulated chat
 * filler. Pure functions of a SeededRng so the same seed reproduces the same stream —
 * used both by the engine's runtime simulator and by the DB seed (conceptually mirrored
 * in SQL). Simulated entries are clearly flagged (`activity_feed.is_simulated = true`;
 * simulated chat carries a NULL user_id) so real vs. simulated is always auditable.
 */
export type ActivityKind = "withdrawal" | "win" | "bonus" | "signup";

/** Kenyan-style handle building blocks (matches the BTC/KES, M-Pesa target market). */
export const FIRST_NAMES: readonly string[] = [
  "brian", "kevin", "john", "peter", "james", "david", "samuel", "dennis", "victor", "collins",
  "wanjiku", "achieng", "amina", "njeri", "faith", "mercy", "grace", "cynthia", "esther", "joy",
  "otieno", "kamau", "mwangi", "kiprop", "wafula", "omondi", "chebet", "barasa", "mutua", "njoroge",
  "shiro", "zawadi", "baraka", "imani", "salim", "halima", "rashid", "abdi", "yusuf", "fatuma",
];
const HANDLE_STYLES = ["{n}_254", "{n}.ke", "{n}{d}", "{n}_{d}", "mr{n}", "ms{n}", "{n}official", "the{n}"];

/** Build a plausible, deterministic public handle (no PII — fully synthetic). */
export function makeUsername(rng: SeededRng): string {
  const name = FIRST_NAMES[Math.floor(rng.next() * FIRST_NAMES.length)]!;
  const style = HANDLE_STYLES[Math.floor(rng.next() * HANDLE_STYLES.length)]!;
  const d = Math.floor(rng.range(1, 1000));
  return style.replace("{n}", name).replace("{d}", String(d));
}

export interface ActivityEvent { kind: ActivityKind; username: string; amountCents: Cents | null; message: string; }

// Weighted kind mix — wins/withdrawals dominate the feel; signups are occasional.
const KIND_WEIGHTS: ReadonlyArray<[ActivityKind, number]> = [["win", 0.5], ["withdrawal", 0.3], ["bonus", 0.15], ["signup", 0.05]];
// Inclusive cent ranges per kind (KES * 100).
const AMOUNT_RANGE: Record<Exclude<ActivityKind, "signup">, [Cents, Cents]> = {
  withdrawal: [50_000, 5_000_000], // KES 500 – 50,000
  win: [10_000, 2_500_000],        // KES 100 – 25,000
  bonus: [1_000, 50_000],          // KES 10 – 500
};

function pickKind(rng: SeededRng): ActivityKind {
  let r = rng.next();
  for (const [kind, w] of KIND_WEIGHTS) { if (r < w) return kind; r -= w; }
  return "win";
}
/** Uniform integer cents in [min, max]. */
function amountCents(rng: SeededRng, kind: Exclude<ActivityKind, "signup">): Cents {
  const [lo, hi] = AMOUNT_RANGE[kind];
  return Math.round(rng.range(lo, hi + 1) - 0.5);
}

/** Build the human-readable feed line for an event. */
export function activityMessage(kind: ActivityKind, username: string, amountCents: Cents | null, multiplier?: number): string {
  switch (kind) {
    case "withdrawal": return `🎉 CONGRATULATIONS @${username} on withdrawal of ${formatKes(amountCents ?? 0)}`;
    case "win": return `@${username} just won ${formatKes(amountCents ?? 0)}${multiplier ? ` on a ×${multiplier.toFixed(2)} trade` : ""}`;
    case "bonus": return `BONUS of ${formatKes(amountCents ?? 0)} issued to @${username}`;
    case "signup": return `@${username} just joined PrintPesa`;
  }
}

/** One deterministic simulated activity event. */
export function simulateActivity(rng: SeededRng): ActivityEvent {
  const kind = pickKind(rng);
  const username = makeUsername(rng);
  if (kind === "signup") return { kind, username, amountCents: null, message: activityMessage(kind, username, null) };
  const amt = amountCents(rng, kind);
  const mult = kind === "win" ? Number(rng.range(1.1, 5).toFixed(2)) : undefined;
  return { kind, username, amountCents: amt, message: activityMessage(kind, username, amt, mult) };
}

/** Short, upbeat chat filler lines (player-style). */
export const CHAT_LINES: readonly string[] = [
  "buy buy buy 🚀", "green day today 💚", "nikona x3 🔥", "cashing out now", "let's gooo",
  "this curve is climbing", "sell before it drops", "easy money", "🚀🚀🚀", "patience pays",
  "who else is up?", "x5 incoming", "hold hold hold", "just hit my target 🎯", "lucky streak fr",
  "down bad lol", "back to back wins", "trust the process", "KES flowing 💸", "one more trade",
  "this is the way", "calling a green run", "sold at the top 😎", "almost got x5", "GG everyone",
  "feeling lucky today", "small stake big win", "the dip is a gift", "loading another", "🤑🤑",
];

/** One deterministic simulated chat line (username has no backing profile -> system/simulated). */
export function simulateChat(rng: SeededRng): { username: string; message: string } {
  return { username: makeUsername(rng), message: CHAT_LINES[Math.floor(rng.next() * CHAT_LINES.length)]! };
}
