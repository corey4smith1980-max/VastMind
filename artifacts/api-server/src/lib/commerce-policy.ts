/** Money and transitions are shared pure policies, independently regression tested. */
export const COMMERCE_MONEY_LIMIT = 2_000_000_000;
export function currencyCode(value: string) {
  const currency = value.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency) || !Intl.supportedValuesOf("currency").includes(currency)) throw new Error("Choose a supported currency");
  return currency;
}
export function discountAmount(kind: string, value: number, eligibleMinor: number) {
  if (!Number.isSafeInteger(value) || value <= 0 || (kind === "percent" && value > 100)) throw new Error("Invalid coupon amount");
  return Math.min(eligibleMinor, kind === "percent" ? Math.floor(eligibleMinor * value / 100) : value);
}
export function dateRange(from?: string, to?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const first = from ?? new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const last = to ?? today;
  for (const value of [first, last]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error("Use a valid date");
  }
  if (first > last || Date.parse(last) - Date.parse(first) > 366 * 86400000) throw new Error("Choose a date range of at most one year");
  return { from: first, to: last };
}
export function canProgress(status: string, action: string) {
  return ({ confirm: ["pending"], prepare: ["confirmed"], complete: ["preparing"] } as Record<string, string[]>)[action]?.includes(status) ?? false;
}
export function pageOffset(cursor?: string) {
  if (!cursor) return 0;
  if (!/^\d{1,7}$/.test(cursor)) throw new Error("Invalid pagination cursor");
  return Number(cursor);
}
