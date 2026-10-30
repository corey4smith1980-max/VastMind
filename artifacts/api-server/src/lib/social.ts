import { pool } from "@workspace/db";
import { clerkClient } from "@clerk/express";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export type Row = Record<string, any>;
export type Query = (sql: string, values?: any[]) => Promise<Row[]>;
export const query: Query = async (sql, values = []) => (await pool.query(sql, values)).rows;
export const uuid = randomUUID;
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function assert(value: unknown, status = 404, message = "Not found"): asserts value {
  if (!value) throw new HttpError(status, message);
}
export async function transaction<T>(fn: (q: Query) => Promise<T>): Promise<T> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(async (sql, values = []) => (await client.query(sql, values)).rows);
    await client.query("COMMIT");
    return result;
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
}
export async function provision(userId: string) {
  let [user] = await query("SELECT * FROM users WHERE id=$1", [userId]);
  if (!user) {
    const identity = await clerkClient.users.getUser(userId);
    await query(`INSERT INTO users (id,name,username,email,avatar_url) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [userId, [identity.firstName,identity.lastName].filter(Boolean).join(" ") || identity.username || "Member",null,
        identity.emailAddresses.find(e=>e.id===identity.primaryEmailAddressId)?.emailAddress ?? null,identity.imageUrl || null]);
    [user] = await query("SELECT * FROM users WHERE id=$1",[userId]);
  }
  return user;
}
export const onlineUsers = new Map<string, number>();
export async function blocked(a: string,b: string,q: Query = query) {
  return (await q("SELECT 1 FROM blocks WHERE (user_id=$1 AND target_id=$2) OR (user_id=$2 AND target_id=$1)",[a,b])).length>0;
}
export async function contacts(a:string,b:string,q:Query=query) {
  const [result] = await q(`
    SELECT EXISTS (
      SELECT 1 FROM chat_members a
      JOIN chat_members b ON a.chat_id=b.chat_id
      JOIN chats c ON c.id=a.chat_id
      WHERE a.user_id=$1 AND b.user_id=$2 AND c.type='private'
    ) OR (
      EXISTS (SELECT 1 FROM follows WHERE user_id=$1 AND target_id=$2)
      AND EXISTS (SELECT 1 FROM follows WHERE user_id=$2 AND target_id=$1)
    ) AS contact`, [a, b]);
  return result.contact;
}
export async function canDiscover(viewer:string,target:Row,q:Query=query) {
  if(viewer===target.id) return true;
  if(await blocked(viewer,target.id,q)) return false;
  return target.profile_visibility==="everyone" || (target.profile_visibility==="contacts" && await contacts(viewer,target.id,q));
}
// Follow and block mutations run inside the caller's transaction.
export async function toggleFollow(viewer: string, targetId: string, q: Query) {
  assert(targetId !== viewer, 400, "Cannot follow yourself");
  const [target] = await q("SELECT * FROM users WHERE id=$1", [targetId]);
  assert(target);
  assert(!await blocked(viewer, targetId, q), 403, "Following is unavailable");
  const removed = await q(
    "DELETE FROM follows WHERE user_id=$1 AND target_id=$2 RETURNING user_id",
    [viewer, targetId],
  );
  if (!removed.length) {
    assert(await canDiscover(viewer, target, q), 403, "This profile is private");
    await q("INSERT INTO follows (user_id,target_id) VALUES ($1,$2)", [viewer, targetId]);
  }
  return { following: removed.length === 0 };
}

export async function blockMember(viewer: string, targetId: string, q: Query) {
  assert(viewer !== targetId, 400, "Cannot block yourself");
  assert((await q("SELECT id FROM users WHERE id=$1", [targetId])).length);
  await q(
    "INSERT INTO blocks (user_id,target_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
    [viewer, targetId],
  );
  await q(
    "DELETE FROM follows WHERE (user_id=$1 AND target_id=$2) OR (user_id=$2 AND target_id=$1)",
    [viewer, targetId],
  );
}
export async function canMessage(a:string,b:string,q:Query=query) {
  const [target]=await q("SELECT * FROM users WHERE id=$1",[b]);
  assert(target);
  assert(!await blocked(a,b,q),403,"Messaging is unavailable");
  assert(target.allow_messages_from==="everyone" || (target.allow_messages_from==="contacts" && await contacts(a,b,q)),403,"This member does not accept messages");
}
export async function summary(id:string,viewer:string,q:Query=query) {
  const [u]=await q("SELECT * FROM users WHERE id=$1",[id]); assert(u);
  const hidden=id!==viewer && !await canDiscover(viewer,u,q);
  const [mutual]=await q(`SELECT count(*)::int AS n FROM community_members a JOIN community_members b ON a.community_id=b.community_id
    WHERE a.user_id=$1 AND b.user_id=$2 AND a.state='member' AND b.state='member'`,[viewer,id]);
  const following = (await q(
    "SELECT 1 FROM follows WHERE user_id=$1 AND target_id=$2", [viewer, id],
  )).length > 0;
  return {
    id,
    name: hidden ? "Member" : u.name,
    username: hidden ? "" : u.username ?? "",
    avatarUrl: hidden ? null : u.avatar_url,
    online: !hidden && u.show_online_status && onlineUsers.has(id),
    mutualCommunities: hidden ? 0 : mutual.n,
    following,
    lastSeenAt: !hidden && u.show_last_seen ? u.last_seen_at : null,
  };
}
export function profile(u:Row) {
  return {id:u.id,name:u.name,username:u.username??"",email:u.email,avatarUrl:u.avatar_url,bio:u.bio,status:u.status,online:onlineUsers.has(u.id),
    privacy:{allowMessagesFrom:u.allow_messages_from,profileVisibility:u.profile_visibility,showOnlineStatus:u.show_online_status,showLastSeen:u.show_last_seen}};
}
export async function membership(chatId:string,userId:string,q:Query=query,admin=false) {
  const [m]=await q("SELECT m.*,c.type,c.name,c.is_private FROM chat_members m JOIN chats c ON c.id=m.chat_id WHERE m.chat_id=$1 AND m.user_id=$2",[chatId,userId]);
  assert(m,403,"Conversation access denied");
  if(admin) assert(m.type==="group" && ["owner","admin"].includes(m.role),403,"Group administrator required");
  return m;
}
export async function chatAllowed(chatId:string,userId:string,q:Query=query) {
  const m=await membership(chatId,userId,q);
  if(m.type==="private") {
    const others=await q("SELECT user_id FROM chat_members WHERE chat_id=$1 AND user_id<>$2",[chatId,userId]);
    for(const other of others) assert(!await blocked(userId,other.user_id,q),403,"Conversation unavailable");
  }
  return m;
}
export async function conversation(id:string,viewer:string,q:Query=query) {
  const me=await membership(id,viewer,q);
  const [c]=await q("SELECT * FROM chats WHERE id=$1",[id]);
  const members=await q("SELECT * FROM chat_members WHERE chat_id=$1 ORDER BY created_at,user_id",[id]);
  const [last]=await q(`SELECT m.* FROM messages m WHERE chat_id=$1 AND NOT EXISTS
    (SELECT 1 FROM blocks b WHERE (b.user_id=$2 AND b.target_id=m.sender_id) OR (b.target_id=$2 AND b.user_id=m.sender_id)) ORDER BY created_at DESC LIMIT 1`,[id,viewer]);
  const [unread]=await q(`SELECT count(*)::int AS n FROM messages m WHERE chat_id=$1 AND sender_id<>$2 AND created_at>coalesce($3::timestamptz,'epoch') AND NOT EXISTS
    (SELECT 1 FROM blocks b WHERE (b.user_id=$2 AND b.target_id=m.sender_id) OR (b.target_id=$2 AND b.user_id=m.sender_id))`,[id,viewer,me.last_read_at]);
  return {id,type:c.type,name:c.name,isPrivate:c.is_private,inviteCode:["owner","admin"].includes(me.role)?c.invite_code:null,
    members:await Promise.all(members.map(async m=>({user:await summary(m.user_id,viewer,q),role:m.role,joinedAt:m.created_at}))),memberCount:members.length,lastMessage:last?.content??null,lastMessageAt:last?.created_at??null,unreadCount:unread.n,createdAt:c.created_at};
}
export async function message(m:Row,viewer:string,q:Query=query,readState?:Row[]) {
  const u=await summary(m.sender_id,viewer,q);
  const readers=readState?readState.filter(r=>r.last_read_at && new Date(r.last_read_at)>=new Date(m.created_at)):await q("SELECT user_id FROM chat_members WHERE chat_id=$1 AND last_read_at>=$2",[m.chat_id,m.created_at]);
  const [media] = m.media_id ? await q("SELECT * FROM media_uploads WHERE id=$1 AND ready=true",[m.media_id]) : [];
  const reactions = await q(`SELECT emoji,count(*)::int AS count,bool_or(user_id=$2) AS "reactedByMe"
    FROM message_reactions WHERE message_id=$1 GROUP BY emoji ORDER BY emoji`,[m.id,viewer]);
  return {id:m.id,chatId:m.chat_id,senderId:m.sender_id,senderName:u.name,senderAvatarUrl:u.avatarUrl,content:m.content,type:m.type,createdAt:m.created_at,readBy:[...new Set([m.sender_id,...readers.map(r=>r.user_id)])],
    reactions,
    ...(media?{media:{id:media.id,url:`/api/storage/media/${media.id}`,name:media.name,contentType:media.content_type,size:Number(media.size)}}:{})};
}
export async function community(id:string,viewer:string,q:Query=query) {
  const [c]=await q(`SELECT c.*,(SELECT count(*)::int FROM community_members WHERE community_id=c.id AND state='member') AS n,
    (SELECT state FROM community_members WHERE community_id=c.id AND user_id=$2) AS membership FROM communities c WHERE id=$1`,[id,viewer]); assert(c);
  assert(!await blocked(viewer,c.owner_id,q),404);
  return {id:c.id,ownerId:c.owner_id,name:c.name,description:c.description,category:c.category,isPrivate:c.is_private,memberCount:c.n,membership:c.membership??"none",createdAt:c.created_at};
}
export async function postAccess(id:string,viewer:string,q:Query=query) {
  const [p]=await q("SELECT * FROM posts WHERE id=$1",[id]); assert(p);
  assert(!p.community_id,410,"Community posts are no longer available");
  assert(!await blocked(viewer,p.author_id,q),404);
  return p;
}
export async function post(id:string,viewer:string,q:Query=query) {
  const p=await postAccess(id,viewer,q);
  const [counts]=await q(`SELECT (SELECT count(*)::int FROM reactions WHERE post_id=$1) AS reactions,
    (SELECT count(*)::int FROM comments WHERE post_id=$1) AS comments,
    EXISTS(SELECT 1 FROM reactions WHERE post_id=$1 AND user_id=$2) AS reacted`,[id,viewer]);
  const options=await q(`SELECT o.id,o.label,(SELECT count(*)::int FROM votes WHERE option_id=o.id) AS votes,
    EXISTS(SELECT 1 FROM votes WHERE option_id=o.id AND user_id=$2) AS "votedByMe" FROM poll_options o WHERE post_id=$1 ORDER BY id`,[id,viewer]);
  const mediaRows=await q("SELECT id,name,content_type,size FROM media_uploads WHERE id=ANY($1::text[]) AND ready=true",[ [p.media_id,p.audio_media_id].filter(Boolean) ]);
  const shape=(r:Row|null|undefined)=>r?{id:r.id,url:`/api/storage/media/${r.id}`,name:r.name,contentType:r.content_type,size:Number(r.size)}:null;
  const mediaId=p.media_id?mediaRows.find(m=>m.id===p.media_id):null;
  const audioId=p.audio_media_id?mediaRows.find(m=>m.id===p.audio_media_id):null;
  const author=p.is_anonymous?{id:"anonymous",name:"Anonymous member",username:"",avatarUrl:null,online:false,mutualCommunities:0,following:false,lastSeenAt:null}:await summary(p.author_id,viewer,q);
  const surface=p.surface==="community"&&mediaId?.content_type?.startsWith("video/")?"feed":p.surface;
  return {id,author,content:p.content,createdAt:p.created_at,reactionsCount:counts.reactions,reacted:counts.reacted,commentsCount:counts.comments,communityId:p.community_id,communityName:p.community_id?(await community(p.community_id,viewer,q)).name:null,surface,pollOptions:options,media:shape(mediaId),audioMedia:shape(audioId),effect:p.effect||"none",captions:p.captions||[],isAnonymous:Boolean(p.is_anonymous)};
}
export function updateShape(u:Row) {return {id:u.id,channelId:u.channel_id,content:u.content,pinned:u.pinned,createdAt:u.created_at};}
export async function channelAccess(id:string,viewer:string,q:Query=query,owner=false) {
  const [c]=await q("SELECT * FROM channels WHERE id=$1",[id]);assert(c);
  assert(!await blocked(viewer,c.owner_id,q),404);
  if(owner) assert(c.owner_id===viewer,403,"Channel owner required");
  return c;
}
export async function channel(id:string,viewer:string,q:Query=query) {
  const c=await channelAccess(id,viewer,q);
  const [stats]=await q(`SELECT count(*)::int AS n,coalesce(bool_or(user_id=$2),false) AS followed FROM channel_followers WHERE channel_id=$1`,[id,viewer]);
  const [latest]=await q("SELECT * FROM channel_updates WHERE channel_id=$1 ORDER BY created_at DESC LIMIT 1",[id]);
  const [pinned]=await q("SELECT * FROM channel_updates WHERE channel_id=$1 AND pinned=true ORDER BY created_at DESC LIMIT 1",[id]);
  return {id,name:c.name,description:c.description,owner:await summary(c.owner_id,viewer,q),subscriberCount:stats.n,followed:stats.followed,pinnedUpdate:pinned?updateShape(pinned):null,latestUpdate:latest?updateShape(latest):null,createdAt:c.created_at};
}
export async function notify(q:Query,userId:string,actorId:string,type:string,title:string,body:string) {
  if(userId===actorId || await blocked(userId,actorId,q)) return;
  await q("INSERT INTO notifications (id,user_id,actor_id,type,title,body) VALUES ($1,$2,$3,$4,$5,$6)",[uuid(),userId,actorId,type,title,body]);
}
