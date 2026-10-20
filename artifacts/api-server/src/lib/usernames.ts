const generatedUsername = /^member_[a-f0-9]{24}$/i;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidChosenUsername(value: string): boolean {
  return /^[a-z0-9_]{3,32}$/.test(value) && !generatedUsername.test(value);
}

export function needsUsernameChoice(value: unknown): boolean {
  return typeof value !== "string" || value.length === 0 || generatedUsername.test(value);
}
