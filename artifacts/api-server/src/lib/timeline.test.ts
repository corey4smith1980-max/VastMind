import { after, test } from "node:test";
import strict from "node:assert/strict";
import { pool } from "@workspace/db";
import { GetVideosResponse } from "@workspace/api-zod";
import { HttpError, transaction, uuid } from "./social";
import { videoPage } from "./videos";

after(() => pool.end());

test("community, profile, and clip destinations stay isolated and recheck visibility", async () => {
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
      for (let i = 0; i < 56; i++) {
        const id = uuid(), media = i % 3 === 0 ? "video/mp4" : i % 3 === 1 ? "image/png" : null;
        const group = i === 24 ? privateGroup : i === 23 ? publicGroup : null;
        const ready = i !== 55;
        // Last fixture deliberately has an unready attachment.
        const contentType = i === 55 ? "image/png" : media;
        if (i < 54 && i !== 23 && i !== 24 && i % 3 !== 0) expected.push(id);
        if (contentType) await q(`INSERT INTO media_uploads(id,owner_id,object_path,name,content_type,size,purpose,ready,attached)
          VALUES($1,$2,'/objects/test-only','fixture',$3,'12','post',$4,true)`, [id, author, contentType, ready]);
        await q(`INSERT INTO posts(id,author_id,media_id,content,community_id,surface,is_anonymous)
          VALUES($1,$2,$3,$4,$5,$6,$7)`, [id, author, contentType ? id : null, `${needle} post ${i}`, group, contentType?.startsWith("video/") ? "feed" : "community", i === 2]);
      }
      const profilePost = uuid();
      await q("INSERT INTO posts(id,author_id,content,surface) VALUES($1,$2,'Profile only post','profile')", [profilePost, author]);
      const input = { surface: "community", feed: "latest", q: needle };
      const first = await videoPage(viewer, input, q);
      GetVideosResponse.parse(JSON.parse(JSON.stringify(first)));
      strict.equal(first.items.length, 20);
      strict.ok(first.nextBefore);
      const second = await videoPage(viewer, { ...input, before: first.nextBefore! }, q);
      const community = [...first.items, ...second.items];
      strict.equal(community.length, expected.length);
      strict.deepEqual(new Set(community.map(p => p.id)), new Set(expected));
      strict.ok(community.every(p => p.communityId === null && p.surface === "community"));
      strict.ok(community.every(p => !p.media?.contentType.startsWith("video/")));
      strict.ok(community.some(p => p.media?.contentType === "image/png"));
      strict.ok(community.some(p => !p.media));
      strict.ok(!community.some(p => p.id === profilePost), "profile posts must not appear in Community");
      const anonymous = community.find(p => p.isAnonymous);
      strict.ok(anonymous);
      strict.notEqual(anonymous.author.id, author, "anonymous author identity must remain hidden");
      const clips = await videoPage(viewer, { surface: "feed", feed: "latest", q: needle }, q);
      strict.equal(clips.items.length, 18);
      strict.ok(clips.items.every(p => p.surface === "feed" && p.media?.contentType === "video/mp4"));
      const profile = await videoPage(viewer, { surface: "profile", creatorId: author }, q);
      strict.deepEqual(profile.items.map(p => p.id), [profilePost]);
      await strict.rejects(() => videoPage(viewer, { ...input, surface: "profile", before: first.nextBefore! }, q), HttpError);
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
