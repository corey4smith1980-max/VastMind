import { isValidChosenUsername, normalizeUsername } from "./usernames";

export type UsernameAvailability = {
  username: string;
  valid: boolean;
  available: boolean;
  suggestions: string[];
};

const generatedUsername = /^member_[a-f0-9]{24}$/;

function letters(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function usable(value: string): string | null {
  const normalized = value.toLowerCase();
  if (!isValidChosenUsername(normalized) || generatedUsername.test(normalized)) return null;
  return normalized;
}

function rankedSeeds(username: string, displayName: string | undefined, year: number | undefined): string[] {
  const yy = String((year ?? new Date().getFullYear()) % 100).padStart(2, "0");
  const typed = normalizeUsername(username).replace(/[^a-z0-9_]+/g, "").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const parts = (displayName ?? "")
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(letters)
    .filter((part) => part.length > 0);
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const base = (typed || first).slice(0, 24);
  if (!base) return [];

  const seeds = [
    last ? `${base}_${last}` : "",
    `${base}_vm`,
    `${base}vm`,
    last ? `${(first || base).slice(0, 20)}${last}${yy}` : "",
    `the${base}`,
    last ? `${base}${last}` : "",
    `${base}${yy}`,
    first && last ? `${first}_${last}` : "",
    first && last && first !== base ? `${first}${last}` : "",
  ];
  for (let n = 1; n <= 30; n += 1) {
    seeds.push(`${base}${n}`);
    seeds.push(`${base}_${n}`);
  }

  const requested = normalizeUsername(username);
  const ranked: string[] = [];
  const seen = new Set<string>();
  for (const seed of seeds) {
    const clean = usable(seed);
    if (!clean || seen.has(clean) || clean === requested) continue;
    seen.add(clean);
    ranked.push(clean);
    if (ranked.length >= 24) break;
  }
  return ranked;
}

/** Build 3–5 format-valid alternatives from the typed handle and display name. */
export function suggestUsernames(input: {
  username: string;
  displayName?: string;
  taken: ReadonlySet<string>;
  limit?: number;
  year?: number;
}): string[] {
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 5);
  const taken = new Set([...input.taken].map((name) => name.toLowerCase()));
  return rankedSeeds(input.username, input.displayName, input.year).filter((name) => !taken.has(name)).slice(0, limit);
}

/** Every name the availability check must verify before it can suggest one. */
export function availabilityCandidates(username: string, displayName?: string, year?: number): string[] {
  const normalized = normalizeUsername(username);
  const pool = rankedSeeds(username, displayName, year);
  return [...new Set([normalized, ...pool])].filter((name) => isValidChosenUsername(name));
}

export function assessUsernameAvailability(input: {
  username: string;
  displayName?: string;
  taken: ReadonlySet<string>;
  year?: number;
}): UsernameAvailability {
  const username = normalizeUsername(input.username);
  const taken = new Set([...input.taken].map((name) => name.toLowerCase()));
  const valid = isValidChosenUsername(username);
  const available = valid && !taken.has(username);
  const suggestions = available
    ? []
    : suggestUsernames({
      username,
      displayName: input.displayName,
      taken: valid ? new Set([...taken, username]) : taken,
      year: input.year,
    });
  return { username, valid, available, suggestions };
}
