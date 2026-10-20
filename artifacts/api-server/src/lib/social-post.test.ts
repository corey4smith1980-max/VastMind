import assert from "node:assert/strict";
import test from "node:test";
import { post, type Query } from "./social";

test("anonymous post responses hide the stored author's identity", async () => {
  const privateAuthorId = "private-author-identity";
  const row = {
    id: "anonymous-post", author_id: privateAuthorId, content: "A private thought",
    created_at: new Date("2026-01-01T00:00:00.000Z"), community_id: null,
    media_id: null, audio_media_id: null, effect: "none", captions: [],
    is_anonymous: true,
  };
  const q: Query = async (sql) => {
    if (sql.startsWith("SELECT * FROM posts WHERE id=$1")) return [row];
    if (sql.startsWith("SELECT 1 FROM blocks")) return [];
    if (sql.includes("FROM reactions WHERE post_id=$1")) return [{ reactions: 0, comments: 0, reacted: false }];
    if (sql.startsWith("SELECT o.id")) return [];
    if (sql.startsWith("SELECT id,name,content_type,size FROM media_uploads")) return [];
    throw new Error(`Unexpected query in anonymous post test: ${sql}`);
  };

  const result = await post(row.id, "viewer-id", q);
  assert.equal(result.isAnonymous, true);
  assert.equal(result.author.id, "anonymous");
  assert.equal(result.author.name, "Anonymous member");
  assert.equal(JSON.stringify(result).includes(privateAuthorId), false);
});
