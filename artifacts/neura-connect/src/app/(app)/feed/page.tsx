import { permanentRedirect } from "next/navigation";

/** Retired destination: preserve saved links without retaining a second feed. */
export default async function FeedRedirect({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      next.append(key, item);
    }
  }
  permanentRedirect(`/videos${next.size ? `?${next.toString()}` : ""}`);
}
