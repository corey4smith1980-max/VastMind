import { after, test } from "node:test";
import strict from "node:assert/strict";
import { pool } from "@workspace/db";
import { CreatePostBody } from "@workspace/api-zod";
import { claimMedia } from "./media";
import { HttpError, transaction, uuid } from "./social";
import { validatePostComposition } from "./post-composition";

after(() => pool.end());

test("post composition supports photo posts and photo polls without weakening question validation", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
    strict.doesNotThrow(() => validatePostComposition("", type));
    strict.doesNotThrow(() => validatePostComposition("Choose a photo", type, ["A", "B"]));
  }
  strict.doesNotThrow(() => CreatePostBody.parse({ content: "", mediaId: uuid(), surface: "feed" }));
  strict.doesNotThrow(() => validatePostComposition("A thought"));
  strict.doesNotThrow(() => validatePostComposition("Caption", "video/mp4"));
  strict.doesNotThrow(() => validatePostComposition("Question", undefined, ["A", "B"]));
  for (const type of [undefined, "video/mp4", "audio/webm"]) {
    strict.throws(() => validatePostComposition(" ", type), HttpError);
  }
  for (const type of ["video/mp4", "video/webm", "audio/mpeg"]) {
    strict.throws(() => validatePostComposition("Question", type, ["A", "B"]), HttpError);
  }
  strict.throws(() => validatePostComposition("", "image/png", ["A", "B"]), /question/i);
});

test("photo attachments remain owned, verified, purpose-bound and one-use; rejection rolls back claims", async () => {
  const rollback = new Error("rollback post photo fixtures");
  try {
    await transaction(async q => {
      const owner = uuid(), other = uuid(), image = uuid(), video = uuid();
      for (const id of [owner, other]) await q("INSERT INTO users(id,name,username) VALUES($1,'Photo test',$1)", [id]);
      for (const [id, type] of [[image, "image/png"], [video, "video/mp4"]]) {
        await q(`INSERT INTO media_uploads(id,owner_id,object_path,name,content_type,size,purpose,ready,attached)
          VALUES($1,$2,'/objects/fixture-only','fixture',$3,'12','post',true,false)`, [id, owner, type]);
      }
      await strict.rejects(() => claimMedia(image, other, "post", null, q), HttpError);
      await strict.rejects(() => claimMedia(image, owner, "status", null, q), HttpError);
      const attached = await claimMedia(image, owner, "post", null, q);
      strict.doesNotThrow(() => validatePostComposition("Question", attached?.content_type, ["A", "B"]));
      await strict.rejects(() => claimMedia(image, owner, "post", null, q), HttpError);
      await q("SAVEPOINT rejected_video_poll");
      const invalid = await claimMedia(video, owner, "post", null, q);
      strict.throws(() => validatePostComposition("Question", invalid?.content_type, ["A", "B"]), HttpError);
      await q("ROLLBACK TO SAVEPOINT rejected_video_poll");
      const [row] = await q("SELECT attached FROM media_uploads WHERE id=$1", [video]);
      strict.equal(row.attached, false, "rejected poll must not consume a usable video upload");
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});
