import { formatDistanceToNowStrict, format, isToday, isYesterday } from "date-fns";

export function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function relTime(iso?: string | null) {
  if (!iso) return "";
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

export function chatTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM");
}

export function clock(iso: string) {
  return format(new Date(iso), "HH:mm");
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, d MMMM");
}

export function errMessage(e: unknown) {
  if (e && typeof e === "object") {
    const anyE = e as { data?: { error?: string; message?: string }; message?: string };
    return anyE.data?.error ?? anyE.data?.message ?? anyE.message ?? "Something went wrong";
  }
  return "Something went wrong";
}
