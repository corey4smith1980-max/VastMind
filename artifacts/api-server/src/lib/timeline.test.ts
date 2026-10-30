import { after, test } from "node:test";
import strict from "node:assert/strict";
import { pool } from "@workspace/db";
import { GetVideosResponse } from "@workspace/api-zod";
import { HttpError, transaction, uuid } from "./social";
import { videoPage } from "./videos";

after(() => pool.end());

test("combined timeline pages mixed content once, binds filters, and rechecks visibility", async () => {
  const rollback = new Error("rollback timeline fixtures");
  try {
    await transaction(async q => {
      const viewer = uuid(), author = uuid(), stranger = uuid(), privateGroup = uuid(), publicGroup = uuid();
      const needle = `timeline${uuid().replaceAll("-", "")}`;
      for (const id of [viewer, author, stranger]) {
        await q("INSERT INTO users(id,name,username) VALUES($1,'Timeline test',$1)", [id]);
      }
      await q("INSERT INTO follows(user_id,target_id) VALUES($1,$2)", [viewer, author]);
      for (const [id, hidden] of [[privateGroup, true], [publicGroup, false]]) {
        await q(`INSERT INTO communities(id,owner_id,name,description,category,is_private)
          VALUES($1,$2,'Timeline test','Test','hobbies',$3)`, [id, author, hidden]);
      }
      const expected: string[] = [];
      for (let i = 0; i < 26; i++) {
        const id = uuid(), media = i % 3 === 0 ? "video/mp4" : i % 3 === 1 ? "image/png" : null;
        const group = i === 24 ? privateGroup : i === 23 ? publicGroup : null;
        const ready = i !== 25;
        if (i < 23) expected.push(id);
        // Last fixture deliberately has an unready attachment.
        const contentType = i === 25 ? "image/png" : media;
        if (contentType) await q(`INSERT INTO media_uploads(id,owner_id,object_path,name,content_type,size,purpose,ready,attached)
          VALUES($1,$2,'/objects/test-only','fixture',$3,'12','post',$4,true)`, [id, author, contentType, ready]);
        await q(`INSERT INTO posts(id,author_id,media_id,content,community_id,is_anonymous)
          VALUES($1,$2,$3,$4,$5,$6)`, [id, author, contentType ? id : null, `${needle} post ${i}`, group, i === 2]);
      }
      const input = { includePosts: true, feed: "latest", q: needle };
      const first = await videoPage(viewer, input, q);
      GetVideosResponse.parse(JSON.parse(JSON.stringify(first)));
      strict.equal(first.items.length, 20);
      strict.ok(first.nextBefore);
      const second = await videoPage(viewer, { ...input, before: first.nextBefore! }, q);
      const combined = [...first.items, ...second.items];
      strict.equal(combined.length, 23);
      strict.deepEqual(new Set(combined.map(p => p.id)), new Set(expected));
      strict.ok(combined.every(p => p.communityId === null), "retired community posts must stay out of the social feed");
      strict.ok(combined.some(p => p.media?.contentType === "video/mp4"));
      strict.ok(combined.some(p => p.media?.contentType === "image/png"));
      strict.ok(combined.some(p => !p.media));
      const anonymous = combined.find(p => p.isAnonymous);
      strict.ok(anonymous);
      strict.notEqual(anonymous.author.id, author, "anonymous author identity must remain hidden");
      const clips = await videoPage(viewer, { feed: "latest", q: needle }, q);
      strict.ok(clips.items.length > 0 && clips.items.length < combined.length);
      strict.ok(clips.items.every(p => p.media?.contentType === "video/mp4"));
      await strict.rejects(() => videoPage(viewer, { ...input, includePosts: false, before: first.nextBefore! }, q), HttpError);
      await strict.rejects(() => videoPage(viewer, { ...input, q: "changed", before: first.nextBefore! }, q), HttpError);
      await strict.rejects(() => videoPage(stranger, { ...input, before: first.nextBefore! }, q), HttpError);
      const following = await videoPage(viewer, { ...input, feed: "following" }, q);
      strict.equal(following.items.length, 20);
      await q("DELETE FROM follows WHERE user_id=$1", [viewer]);
      const unfollowed = await videoPage(viewer, { ...input, feed: "following", before: following.nextBefore! }, q);
      strict.equal(unfollowed.items.length, 0);
      await q("INSERT INTO blocks(user_id,target_id) VALUES($1,$2)", [author, viewer]);
      const blocked = await videoPage(viewer, { ...input, before: first.nextBefore! }, q);
      strict.equal(blocked.items.length, 0);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});
