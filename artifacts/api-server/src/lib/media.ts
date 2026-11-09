import { createStorage } from "./objectStorage";
import { query, assert, type Query } from "./social";

export const storage = createStorage();
export const MEDIA_LIMIT = 25 * 1024 * 1024;
export const mediaTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "video/quicktime", "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav",
]);

// Check bytes, not only the client-supplied extension or Content-Type.
export function matchesMediaType(bytes: Buffer, type: string) {
  const ascii = (start: number, end: number) => bytes.subarray(start, end).toString("ascii");
  if (type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (type === "image/gif") return ["GIF87a","GIF89a"].includes(ascii(0,6));
  if (type === "image/webp") return ascii(0,4) === "RIFF" && ascii(8,12) === "WEBP";
  if (type === "audio/wav") return ascii(0,4) === "RIFF" && ascii(8,12) === "WAVE";
  if (type === "audio/ogg") return ascii(0,4) === "OggS";
  if (type === "audio/mpeg") return ascii(0,3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224);
  if (type.endsWith("/webm")) return bytes.subarray(0,4).equals(Buffer.from([26,69,223,163]));
  if (type.endsWith("/mp4") || type==="video/quicktime") return ascii(4,8) === "ftyp";
  return false;
}

export async function mediaShape(id: string | null | undefined, q: Query = query) {
  if (!id) return undefined;
  const [m] = await q("SELECT * FROM media_uploads WHERE id=$1 AND ready=true", [id]);
  return m ? { id: m.id, url: `/api/storage/media/${m.id}`, name: m.name, contentType: m.content_type, size: Number(m.size) } : undefined;
}

// Claim exactly one verified upload in the same transaction as the message/story.
export async function claimMedia(id: string | undefined, owner: string, purpose: string, chatId: string | null, q: Query) {
  if (!id) return null;
  const [m] = await q(`UPDATE media_uploads SET attached=true WHERE id=$1 AND owner_id=$2
    AND purpose=$3 AND chat_id IS NOT DISTINCT FROM $4 AND ready=true AND attached=false RETURNING *`,
    [id, owner, purpose, chatId]);
  assert(m, 400, "Choose a verified, unused upload for this conversation");
  return m;
}
