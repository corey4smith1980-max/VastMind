import { assert, canDiscover, post, query, summary, uuid, type Query } from "./social";

// Shared visibility predicate is repeated on every page, not trusted from the cursor.
const visible = `m.ready=true AND m.content_type LIKE 'video/%'
  AND (co.id IS NULL OR co.is_private=false OR EXISTS(
    SELECT 1 FROM community_members cm WHERE cm.community_id=co.id AND cm.user_id=$1 AND cm.state='member'))
  AND NOT EXISTS(SELECT 1 FROM blocks b WHERE
    (b.user_id=$1 AND b.target_id IN(p.author_id,co.owner_id)) OR
    (b.target_id=$1 AND b.user_id IN(p.author_id,co.owner_id)))`;
const joins = `FROM posts p JOIN media_uploads m ON m.id=p.media_id
  LEFT JOIN communities co ON co.id=p.community_id`;

export async function creatorProfile(identifier: string, viewer: string, q: Query = query) {
  const [creator] = await q("SELECT * FROM users WHERE id=$1 OR lower(username)=lower($1) LIMIT 1", [identifier]);
  assert(creator && await canDiscover(viewer, creator, q), 404, "Creator unavailable");
  const [counts] = await q(`SELECT
    (SELECT count(*)::int FROM follows WHERE target_id=$2) AS followers,
    (SELECT count(*)::int FROM follows WHERE user_id=$2) AS following,
    (SELECT count(*)::int ${joins} WHERE p.author_id=$2 AND ${visible}) AS clips`, [viewer, creator.id]);
  return { user: await summary(creator.id, viewer, q), bio: creator.bio || "",
    followersCount: counts.followers, followingCount: counts.following, clipsCount: counts.clips };
}

export function parseVideoCursor(cursor: string) {
  const match = /^([a-f0-9-]{36}):(\d{1,3})$/i.exec(cursor);
  assert(match && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(match[1]), 400, "Refresh the video feed");
  const offset = Number(match[2]);
  assert(offset > 0 && offset < 300 && offset % 20 === 0, 400, "Invalid video cursor");
  return { id: match[1], offset };
}

// Explainable ranking: follows, shared communities, likes/completions, freshness,
// and a penalty for already-watched clips. No external tracking or fake AI score.
const relevance = `
  CASE WHEN EXISTS(SELECT 1 FROM follows WHERE user_id=$1 AND target_id=p.author_id) THEN 12 ELSE 0 END
  + CASE WHEN EXISTS(SELECT 1 FROM community_members WHERE user_id=$1 AND community_id=p.community_id AND state='member') THEN 6 ELSE 0 END
  + LEAST(6, (SELECT count(*) FROM reactions r JOIN posts liked ON liked.id=r.post_id
      WHERE r.user_id=$1 AND liked.author_id=p.author_id)) * 2
  + LEAST(4, (SELECT count(*) FROM video_engagement e JOIN posts watched ON watched.id=e.post_id
      WHERE e.user_id=$1 AND e.completed=true AND watched.author_id=p.author_id))
  + CASE WHEN co.category IS NOT NULL AND EXISTS(SELECT 1 FROM reactions r
      JOIN posts liked ON liked.id=r.post_id JOIN communities interest ON interest.id=liked.community_id
      WHERE r.user_id=$1 AND interest.category=co.category) THEN 6 ELSE 0 END
  + 8.0/(1+GREATEST(0,EXTRACT(EPOCH FROM (now()-p.created_at)))/86400.0)
  - CASE WHEN EXISTS(SELECT 1 FROM video_engagement WHERE user_id=$1 AND post_id=p.id AND watch_ms>=3000) THEN 18 ELSE 0 END`;

export async function videoPage(viewer: string, input: { before?: string; feed?: string; creatorId?: string }, q: Query = query) {
  const feed = input.feed || "for-you";
  assert(["for-you", "following", "latest"].includes(feed), 400, "Invalid feed");
  const creator = input.creatorId ? (await creatorProfile(input.creatorId, viewer, q)).user.id : null;
  let ids: string[], sessionId: string, offset = 0;
  if (input.before) {
    const cursor = parseVideoCursor(input.before);
    const [session] = await q(`SELECT post_ids FROM video_feed_sessions WHERE id=$1 AND user_id=$2
      AND feed=$3 AND creator_id IS NOT DISTINCT FROM $4 AND expires_at>now()`, [cursor.id, viewer, feed, creator]);
    assert(session, 400, "This feed expired. Refresh to see new clips");
    ids = session.post_ids;
    sessionId = cursor.id;
    offset = cursor.offset;
  } else {
    // Remove expired/private sessions in small bounded batches; retain at most ten
    // active sessions per member. Session IDs are random and bound to their owner.
    await q(`DELETE FROM video_feed_sessions WHERE id IN(
      SELECT id FROM video_feed_sessions WHERE expires_at<=now() LIMIT 100)`);
    await q(`DELETE FROM video_feed_sessions WHERE user_id=$1 AND id NOT IN(
      SELECT id FROM video_feed_sessions WHERE user_id=$1 ORDER BY expires_at DESC LIMIT 9)`, [viewer]);
    const rank = feed === "for-you" && !creator ? relevance : "0";
    const rows = await q(`SELECT p.id,(${rank}) AS rank ${joins} WHERE ${visible}
      AND ($2::text IS NULL OR p.author_id=$2)
      AND ($3::text<>'following' OR EXISTS(SELECT 1 FROM follows WHERE user_id=$1 AND target_id=p.author_id))
      ORDER BY rank DESC,p.created_at DESC,p.id DESC LIMIT 300`, [viewer, creator, feed]);
    ids = rows.map(row => row.id);
    sessionId = uuid();
    if (ids.length) await q(`INSERT INTO video_feed_sessions (id,user_id,feed,creator_id,post_ids,expires_at)
      VALUES ($1,$2,$3,$4,$5,now()+interval '20 minutes')`, [sessionId, viewer, feed, creator, ids]);
  }
  const pageIds = ids.slice(offset, offset + 20);
  // Blocks, membership, removal and media readiness can change between pages.
  const rows = pageIds.length ? await q(`SELECT p.id ${joins} WHERE ${visible}
    AND p.id=ANY($2::text[])
    AND ($3::text<>'following' OR EXISTS(SELECT 1 FROM follows WHERE user_id=$1 AND target_id=p.author_id))
    ORDER BY array_position($2::text[],p.id)`, [viewer, pageIds, feed]) : [];
  return { items: await Promise.all(rows.map(row => post(row.id, viewer, q))),
    nextBefore: offset + 20 < ids.length ? `${sessionId}:${offset + 20}` : null };
}

export function validateCaptions(cues: { start: number; end: number; text: string }[]) {
  let end = 0;
  for (const cue of cues) {
    assert(Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.start >= end &&
      cue.end > cue.start && cue.end <= 90 && cue.text.trim().length > 0 &&
      cue.text.length <= 500, 400, "Caption timings must be ordered, non-overlapping, and within 90 seconds");
    end = cue.end;
  }
  assert(cues.length <= 60, 400, "Too many caption cues");
  return cues.map(cue => ({ ...cue, text: cue.text.trim() }));
}
