import { test, after } from "node:test";
import strict from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pool } from "@workspace/db";
import { GetVideosResponse, GetCreatorResponse, RenderVideoBody } from "@workspace/api-zod";
import { transaction, uuid, HttpError } from "./social";
import { videoPage, creatorProfile, parseVideoCursor, validateCaptions } from "./videos";
import { encodeClip, renderFilters } from "./video-processing";

const exec = promisify(execFile);
after(() => pool.end());

test("video cursors, edit controls and caption timings reject unsafe input", () => {
  const id = uuid();
  strict.deepEqual(parseVideoCursor(`${id}:20`), { id, offset: 20 });
  for (const cursor of ["2026-01-01", `${id}:0`, `${id}:21`, `${id}:300`, "../../file:20"]) {
    strict.throws(() => parseVideoCursor(cursor), HttpError);
  }
  strict.deepEqual(validateCaptions([{ start: 0, end: 2, text: "  Hello  " }]), [{ start: 0, end: 2, text: "Hello" }]);
  for (const cues of [
    [{ start: 1, end: 1, text: "Bad" }], [{ start: 0, end: 91, text: "Bad" }],
    [{ start: 0, end: 2, text: "One" }, { start: 1, end: 3, text: "Overlap" }],
  ]) strict.throws(() => validateCaptions(cues), HttpError);
  strict.throws(() => renderFilters({ start: 0, end: 90, speed: 0.5 }), HttpError);
  strict.throws(() => renderFilters({ start: 0, end: 2, effect: "none;movie=/etc/passwd" }), HttpError);
  strict.equal(RenderVideoBody.safeParse({ mediaId: id, start: 0, end: 2, speed: 3 }).success, false);
});

test("creator privacy and stable personalized pages enforce ownership and current visibility", async () => {
  const rollback = new Error("rollback video fixtures");
  try {
    await transaction(async q => {
      const viewer = uuid(), creator = uuid(), other = uuid(), co = uuid();
      for (const id of [viewer, creator, other]) await q("INSERT INTO users(id,name,username) VALUES($1,'Video test',$1)", [id]);
      await q("INSERT INTO follows(user_id,target_id) VALUES($1,$2)", [viewer, creator]);
      await q("INSERT INTO communities(id,owner_id,name,description,category,is_private) VALUES($1,$2,'Private','Test','hobbies',true)", [co, creator]);
      const expectedPublicPosts: string[] = [];
      for (let i = 0; i < 26; i++) {
        const id = uuid(), author = i === 24 ? other : creator;
        if (i !== 25) expectedPublicPosts.push(id);
        await q(`INSERT INTO media_uploads(id,owner_id,object_path,name,content_type,size,purpose,ready,attached)
          VALUES($1,$2,'/objects/test-only','test.mp4','video/mp4','12','post',true,true)`, [id, author]);
        await q("INSERT INTO posts(id,author_id,media_id,content,community_id,surface) VALUES($1,$2,$1,'Video test',$3,$4)", [id, author, i === 25 ? co : null, i === 25 ? "community" : "feed"]);
      }
      const profile = await creatorProfile(creator, viewer, q);
      GetCreatorResponse.parse(JSON.parse(JSON.stringify(profile)));
      strict.equal(profile.followersCount, 1);
      strict.equal(profile.clipsCount, 24, "private community clip must not affect the public count");
      const page = await videoPage(viewer, { feed: "for-you" }, q);
      GetVideosResponse.parse(JSON.parse(JSON.stringify(page)));
      strict.equal(page.items.length, 20);
      strict.ok(page.items.every(item => item.author.id === creator), "followed creator receives relevance priority");
      strict.ok(page.nextBefore);
      await strict.rejects(() => videoPage(other, { before: page.nextBefore! }, q), HttpError);
      const next = await videoPage(viewer, { before: page.nextBefore! }, q);
      const paginatedItems = [...page.items, ...next.items];
      strict.equal(new Set(paginatedItems.map(item => item.id)).size, paginatedItems.length, "pagination must not repeat items");
      strict.deepEqual(
        new Set(paginatedItems.filter(item => expectedPublicPosts.includes(item.id)).map(item => item.id)),
        new Set(expectedPublicPosts),
        "all public fixture clips must appear once, even when unrelated public clips already exist",
      );
      strict.equal(next.nextBefore, null);
      const following = await videoPage(viewer, { feed: "following" }, q);
      strict.ok(following.nextBefore);
      await q("DELETE FROM follows WHERE user_id=$1", [viewer]);
      const changed = await videoPage(viewer, { feed: "following", before: following.nextBefore! }, q);
      strict.equal(changed.items.length, 0, "unfollow is checked again, not trusted from cached IDs");
      await q("INSERT INTO blocks(user_id,target_id) VALUES($1,$2)", [creator, viewer]);
      await strict.rejects(() => creatorProfile(creator, viewer, q), HttpError);
      const afterBlock = await videoPage(viewer, { before: page.nextBefore! }, q);
      strict.ok(afterBlock.items.every(item => item.author.id !== creator));
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});

test("real encoder trims, crops, speeds up, mixes music and handles durationless recorder WebM", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vastmind-encoder-test-"));
  try {
    const source = join(dir, "source.mp4"), music = join(dir, "music.wav"), out = join(dir, "out.mp4");
    await exec("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=15",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000", "-t", "2", "-c:v", "libx264",
      "-threads", "1", "-c:a", "aac", "-y", source]);
    await exec("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=16000", "-t", "1", "-y", music]);
    const result = await encodeClip(source, out, { start: 0.2, end: 1.7, speed: 1.5, aspect: "portrait",
      effect: "warm", mirror: true, originalVolume: 0.2, musicVolume: 0.4 }, music);
    strict.ok(result.duration >= 0.9 && result.duration < 1.3);
    strict.equal(result.audio, true);
    const check = await exec("ffprobe", ["-v", "error", "-show_entries", "stream=width,height,codec_name", "-of", "json", out]);
    const streams = JSON.parse(check.stdout).streams;
    const video = streams.find((s: { codec_name: string }) => s.codec_name === "h264");
    strict.ok(video.height > video.width);
    strict.ok(streams.some((s: { codec_name: string }) => s.codec_name === "aac"));
    const webm = await exec("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=15",
      "-t", "2", "-c:v", "libvpx", "-threads", "1", "-f", "webm", "pipe:1"], { encoding: "buffer", maxBuffer: 1024 * 1024 });
    const recording = join(dir, "recording.webm");
    await writeFile(recording, webm.stdout);
    const second = await encodeClip(recording, join(dir, "second.mp4"), { start: 0, end: 1.8, aspect: "square", effect: "mono" }, music);
    strict.equal(second.audio, true, "music can be added to a silent camera clip");
    strict.ok(second.duration >= 1.7 && second.duration < 2.1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
