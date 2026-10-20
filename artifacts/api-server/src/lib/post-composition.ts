import { assert } from "./social";

/** Run after upload ownership, readiness, purpose and allowed MIME validation.
 * A poll may carry a photo, but never becomes a video/audio poll implicitly. */
export function validatePostComposition(content: string, mediaType?: string | null, pollOptions?: string[]) {
  const photo = !!mediaType?.startsWith("image/");
  const poll = !!pollOptions?.length;
  assert(!poll || content.trim().length > 0, 400, "Add a question for your poll");
  assert(content.trim().length > 0 || (photo && !poll), 400, "Write a post or add a photo");
  assert(!poll || !mediaType || photo, 400, "Polls support photo attachments, not video or audio");
}
