import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as schemas from "@workspace/api-zod";
import { isValidStickerContent } from "../lib/stickers";
import { isValidChosenUsername, needsUsernameChoice, normalizeUsername } from "../lib/usernames";
import { z } from "zod";
import { query, transaction, provision, profile, summary, blocked, contacts, canDiscover, canMessage, membership, chatAllowed, conversation, message, community, postAccess, post, channelAccess, channel, updateShape, notify, uuid, assert, HttpError, onlineUsers, toggleFollow, blockMember, type Query, type Row } from "../lib/social";
import { changed, evictChat, disconnectUser } from "../lib/realtime";
import { claimMedia, mediaShape } from "../lib/media";
import { pushConfiguration, validPushEndpoint } from "../lib/push";
import { mediaTypes } from "../lib/media";
import { creatorProfile, videoPage, validateCaptions } from "../lib/videos";
import { validatePostComposition } from "../lib/post-composition";
import { verifyMailEnvelopeSignature } from "@workspace/mail-crypto";
import { authenticatedUserId } from "../lib/vastmind-auth";
import { listCommunityGigResponses, loadVisibleCommunityGig, shapeCommunityGig, shapeCommunityGigResponse } from "../lib/community-gigs";

const router=Router();
router.use(async(req,res,next)=>{
  const userId=await authenticatedUserId(req);
  if(!userId){res.status(401).json({error:"Authentication required"});return;}
  const user=await provision(userId);
  res.locals.user=user;
  if(needsUsernameChoice(user.username)&&!(req.path==="/me"&&["GET","PATCH"].includes(req.method))){
    res.status(428).json({error:"Choose a username to continue"});return;
  }
  next();
});
router.use(rateLimit({windowMs:60_000,limit:240,keyGenerator:(_req,res)=>res.locals.user.id,standardHeaders:"draft-8",legacyHeaders:false}));
router.use((req,res,next)=>{
  if(!["GET","HEAD","OPTIONS"].includes(req.method) && req.headers.origin && !req.headers.authorization) {
    const host=(req.headers["x-forwarded-host"] || req.headers.host || "").toString().split(",")[0].trim();
    try { if(new URL(req.headers.origin).host!==host) throw new Error(); } catch {res.status(403).json({error:"Cross-origin request rejected"});return;}
  }
  next();
});
// Retire public communities while preserving a predictable empty-list response for older clients.
router.use((req,res,next)=>{
  const path=req.path;
  const isCommunityResource=path==="/communities"||path.startsWith("/communities/")||path==="/community-gigs"||path.startsWith("/community-gigs/");
  if(!isCommunityResource){next();return;}
  if(req.method==="GET"&&(path==="/communities"||path==="/community-gigs")){res.status(200).json([]);return;}
  res.status(410).json({error:"Community features are no longer available."});
});
const writeLimit=rateLimit({windowMs:60_000,limit:60,keyGenerator:(_req,res)=>res.locals.user.id,standardHeaders:"draft-8",legacyHeaders:false});
type Context={u:string,user:Row,p:Record<string,string>,b:any,s:any,q:Query,impact:Set<string>,entity:string,chatId?:string};
const registry=schemas as unknown as Record<string,z.ZodType>;
function clean(v:unknown):unknown {
  if(v instanceof Date)return v.toISOString();
  if(Array.isArray(v))return v.map(clean);
  if(v && typeof v==="object")return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clean(x)]));
  return v;
}
function validate(schema:z.ZodType|undefined,value:unknown) {
  if(!schema)return value;
  const result=schema.safeParse(value);
  if(!result.success)throw new HttpError(400,"Invalid request parameters or content");
  return result.data;
}
function route(method:"get"|"post"|"patch"|"put"|"delete",path:string,operation:string,handler:(c:Context)=>Promise<unknown>,status=200) {
  if(!registry[`${operation}Response`])throw new Error(`Missing generated response contract: ${operation}`);
  router[method](path,...(method==="get"?[]:[writeLimit]),async(req,res)=>{
    const p=validate(registry[`${operation}Params`],req.params) as Record<string,string>;
    for(const value of Object.values(p))assert(typeof value==="string" && value.length>0 && value.length<=160,400,"Invalid identifier");
    // Query strings are not booleans: Boolean("false") is true. Normalize this
    // opt-in before the generated Zod coercion so clip-only clients stay intact.
    let queryInput: unknown = req.query;
    if(operation==="GetVideos" && req.query.includePosts!==undefined){
      assert(["true","false"].includes(req.query.includePosts as string),400,"Invalid includePosts");
      queryInput={...req.query,includePosts:req.query.includePosts==="true"};
    }
    const s=validate(registry[`${operation}QueryParams`],queryInput) as any;
    for(const value of Object.values(s))assert(typeof value!=="string" || value.length<=200,400,"Query is too long");
    const b=validate(registry[`${operation}Body`],req.body) as any;
    if(b && typeof b==="object")for(const [key,value] of Object.entries(b))if(typeof value==="string" && !["bio","status","description","buyerNote","rateNote"].includes(key) && !(operation==="CreatePost" && key==="content"))assert(value.trim().length>0,400,"Text must not be blank");
    const c:Context={u:res.locals.user.id,user:res.locals.user,p,b,s,q:query,impact:new Set([res.locals.user.id]),entity:path.split("/")[1]};
    const run=async(q:Query)=>{
      c.q=q;
      const output=clean(await handler(c));
      if(method!=="get"){
        if(c.entity==="posts" && c.p.postId){
          const p=await postAccess(c.p.postId,c.u,q);
          await feedImpact(c,p.community_id);
        }else if(["communities","channels","statuses","me"].includes(c.entity)){
          for(const id of onlineUsers.keys())if(!await blocked(c.u,id,q))c.impact.add(id);
          if(c.entity==="me")c.entity="profile";
        }
      }
      return registry[`${operation}Response`].parse(output);
    };
    const data=method==="get"?await run(query):await transaction(async q=>{await q("SELECT pg_advisory_xact_lock(821407)");return run(q);});
    if(method!=="get"){
      const recipients=[];
      for(const id of c.impact)if(id===c.u || !await blocked(c.u,id))recipients.push(id);
      changed(recipients,c.entity,c.chatId);
      if(["SendMessage","TogglePostReaction","AddPostComment","JoinCommunity","DecideCommunityRequest","PublishChannelUpdate"].includes(operation))changed(recipients,"notifications");
    }
    res.status(status).json(data);
  });
}
route("get","/push/config","GetPushConfig",async()=>pushConfiguration());
route("post","/push/subscription","SavePushSubscription",async c=>{
  assert(pushConfiguration().configured,503,"Closed-app push needs server configuration");
  assert(validPushEndpoint(c.b.endpoint),400,"Unsupported browser push endpoint");
  assert(/^[A-Za-z0-9_-]{87,88}$/.test(c.b.keys.p256dh)&&/^[A-Za-z0-9_-]{22,24}$/.test(c.b.keys.auth),400,"Invalid subscription keys");
  const [count]=await c.q("SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id=$1",[c.u]);
  assert(count.n<12,400,"Device limit reached. Disable push on an older device first");
  await c.q(`INSERT INTO push_subscriptions (id,user_id,endpoint,p256dh,auth) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth`,[uuid(),c.u,c.b.endpoint,c.b.keys.p256dh,c.b.keys.auth]);
  return {success:true};
});
route("delete","/push/subscription","RemovePushSubscription",async c=>{
  await c.q("DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2",[c.b.endpoint,c.u]);return {success:true};
});
async function chatImpact(c:Context,id:string) { c.chatId=id;c.entity="chats";for(const m of await c.q("SELECT user_id FROM chat_members WHERE chat_id=$1",[id]))c.impact.add(m.user_id); }
async function communityAdmin(c:Context,id:string) {
  const [m]=await c.q("SELECT * FROM community_members WHERE community_id=$1 AND user_id=$2 AND state='member'",[id,c.u]);
  assert(m && ["owner","admin"].includes(m.role),403,"Community administrator required");
}
async function groupAddition(c:Context,id:string,target:string) {
  const members=await c.q("SELECT user_id FROM chat_members WHERE chat_id=$1",[id]);
  assert(members.length<100,400,"Groups support up to 100 members");
  for(const m of members)assert(!await blocked(m.user_id,target,c.q),403,"Member cannot join this group");
  if(target!==c.u)await canMessage(c.u,target,c.q);
  await c.q("INSERT INTO chat_members (chat_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",[id,target]);
}
route("get","/me","GetMyProfile",async c=>profile(c.user));
route("patch","/me","UpdateMyProfile",async c=>{
  const username=c.b.username===undefined?undefined:normalizeUsername(c.b.username);
  if(username!==undefined){
    assert(isValidChosenUsername(username),400,"Username must be 3–32 letters, numbers or underscores, and cannot be an auto-generated handle");
    const [taken]=await c.q("SELECT id FROM users WHERE lower(username)=$1 AND id<>$2",[username,c.u]);
    assert(!taken,409,"That username is already taken");
  }
  if(c.b.avatarUrl!==undefined && c.b.avatarUrl!==null)assert(c.b.avatarUrl===c.user.avatar_url,400,"Avatar uploads are not available yet");
  const map:Record<string,string>={name:"name",username:"username",bio:"bio",status:"status",avatarUrl:"avatar_url"};
  for(const [key,col] of Object.entries(map))if(c.b[key]!==undefined)await c.q(`UPDATE users SET ${col}=$1 WHERE id=$2`,[key==="username"?username:c.b[key],c.u]);
  return profile((await c.q("SELECT * FROM users WHERE id=$1",[c.u]))[0]);
});
route("put","/me/privacy","UpdatePrivacySettings",async c=>{
  await c.q("UPDATE users SET allow_messages_from=$1,profile_visibility=$2,show_online_status=$3,show_last_seen=$4 WHERE id=$5",[c.b.allowMessagesFrom,c.b.profileVisibility,c.b.showOnlineStatus,c.b.showLastSeen,c.u]);
  disconnectUser(c.u);
  return c.b;
});
route("get","/users/search","SearchUsers",async c=>{
  const search=c.s.q.trim();
  const usernameOnly=search.startsWith("@");
  const term=usernameOnly?search.slice(1).toLowerCase():search;
  if(!term)return [];
  if(usernameOnly&&!/^[a-z0-9_]{3,32}$/.test(term))return [];
  const rows=usernameOnly
    ? await c.q("SELECT * FROM users WHERE id<>$1 AND username<>'' AND lower(username)=$2 ORDER BY name LIMIT 1",[c.u,term])
    : await c.q("SELECT * FROM users WHERE id<>$1 AND username<>'' AND (name ILIKE $2 OR username ILIKE $2) ORDER BY name LIMIT 60",[c.u,`%${term.replace(/[%_\\]/g,"\\$&")}%`]);
  const result=[];for(const row of rows)if(await canDiscover(c.u,row,c.q))result.push(await summary(row.id,c.u,c.q));return result;
});
// People discovery and directed follows.
route("get", "/users/suggestions", "GetSuggestedPeople", async c => {
  const candidates = await c.q(`
    SELECT u.*,
      (SELECT count(*) FROM community_members mine
       JOIN community_members theirs ON mine.community_id=theirs.community_id
       WHERE mine.user_id=$1 AND theirs.user_id=u.id
         AND mine.state='member' AND theirs.state='member') AS mutual_count
    FROM users u
    WHERE u.id<>$1
      AND NOT EXISTS (
        SELECT 1 FROM blocks
        WHERE (user_id=$1 AND target_id=u.id) OR (target_id=$1 AND user_id=u.id)
      )
      AND (
        u.profile_visibility='everyone'
        OR (u.profile_visibility='contacts' AND (
          EXISTS (
            SELECT 1 FROM chat_members mine
            JOIN chat_members theirs ON mine.chat_id=theirs.chat_id
            JOIN chats chat ON chat.id=mine.chat_id
            WHERE mine.user_id=$1 AND theirs.user_id=u.id AND chat.type='private'
          )
          OR (
            EXISTS (SELECT 1 FROM follows WHERE user_id=$1 AND target_id=u.id)
            AND EXISTS (SELECT 1 FROM follows WHERE user_id=u.id AND target_id=$1)
          )
        ))
      )
    ORDER BY mutual_count DESC, lower(u.name), u.id
    LIMIT 30`, [c.u]);
  return Promise.all(candidates.map(user => summary(user.id, c.u, c.q)));
});
route("post", "/users/:userId/follow", "ToggleUserFollow", async c => {
  const targetId = c.p.userId;
  const result = await toggleFollow(c.u, targetId, c.q);
  c.impact.add(targetId);
  return result;
});
route("get","/users/blocked","ListBlockedUsers",async c=>Promise.all((await c.q("SELECT target_id FROM blocks WHERE user_id=$1",[c.u])).map(async r=>{
  const [u]=await c.q("SELECT * FROM users WHERE id=$1",[r.target_id]);
  return {id:u.id,name:u.name,username:u.username,avatarUrl:u.avatar_url,online:false,mutualCommunities:0};
})));
route("post","/users/:userId/block","BlockUser",async c=>{
  await blockMember(c.u, c.p.userId, c.q);
  c.impact.add(c.p.userId);disconnectUser(c.u);disconnectUser(c.p.userId);return {blocked:true};
});
route("delete","/users/:userId/block","UnblockUser",async c=>{await c.q("DELETE FROM blocks WHERE user_id=$1 AND target_id=$2",[c.u,c.p.userId]);return {blocked:false};});
route("post","/users/:userId/reports","ReportUser",async c=>{
  assert(c.u!==c.p.userId,400,"Cannot report yourself");assert((await c.q("SELECT id FROM users WHERE id=$1",[c.p.userId])).length);
  await c.q("INSERT INTO reports (id,user_id,target_id,reason) VALUES ($1,$2,$3,$4)",[uuid(),c.u,c.p.userId,c.b.reason]);return {submitted:true};
},201);
route("get","/chats","ListChats",async c=>{
  const rows=await c.q("SELECT chat_id FROM chat_members WHERE user_id=$1 LIMIT 200",[c.u]);
  const result=[];for(const r of rows){try{await chatAllowed(r.chat_id,c.u,c.q);const chat=await conversation(r.chat_id,c.u,c.q);if(!c.s.q || `${chat.name??""} ${chat.members.map(m=>m.user.name).join(" ")}`.toLowerCase().includes(c.s.q.toLowerCase()))result.push(chat);}catch(e){if(!(e instanceof HttpError))throw e;}}
  return result.sort((a,b)=>new Date(b.lastMessageAt??b.createdAt).getTime()-new Date(a.lastMessageAt??a.createdAt).getTime());
});
route("post","/chats","CreateChat",async c=>{
  const ids=[...new Set<string>(c.b.memberIds)].filter(id=>id!==c.u);
  assert(ids.length>0 && ids.length<100 && ids.every(id=>id.length<=160),400,"Choose 1–99 members");
  assert(c.b.type!=="private" || ids.length===1,400,"Direct chats require one recipient");
  for(const target of ids)await canMessage(c.u,target,c.q);
  for(const a of ids)for(const b of ids)if(a!==b)assert(!await blocked(a,b,c.q),403,"Members cannot share a group");
  const key=c.b.type==="private"?[c.u,ids[0]].sort().join(":"):null;
  if(key){const [old]=await c.q("SELECT id FROM chats WHERE direct_key=$1",[key]);if(old)return conversation(old.id,c.u,c.q);}
  const id=uuid();await c.q("INSERT INTO chats (id,type,name,is_private,direct_key) VALUES ($1,$2,$3,$4,$5)",[id,c.b.type,c.b.name??null,c.b.isPrivate??true,key]);
  for(const user of [c.u,...ids])await c.q("INSERT INTO chat_members (chat_id,user_id,role) VALUES ($1,$2,$3)",[id,user,user===c.u?"owner":"member"]);
  await chatImpact(c,id);return conversation(id,c.u,c.q);
},201);
route("get","/chats/:chatId/messages","GetChatMessages",async c=>{
  await chatAllowed(c.p.chatId,c.u,c.q);
  const limit=Number(c.s.limit??40);assert(Number.isInteger(limit)&&limit>=1&&limit<=100,400,"Invalid limit");
  const rows=await c.q(`SELECT m.* FROM messages m WHERE chat_id=$1 AND ($2::timestamptz IS NULL OR created_at<$2)
    AND ($5::text IS NULL
      OR to_tsvector('simple', m.content) @@ websearch_to_tsquery('simple', $5)
      OR m.content ILIKE $6)
    AND NOT EXISTS
    (SELECT 1 FROM blocks b WHERE (b.user_id=$3 AND b.target_id=m.sender_id) OR (b.target_id=$3 AND b.user_id=m.sender_id)) ORDER BY created_at DESC,id DESC LIMIT $4`,[c.p.chatId,c.s.before??null,c.u,limit+1,c.s.q??null,c.s.q?`%${c.s.q.replace(/[%_\\]/g,"\\$&")}%`:null]);
  const page=rows.slice(0,limit);
  const readState=await c.q("SELECT user_id,last_read_at FROM chat_members WHERE chat_id=$1",[c.p.chatId]);
  return {items:await Promise.all(page.reverse().map(m=>message(m,c.u,c.q,readState))),nextBefore:rows.length>limit?rows[limit-1].created_at:null};
});
route("post","/chats/:chatId/messages","SendMessage",async c=>{
  const m=await chatAllowed(c.p.chatId,c.u,c.q);
  if(m.type==="private")for(const target of await c.q("SELECT user_id FROM chat_members WHERE chat_id=$1 AND user_id<>$2",[c.p.chatId,c.u]))await canMessage(c.u,target.user_id,c.q);
  if(c.b.replyToId)assert((await c.q("SELECT id FROM messages WHERE id=$1 AND chat_id=$2",[c.b.replyToId,c.p.chatId])).length,400,"Reply must reference this conversation");
  if(c.b.type==="sticker")assert(!c.b.mediaId && isValidStickerContent(c.b.content),400,"Stickers must be a supported emoji or VastMind original");
  const media=await claimMedia(c.b.mediaId,c.u,"chat",c.p.chatId,c.q);
  const type=media?(media.content_type.startsWith("image/")?"image":media.content_type.startsWith("video/")?"video":"voice"):(c.b.type??"text");
  const [sent]=await c.q("INSERT INTO messages (id,chat_id,sender_id,content,reply_to_id,media_id,type) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",[uuid(),c.p.chatId,c.u,c.b.content,c.b.replyToId??null,media?.id??null,type]);
  await c.q("UPDATE chat_members SET last_read_at=$1 WHERE chat_id=$2 AND user_id=$3",[sent.created_at,c.p.chatId,c.u]);
  await chatImpact(c,c.p.chatId);
  for(const target of c.impact)await notify(c.q,target,c.u,"message","New message","You have a new message.");
  return message(sent,c.u,c.q);
},201);
route("post","/chats/:chatId/messages/:messageId/reactions","ToggleMessageReaction",async c=>{
  await chatAllowed(c.p.chatId,c.u,c.q);
  assert(/\p{Extended_Pictographic}/u.test(c.b.emoji),400,"Choose an emoji reaction");
  assert((await c.q("SELECT id FROM messages WHERE id=$1 AND chat_id=$2",[c.p.messageId,c.p.chatId])).length,404,"Message not found");
  const removed=await c.q("DELETE FROM message_reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3 RETURNING message_id",[c.p.messageId,c.u,c.b.emoji]);
  if(!removed.length)await c.q("INSERT INTO message_reactions (message_id,user_id,emoji) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",[c.p.messageId,c.u,c.b.emoji]);
  c.chatId=c.p.chatId;await chatImpact(c,c.p.chatId);
  const reactions=await c.q(`SELECT emoji,count(*)::int AS count,bool_or(user_id=$2) AS "reactedByMe"
    FROM message_reactions WHERE message_id=$1 GROUP BY emoji ORDER BY emoji`,[c.p.messageId,c.u]);
  return {reactions};
});
route("post","/chats/:chatId/read","MarkChatRead",async c=>{await chatAllowed(c.p.chatId,c.u,c.q);await c.q("UPDATE chat_members SET last_read_at=now() WHERE chat_id=$1 AND user_id=$2",[c.p.chatId,c.u]);await chatImpact(c,c.p.chatId);return {success:true};});
route("post","/chats/:chatId/members","AddChatMember",async c=>{
  await membership(c.p.chatId,c.u,c.q,true);await groupAddition(c,c.p.chatId,c.b.userId);await chatImpact(c,c.p.chatId);return conversation(c.p.chatId,c.u,c.q);
});
route("delete","/chats/:chatId/members/:userId","RemoveChatMember",async c=>{
  const me=await membership(c.p.chatId,c.u,c.q,true),target=await membership(c.p.chatId,c.p.userId,c.q);
  assert(c.p.userId!==c.u,400,"Use leave conversation");assert(target.role!=="owner" && (me.role==="owner" || target.role==="member"),403,"Cannot remove this administrator");
  await chatImpact(c,c.p.chatId);await c.q("DELETE FROM chat_members WHERE chat_id=$1 AND user_id=$2",[c.p.chatId,c.p.userId]);evictChat(c.p.userId,c.p.chatId);return conversation(c.p.chatId,c.u,c.q);
});
route("post","/chats/:chatId/leave","LeaveChat",async c=>{
  const me=await membership(c.p.chatId,c.u,c.q);assert(me.type==="group",400,"Only groups can be left");
  await chatImpact(c,c.p.chatId);
  await c.q("DELETE FROM chat_members WHERE chat_id=$1 AND user_id=$2",[c.p.chatId,c.u]);
  if(me.role==="owner")await c.q("UPDATE chat_members SET role='owner' WHERE chat_id=$1 AND user_id=(SELECT user_id FROM chat_members WHERE chat_id=$1 ORDER BY CASE WHEN role='admin' THEN 0 ELSE 1 END,created_at,user_id LIMIT 1)",[c.p.chatId]);
  await c.q("DELETE FROM chats WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM chat_members WHERE chat_id=$1)",[c.p.chatId]);
  evictChat(c.u,c.p.chatId);return {success:true};
});
route("post","/chats/:chatId/invite","CreateChatInvite",async c=>{
  await membership(c.p.chatId,c.u,c.q,true);
  const [chat]=await c.q("UPDATE chats SET invite_code=coalesce(invite_code,$2) WHERE id=$1 RETURNING invite_code",[c.p.chatId,uuid()]);
  return {inviteCode:chat.invite_code};
});
route("post","/invites/:inviteCode/join","AcceptChatInvite",async c=>{
  const [chat]=await c.q("SELECT * FROM chats WHERE invite_code=$1 AND type='group'",[c.p.inviteCode]);assert(chat);
  await groupAddition(c,chat.id,c.u);await chatImpact(c,chat.id);return conversation(chat.id,c.u,c.q);
});
route("get","/feed","GetFeed",async c=>{
  const rows=await c.q(`SELECT p.id FROM posts p LEFT JOIN media_uploads m ON m.id=p.media_id WHERE p.community_id IS NULL
    AND p.surface='community' AND (p.media_id IS NULL OR (m.ready=true AND m.content_type NOT LIKE 'video/%'))
    AND ($2::timestamptz IS NULL OR p.created_at<$2)
    AND ($3::text IS NULL
      OR to_tsvector('simple', p.content) @@ websearch_to_tsquery('simple', $3)
      OR p.content ILIKE $4)
    AND NOT EXISTS(SELECT 1 FROM blocks WHERE
      (user_id=$1 AND target_id=p.author_id) OR (target_id=$1 AND user_id=p.author_id))
    ORDER BY p.created_at DESC LIMIT 40`,[c.u,c.s.before??null,c.s.q??null,c.s.q?`%${c.s.q.replace(/[%_\\]/g,"\\$&")}%`:null]);
  return Promise.all(rows.map(r=>post(r.id,c.u,c.q)));
});
route("get","/videos","GetVideos",async c=>{
  return videoPage(c.u,c.s,c.q);
});
route("get","/creators/:userId","GetCreator",async c=>creatorProfile(c.p.userId,c.u,c.q));
route("post","/videos/:postId/engagement","RecordVideoEngagement",async c=>{
  const p=await postAccess(c.p.postId,c.u,c.q);
  const [m]=await c.q("SELECT 1 FROM media_uploads WHERE id=$1 AND ready=true AND content_type LIKE 'video/%'",[p.media_id]);
  assert(m,404,"Video unavailable");
  await c.q(`INSERT INTO video_engagement (user_id,post_id,watch_ms,completed) VALUES ($1,$2,$3,$4)
    ON CONFLICT(user_id,post_id) DO UPDATE SET watch_ms=greatest(video_engagement.watch_ms,excluded.watch_ms),
    completed=video_engagement.completed OR excluded.completed,updated_at=now()`,[c.u,p.id,c.b.watchMs,c.b.completed]);
  return {success:true};
});
route("delete","/videos/history","ResetVideoHistory",async c=>{
  await c.q("DELETE FROM video_engagement WHERE user_id=$1",[c.u]);
  await c.q("DELETE FROM video_feed_sessions WHERE user_id=$1",[c.u]);
  return {success:true};
});
route("post","/posts","CreatePost",async c=>{
  assert(!c.b.pollOptions?.length || c.b.pollOptions.length>=2,400,"Polls require at least two options");
  if(c.b.pollOptions)assert(new Set(c.b.pollOptions.map((x:string)=>x.trim().toLowerCase())).size===c.b.pollOptions.length && c.b.pollOptions.every((x:string)=>x.trim()),400,"Poll options must be distinct and nonempty");
  const main=await claimMedia(c.b.mediaId,c.u,"post",null,c.q);
  const soundtrack=await claimMedia(c.b.audioMediaId,c.u,"post",null,c.q);
  const captions=validateCaptions(c.b.captions??[]);
  assert(captions.length===0 || main?.content_type.startsWith("video/"),400,"Captions require a video clip");
  assert(!soundtrack||main?.content_type.startsWith("video/"),400,"A soundtrack needs a video");
  assert(!main||mediaTypes.has(main.content_type),400,"Unsupported media format");
  assert(!soundtrack||soundtrack.content_type.startsWith("audio/"),400,"Choose an audio track");
  assert(!main||!main.content_type.startsWith("audio/"),400,"Choose a photo or video clip");
  const surface=c.b.surface??(main?.content_type.startsWith("video/")?"feed":"community");
  assert(["feed","community","profile"].includes(surface),400,"Choose a valid post destination");
  assert(surface==="feed"?main?.content_type.startsWith("video/"):!main?.content_type.startsWith("video/"),400,
    surface==="feed"?"Feed posts must include a video clip":"Video clips belong in Feed, not Community or Profile");
  validatePostComposition(c.b.content,main?.content_type,c.b.pollOptions);
  const id=uuid();await c.q("INSERT INTO posts (id,author_id,community_id,surface,content,media_id,audio_media_id,effect,captions,is_anonymous) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9)",[id,c.u,surface,c.b.content,main?.id??null,soundtrack?.id??null,c.b.effect??"none",JSON.stringify(captions),c.b.isAnonymous??false]);
  for(const label of c.b.pollOptions??[])await c.q("INSERT INTO poll_options (id,post_id,label) VALUES ($1,$2,$3)",[uuid(),id,label]);
  await feedImpact(c,null);return post(id,c.u,c.q);
},201);
async function feedImpact(c:Context,communityId:string|null) {
  c.entity="feed";
  const rows=communityId?await c.q("SELECT user_id AS id FROM community_members WHERE community_id=$1 AND state='member'",[communityId]):[...onlineUsers.keys()].map(id=>({id}));
  for(const r of rows)if(!await blocked(c.u,r.id,c.q))c.impact.add(r.id);
}
route("post","/posts/:postId/reactions","TogglePostReaction",async c=>{
  const p=await postAccess(c.p.postId,c.u,c.q);
  const old=await c.q("DELETE FROM reactions WHERE post_id=$1 AND user_id=$2 RETURNING *",[p.id,c.u]);
  if(!old.length){await c.q("INSERT INTO reactions (post_id,user_id,reaction) VALUES ($1,$2,$3)",[p.id,c.u,c.b.reaction]);await notify(c.q,p.author_id,c.u,"reaction","New reaction","Someone reacted to your post.");}
  c.impact.add(p.author_id);const result=await post(p.id,c.u,c.q);return {reacted:result.reacted,reactionsCount:result.reactionsCount};
});
async function commentShape(row:Row,c:Context){return {id:row.id,postId:row.post_id,author:await summary(row.author_id,c.u,c.q),content:row.content,createdAt:row.created_at};}
route("get","/posts/:postId/comments","ListPostComments",async c=>{
  await postAccess(c.p.postId,c.u,c.q);
  const rows=await c.q(`SELECT x.* FROM comments x WHERE post_id=$1 AND NOT EXISTS (SELECT 1 FROM blocks WHERE (user_id=$2 AND target_id=x.author_id) OR (target_id=$2 AND user_id=x.author_id)) ORDER BY created_at LIMIT 200`,[c.p.postId,c.u]);return Promise.all(rows.map(r=>commentShape(r,c)));
});
route("post","/posts/:postId/comments","AddPostComment",async c=>{
  const p=await postAccess(c.p.postId,c.u,c.q);const [r]=await c.q("INSERT INTO comments (id,post_id,author_id,content) VALUES ($1,$2,$3,$4) RETURNING *",[uuid(),p.id,c.u,c.b.content]);
  await notify(c.q,p.author_id,c.u,"comment","New comment","Someone commented on your post.");c.impact.add(p.author_id);return commentShape(r,c);
},201);
route("post","/posts/:postId/vote","VoteOnPoll",async c=>{
  const body=validate(schemas.VoteOnPollBody,c.b) as {optionId:string};
  await postAccess(c.p.postId,c.u,c.q);assert((await c.q("SELECT id FROM poll_options WHERE id=$1 AND post_id=$2",[body.optionId,c.p.postId])).length,400,"Invalid poll option");
  await c.q("INSERT INTO votes (post_id,user_id,option_id) VALUES ($1,$2,$3) ON CONFLICT (post_id,user_id) DO UPDATE SET option_id=excluded.option_id",[c.p.postId,c.u,body.optionId]);return post(c.p.postId,c.u,c.q);
});
route("get","/communities","ListCommunities",async c=>{
  const rows=await c.q(`SELECT c.id FROM communities c WHERE ($2::text IS NULL OR name ILIKE $2) AND ($3::text IS NULL OR category=$3) AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id=$1 AND target_id=c.owner_id) OR (target_id=$1 AND user_id=c.owner_id)) ORDER BY created_at DESC LIMIT 100`,[c.u,c.s.q?`%${c.s.q}%`:null,c.s.category??null]);return Promise.all(rows.map(r=>community(r.id,c.u,c.q)));
});
route("post","/communities","CreateCommunity",async c=>{
  const id=uuid();await c.q("INSERT INTO communities (id,owner_id,name,description,category,is_private) VALUES ($1,$2,$3,$4,$5,$6)",[id,c.u,c.b.name,c.b.description,c.b.category,c.b.isPrivate]);
  await c.q("INSERT INTO community_members (community_id,user_id,role) VALUES ($1,$2,'owner')",[id,c.u]);return community(id,c.u,c.q);
},201);
route("post","/communities/:communityId/join","JoinCommunity",async c=>{
  const co=await community(c.p.communityId,c.u,c.q);
  if(co.membership==="none")await c.q("INSERT INTO community_members (community_id,user_id,state) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",[co.id,c.u,co.isPrivate?"requested":"member"]);
  if(co.isPrivate && co.membership==="none")for(const admin of await c.q("SELECT user_id FROM community_members WHERE community_id=$1 AND role IN('owner','admin') AND state='member'",[co.id])){await notify(c.q,admin.user_id,c.u,"community","Membership request","A member requested to join your community.");c.impact.add(admin.user_id);}
  const result=await community(co.id,c.u,c.q);return {membership:result.membership,memberCount:result.memberCount};
});
route("get","/communities/:communityId/requests","ListCommunityRequests",async c=>{
  await communityAdmin(c,c.p.communityId);const rows=await c.q("SELECT user_id FROM community_members WHERE community_id=$1 AND state='requested'",[c.p.communityId]);const result=[];for(const r of rows)if(!await blocked(c.u,r.user_id,c.q))result.push(await summary(r.user_id,c.u,c.q));return result;
});
route("post","/communities/:communityId/requests/:userId","DecideCommunityRequest",async c=>{
  const body=validate(schemas.DecideCommunityRequestBody,c.b) as {approve:boolean};
  await communityAdmin(c,c.p.communityId);assert(!await blocked(c.u,c.p.userId,c.q),403,"Membership unavailable");
  const [pending]=await c.q("SELECT * FROM community_members WHERE community_id=$1 AND user_id=$2 AND state='requested'",[c.p.communityId,c.p.userId]);assert(pending);
  if(body.approve)await c.q("UPDATE community_members SET state='member' WHERE community_id=$1 AND user_id=$2",[c.p.communityId,c.p.userId]);
  else await c.q("DELETE FROM community_members WHERE community_id=$1 AND user_id=$2",[c.p.communityId,c.p.userId]);
  await notify(c.q,c.p.userId,c.u,"community","Membership request reviewed",body.approve?"Your request was approved.":"Your request was declined.");c.impact.add(c.p.userId);
  return {membership:body.approve?"member":"none",memberCount:(await community(c.p.communityId,c.u,c.q)).memberCount};
});

async function communityGigImpact(c:Context,communityId:string) {
  c.entity="communities";
  for(const member of await c.q("SELECT user_id FROM community_members WHERE community_id=$1 AND state='member'",[communityId]))c.impact.add(member.user_id);
}
route("get","/community-gigs","ListCommunityGigs",async c=>{
  const search=c.s.q?.trim();
  const pattern=search?`%${search.replace(/[%_\\]/g,"\\$&")}%`:null;
  const rows=await c.q(`SELECT g.* FROM community_gigs g
    JOIN communities co ON co.id=g.community_id
    WHERE ($2::text IS NULL OR g.community_id=$2)
      AND ($3::text IS NULL OR g.kind=$3)
      AND ($4::text IS NULL OR g.category=$4)
      AND ($5::text='mine' OR g.state IN('open','matched'))
      AND ($5::text<>'mine' OR g.author_id=$1 OR EXISTS(SELECT 1 FROM community_gig_responses mine WHERE mine.gig_id=g.id AND mine.user_id=$1))
      AND (co.is_private=false OR EXISTS(SELECT 1 FROM community_members m WHERE m.community_id=co.id AND m.user_id=$1 AND m.state='member'))
      AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user_id=$1 AND b.target_id=g.author_id) OR (b.target_id=$1 AND b.user_id=g.author_id))
      AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user_id=$1 AND b.target_id=co.owner_id) OR (b.target_id=$1 AND b.user_id=co.owner_id))
      AND ($6::text IS NULL OR g.title ILIKE $6 OR g.description ILIKE $6 OR g.category ILIKE $6 OR co.name ILIKE $6)
    ORDER BY CASE WHEN g.state='open' THEN 0 ELSE 1 END,g.created_at DESC LIMIT 100`,
    [c.u,c.s.communityId??null,c.s.kind??null,c.s.category??null,c.s.scope??"community",pattern]);
  return Promise.all(rows.map(row=>shapeCommunityGig(row,c.u,c.q)));
});
route("post","/community-gigs","CreateCommunityGig",async c=>{
  const group=await community(c.b.communityId,c.u,c.q);
  assert(group.membership==="member",403,"Join the community before publishing a listing");
  assert(c.b.title.trim().length>=3 && c.b.description.trim().length>=3,400,"Add a clear title and description");
  assert(["offer","request"].includes(c.b.kind),400,"Choose an offer or a help request");
  const category=["home-repairs","learning","creative","technology","personal-care","food-events","transport","errands","childcare","other"];
  assert(category.includes(c.b.category),400,"Choose a skill category");
  const [gig]=await c.q(`INSERT INTO community_gigs
    (id,community_id,author_id,kind,title,description,category,rate_note)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [uuid(),group.id,c.u,c.b.kind,c.b.title.trim(),c.b.description.trim(),c.b.category,(c.b.rateNote??"").trim()]);
  await communityGigImpact(c,group.id);
  return shapeCommunityGig(gig,c.u,c.q);
},201);
route("post","/community-gigs/:gigId/responses","CreateCommunityGigResponse",async c=>{
  const {gig,group}=await loadVisibleCommunityGig(c.p.gigId,c.u,c.q);
  assert(group.membership==="member",403,"Join the community before responding");
  const [open]=await c.q("SELECT id FROM community_gigs WHERE id=$1 AND state='open' FOR UPDATE",[gig.id]);
  assert(open,409,"This listing is no longer accepting responses");
  assert(gig.author_id!==c.u,400,"You cannot respond to your own listing");
  assert(!await blocked(gig.author_id,c.u,c.q),403,"This response is unavailable");
  const [existing]=await c.q("SELECT id FROM community_gig_responses WHERE gig_id=$1 AND user_id=$2",[gig.id,c.u]);
  assert(!existing,409,"You already responded to this listing");
  const [response]=await c.q(`INSERT INTO community_gig_responses(id,gig_id,user_id,message)
    VALUES($1,$2,$3,$4) RETURNING *`,[uuid(),gig.id,c.u,c.b.message.trim()]);
  await notify(c.q,gig.author_id,c.u,"community","New community opportunity","A member responded to your listing.");
  c.impact.add(gig.author_id);
  await communityGigImpact(c,group.id);
  return shapeCommunityGigResponse(response,c.u,c.q);
},201);
route("get","/community-gigs/:gigId/responses","ListCommunityGigResponses",async c=>{
  return listCommunityGigResponses(c.p.gigId,c.u,c.q);
});
route("post","/community-gigs/:gigId/responses/:responseId","DecideCommunityGigResponse",async c=>{
  const {gig,group}=await loadVisibleCommunityGig(c.p.gigId,c.u,c.q);
  assert(group.membership==="member",403,"Join the community to manage responses");
  assert(gig.author_id===c.u,403,"Only the listing author can choose a response");
  const [response]=await c.q("SELECT * FROM community_gig_responses WHERE id=$1 AND gig_id=$2",[c.p.responseId,gig.id]);
  assert(response?.state==="pending",404,"Response not found");
  if(c.b.accept){
    const [open]=await c.q("SELECT id FROM community_gigs WHERE id=$1 AND state='open' FOR UPDATE",[gig.id]);
    assert(open,409,"This listing has already been matched or closed");
    const [accepted]=await c.q("UPDATE community_gig_responses SET state='accepted' WHERE id=$1 AND gig_id=$2 AND state='pending' RETURNING id",[response.id,gig.id]);
    assert(accepted,409,"This response was already reviewed");
    const [matched]=await c.q("UPDATE community_gigs SET state='matched' WHERE id=$1 AND state='open' RETURNING id",[gig.id]);
    assert(matched,409,"This listing has already been matched or closed");
    await c.q("UPDATE community_gig_responses SET state='declined' WHERE gig_id=$1 AND state='pending'",[gig.id]);
    await notify(c.q,response.user_id,c.u,"community","Your response was accepted","The community member selected you for this opportunity.");
  }else{
    const [updated]=await c.q("UPDATE community_gig_responses SET state='declined' WHERE id=$1 AND state='pending' RETURNING id",[response.id]);
    assert(updated,409,"This response was already reviewed");
    await notify(c.q,response.user_id,c.u,"community","Your response was reviewed","The community member reviewed your response.");
  }
  c.impact.add(response.user_id);
  await communityGigImpact(c,group.id);
  const [updated]=await c.q("SELECT * FROM community_gig_responses WHERE id=$1",[response.id]);
  return shapeCommunityGigResponse(updated,c.u,c.q);
});
route("post","/community-gigs/:gigId/complete","CompleteCommunityGig",async c=>{
  const {gig,group}=await loadVisibleCommunityGig(c.p.gigId,c.u,c.q);
  assert(group.membership==="member",403,"Join the community to update this opportunity");
  assert(gig.state==="matched",409,"Only a matched opportunity can be marked complete");
  const [updated]=await c.q(`UPDATE community_gigs SET state='completed' WHERE id=$1 AND state='matched'
    AND (author_id=$2 OR EXISTS(SELECT 1 FROM community_gig_responses r WHERE r.gig_id=$1 AND r.user_id=$2 AND r.state='accepted'))
    RETURNING *`,[gig.id,c.u]);
  assert(updated,403,"Only a participant can mark this opportunity complete");
  await communityGigImpact(c,group.id);
  return shapeCommunityGig(updated,c.u,c.q);
});
route("post","/community-gigs/:gigId/close","CloseCommunityGig",async c=>{
  const {gig,group}=await loadVisibleCommunityGig(c.p.gigId,c.u,c.q);
  assert(group.membership==="member",403,"Join the community to update this opportunity");
  assert(gig.author_id===c.u,403,"Only the listing author can close it");
  const [closed]=await c.q("UPDATE community_gigs SET state='closed' WHERE id=$1 AND state='open' RETURNING *",[gig.id]);
  assert(closed,409,"Only an open listing can be closed");
  await communityGigImpact(c,group.id);
  return shapeCommunityGig(closed,c.u,c.q);
});
route("get","/channels","ListChannels",async c=>{
  const rows=await c.q(`SELECT c.id FROM channels c WHERE ($2::text IS NULL OR name ILIKE $2) AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id=$1 AND target_id=c.owner_id) OR (target_id=$1 AND user_id=c.owner_id)) ORDER BY created_at DESC LIMIT 100`,[c.u,c.s.q?`%${c.s.q}%`:null]);return Promise.all(rows.map(r=>channel(r.id,c.u,c.q)));
});
route("post","/channels","CreateChannel",async c=>{
  const id=uuid();await c.q("INSERT INTO channels (id,owner_id,name,description) VALUES ($1,$2,$3,$4)",[id,c.u,c.b.name,c.b.description]);return channel(id,c.u,c.q);
},201);
route("post","/channels/:channelId/follow","ToggleChannelFollow",async c=>{
  await channelAccess(c.p.channelId,c.u,c.q);const rows=await c.q("DELETE FROM channel_followers WHERE channel_id=$1 AND user_id=$2 RETURNING *",[c.p.channelId,c.u]);
  if(!rows.length)await c.q("INSERT INTO channel_followers (channel_id,user_id) VALUES ($1,$2)",[c.p.channelId,c.u]);
  return {membership:rows.length?"none":"followed",memberCount:(await channel(c.p.channelId,c.u,c.q)).subscriberCount};
});
route("get","/channels/:channelId/updates","ListChannelUpdates",async c=>{await channelAccess(c.p.channelId,c.u,c.q);return (await c.q("SELECT * FROM channel_updates WHERE channel_id=$1 ORDER BY created_at DESC LIMIT 100",[c.p.channelId])).map(updateShape);});
route("post","/channels/:channelId/updates","PublishChannelUpdate",async c=>{
  await channelAccess(c.p.channelId,c.u,c.q,true);const [r]=await c.q("INSERT INTO channel_updates (id,channel_id,content) VALUES ($1,$2,$3) RETURNING *",[uuid(),c.p.channelId,c.b.content]);
  for(const follower of await c.q("SELECT user_id FROM channel_followers WHERE channel_id=$1",[c.p.channelId]))if(!await blocked(c.u,follower.user_id,c.q)){await notify(c.q,follower.user_id,c.u,"channel","Channel update","A channel you follow published an update.");c.impact.add(follower.user_id);}
  return updateShape(r);
},201);
route("post","/channels/:channelId/updates/:updateId/pin","TogglePinnedUpdate",async c=>{
  await channelAccess(c.p.channelId,c.u,c.q,true);const [old]=await c.q("SELECT * FROM channel_updates WHERE id=$1 AND channel_id=$2",[c.p.updateId,c.p.channelId]);assert(old);
  await c.q("UPDATE channel_updates SET pinned=false WHERE channel_id=$1",[c.p.channelId]);const [r]=await c.q("UPDATE channel_updates SET pinned=$1 WHERE id=$2 RETURNING *",[!old.pinned,old.id]);return updateShape(r);
});
route("get","/statuses","ListStatuses",async c=>{
  const rows=await c.q(`SELECT s.* FROM statuses s
    WHERE s.expires_at>now()
      AND (s.author_id=$1 OR
        EXISTS(SELECT 1 FROM chat_members mine
          JOIN chat_members other ON other.chat_id=mine.chat_id
          JOIN chats c ON c.id=mine.chat_id
          WHERE mine.user_id=$1 AND other.user_id=s.author_id AND c.type='private')
        OR (EXISTS(SELECT 1 FROM follows f WHERE f.user_id=$1 AND f.target_id=s.author_id)
          AND EXISTS(SELECT 1 FROM follows f WHERE f.user_id=s.author_id AND f.target_id=$1)))
    ORDER BY s.created_at DESC LIMIT 100`,[c.u]);const result=[];
  for(const r of rows){if(r.author_id!==c.u&&!await contacts(c.u,r.author_id,c.q))continue;const [u]=await c.q("SELECT * FROM users WHERE id=$1",[r.author_id]);if(await canDiscover(c.u,u,c.q))result.push({id:r.id,author:await summary(r.author_id,c.u,c.q),content:r.content,backgroundStyle:r.background_style??"midnight",createdAt:r.created_at,expiresAt:r.expires_at,media:await mediaShape(r.media_id,c.q)});}return result;
});
route("post","/statuses","CreateStatus",async c=>{
  const media=await claimMedia(c.b.mediaId,c.u,"status",null,c.q),backgroundStyle=c.b.backgroundStyle??"midnight";
  const [r]=await c.q("INSERT INTO statuses (id,author_id,content,media_id,background_style,expires_at) VALUES ($1,$2,$3,$4,$5,now()+interval '24 hours') RETURNING *",[uuid(),c.u,c.b.content,media?.id??null,backgroundStyle]);return {id:r.id,author:await summary(c.u,c.u,c.q),content:r.content,backgroundStyle:r.background_style,createdAt:r.created_at,expiresAt:r.expires_at,media:await mediaShape(r.media_id,c.q)};
},201);
async function overview(c:Context){
  const chats=await c.q(`SELECT c.id FROM chats c JOIN chat_members m ON m.chat_id=c.id WHERE m.user_id=$1 AND c.type='private' AND NOT EXISTS(SELECT 1 FROM chat_members other JOIN blocks b ON (b.user_id=$1 AND b.target_id=other.user_id) OR (b.target_id=$1 AND b.user_id=other.user_id) WHERE other.chat_id=c.id)`,[c.u]);
  let unread=0,received=0,replied=0;for(const r of chats){
    if((await conversation(r.id,c.u,c.q)).unreadCount)unread++;
    const [stats]=await c.q(`SELECT EXISTS(SELECT 1 FROM messages WHERE chat_id=$1 AND sender_id<>$2) AS received,
      EXISTS(SELECT 1 FROM messages sent JOIN messages incoming ON incoming.chat_id=sent.chat_id AND incoming.created_at<sent.created_at
        WHERE sent.chat_id=$1 AND sent.sender_id=$2 AND incoming.sender_id<>$2) AS sent`,[r.id,c.u]);if(stats.received){received++;if(stats.sent)replied++;}
  }
  const [u]=await c.q("SELECT is_open FROM users WHERE id=$1",[c.u]);return {isOpen:u.is_open,unreadCustomerChats:unread,totalCustomers:chats.length,responseRate:received?Math.round(replied/received*100):0};
}
function shopCurrency(value:string) {
  const currency=value.toUpperCase();
  assert(/^[A-Z]{3}$/.test(currency),400,"Use a three-letter currency code");
  try { new Intl.NumberFormat("en",{style:"currency",currency}).format(0); }
  catch { throw new HttpError(400,"Unsupported currency code"); }
  return currency;
}
function productResult(r:Row) {
  return {
    id:r.id,sellerId:r.seller_id,sellerName:r.seller_name,sellerUsername:r.seller_username,
    // Legacy products attached to a private storefront follow its publication state.
    isPublished:r.is_published && (r.shop_published !== false),
    title:r.title,description:r.description,category:r.category,priceMinor:r.price_minor,
    currency:r.currency,inventory:r.inventory,createdAt:r.created_at,
    imageMedia:r.image_media_id&&r.image_name?{
      id:r.image_media_id,url:`/api/storage/media/${r.image_media_id}`,name:r.image_name,
      contentType:r.image_type,size:Number(r.image_size),
    }:null,
  };
}
async function shopProductShape(id:string,q:Query=query) {
  const [r]=await q(`SELECT p.*,s.is_published AS shop_published,u.name AS seller_name,u.username AS seller_username,
      m.name AS image_name,m.content_type AS image_type,m.size AS image_size
    FROM shop_products p JOIN users u ON u.id=p.seller_id LEFT JOIN shop_stores s ON s.id=p.shop_id
    LEFT JOIN media_uploads m ON m.id=p.image_media_id AND m.ready=true WHERE p.id=$1`,[id]);
  assert(r,404,"Product not found");
  return productResult(r);
}
async function shopOrderShape(r:Row,q:Query=query) {
  const items=await q(`SELECT product_id AS "productId",title,"unit_price_minor" AS "unitPriceMinor",quantity
    FROM shop_order_items WHERE order_id=$1 ORDER BY id`,[r.id]);
  return {
    id:r.id,buyerId:r.buyer_id,buyerName:r.buyer_name,sellerId:r.seller_id,sellerName:r.seller_name,
    status:r.status,paymentStatus:r.payment_status,buyerNote:r.buyer_note,totalMinor:r.total_minor,
    currency:r.currency,createdAt:r.created_at,updatedAt:r.updated_at,items,
  };
}
route("get","/shop/products","ListShopProducts",async c=>{
  const mine=c.s.scope==="mine";
  const term=c.s.q?`%${c.s.q.replace(/[%_\\]/g,"\\$&")}%`:null;
  const rows=await c.q(`SELECT p.*,s.is_published AS shop_published,u.name AS seller_name,u.username AS seller_username,
      m.name AS image_name,m.content_type AS image_type,m.size AS image_size
    FROM shop_products p JOIN users u ON u.id=p.seller_id LEFT JOIN shop_stores s ON s.id=p.shop_id
    LEFT JOIN media_uploads m ON m.id=p.image_media_id AND m.ready=true
    WHERE (($1::boolean AND p.seller_id=$2) OR (NOT $1::boolean AND p.is_published=true AND (s.id IS NULL OR s.is_published)))
      AND ($3::text IS NULL OR p.seller_id=$3)
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE
        (b.user_id=$2 AND b.target_id=p.seller_id) OR (b.target_id=$2 AND b.user_id=p.seller_id))
      AND ($4::text IS NULL OR p.title ILIKE $4 OR p.description ILIKE $4 OR p.category ILIKE $4 OR u.name ILIKE $4 OR u.username ILIKE $4)
    ORDER BY p.created_at DESC LIMIT 100`,[mine,c.u,c.s.sellerId??null,term]);
  return rows.map(productResult);
});
route("post","/shop/products","CreateShopProduct",async c=>{
  const currency=shopCurrency(c.b.currency);
  assert(Number.isSafeInteger(c.b.priceMinor)&&c.b.priceMinor>0,400,"Enter a valid product price");
  const image=await claimMedia(c.b.imageMediaId,c.u,"product",null,c.q);
  const id=uuid();
  await c.q(`INSERT INTO shop_products
    (id,seller_id,title,description,category,price_minor,currency,inventory,image_media_id,is_published)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
  [id,c.u,c.b.title.trim(),c.b.description?.trim()??"",c.b.category.trim(),c.b.priceMinor,currency,c.b.inventory,image?.id??null,c.b.isPublished??true]);
  return shopProductShape(id,c.q);
},201);
route("patch","/shop/products/:productId","UpdateShopProduct",async c=>{
  const [current]=await c.q("SELECT * FROM shop_products WHERE id=$1 AND seller_id=$2 FOR UPDATE",[c.p.productId,c.u]);
  assert(current,404,"Product not found");
  assert(!current.shop_id,409,"Manage storefront products in the updated Seller Center");
  const hasImage=Object.prototype.hasOwnProperty.call(c.b,"imageMediaId");
  const image=hasImage&&c.b.imageMediaId?await claimMedia(c.b.imageMediaId,c.u,"product",null,c.q):null;
  const currency=c.b.currency?shopCurrency(c.b.currency):current.currency;
  const priceMinor=c.b.priceMinor??current.price_minor;
  assert(Number.isSafeInteger(priceMinor)&&priceMinor>0,400,"Enter a valid product price");
  await c.q(`UPDATE shop_products SET title=$1,description=$2,category=$3,price_minor=$4,currency=$5,
      inventory=$6,image_media_id=$7,is_published=$8,updated_at=now() WHERE id=$9 AND seller_id=$10`,
    [c.b.title?.trim()??current.title,c.b.description?.trim()??current.description,c.b.category?.trim()??current.category,
      priceMinor,currency,c.b.inventory??current.inventory,hasImage?(image?.id??null):current.image_media_id,
      c.b.isPublished??current.is_published,c.p.productId,c.u]);
  return shopProductShape(c.p.productId,c.q);
});
route("get","/shop/orders","ListShopOrders",async c=>{
  const scope=c.s.scope??"buyer";
  const column=scope==="seller"?"seller_id":"buyer_id";
  const rows=await c.q(`SELECT o.*,b.name AS buyer_name,s.name AS seller_name FROM shop_orders o
    JOIN users b ON b.id=o.buyer_id JOIN users s ON s.id=o.seller_id
    WHERE o.${column}=$1 ORDER BY o.created_at DESC LIMIT 50`,[c.u]);
  return Promise.all(rows.map(r=>shopOrderShape(r,c.q)));
});
route("post","/shop/orders","PlaceShopOrder",async c=>{
  const quantities=new Map<string,number>();
  for(const line of c.b.items)quantities.set(line.productId,(quantities.get(line.productId)??0)+line.quantity);
  assert(quantities.size>0&&quantities.size<=20&&[...quantities.values()].every(n=>n<=99),400,"Choose up to 20 products with quantities under 100");
  const ids=[...quantities.keys()];
  const products=await c.q("SELECT * FROM shop_products WHERE id=ANY($1::text[]) FOR UPDATE",[ids]);
  assert(products.length===ids.length,409,"One or more products are no longer available");
  assert(products.every(p=>!p.shop_id),409,"Use the updated shop checkout for storefront products");
  assert(products.every(p=>p.is_published),409,"One or more products are no longer available");
  const sellerIds=new Set(products.map(p=>p.seller_id)),currencies=new Set(products.map(p=>p.currency));
  assert(sellerIds.size===1,400,"Place a separate order for each seller");
  const [sellerId]=[...sellerIds];assert(sellerId!==c.u,400,"You can't order from your own shop");
  assert(currencies.size===1,400,"A single order must use one currency");
  let total=0;
  for(const p of products){const quantity=quantities.get(p.id)!;assert(p.inventory>=quantity,409,`${p.title} is out of stock`);total+=p.price_minor*quantity;}
  assert(Number.isSafeInteger(total)&&total>0,400,"Order total is too large");
  const orderId=uuid(),currency=products[0].currency;
  await c.q(`INSERT INTO shop_orders (id,buyer_id,seller_id,status,payment_status,buyer_note,total_minor,currency)
    VALUES ($1,$2,$3,'pending','awaiting_manual',$4,$5,$6)`,
  [orderId,c.u,sellerId,c.b.buyerNote?.trim()??"",total,currency]);
  for(const p of products){
    const quantity=quantities.get(p.id)!;
    const [stock]=await c.q("UPDATE shop_products SET inventory=inventory-$1,updated_at=now() WHERE id=$2 AND inventory >= $1 RETURNING id",[quantity,p.id]);
    assert(stock,409,`${p.title} just sold out`);
    await c.q(`INSERT INTO shop_order_items (id,order_id,product_id,title,unit_price_minor,quantity)
      VALUES ($1,$2,$3,$4,$5,$6)`,[uuid(),orderId,p.id,p.title,p.price_minor,quantity]);
  }
  c.impact.add(sellerId);
  const [r]=await c.q(`SELECT o.*,b.name AS buyer_name,s.name AS seller_name FROM shop_orders o
    JOIN users b ON b.id=o.buyer_id JOIN users s ON s.id=o.seller_id WHERE o.id=$1`,[orderId]);
  return shopOrderShape(r,c.q);
},201);
route("patch","/shop/orders/:orderId","UpdateShopOrder",async c=>{
  const [order]=await c.q("SELECT * FROM shop_orders WHERE id=$1 FOR UPDATE",[c.p.orderId]);
  assert(order,404,"Order not found");assert(order.seller_id===c.u,403,"Only this seller can update the order");
  assert(!order.idempotency_key,409,"Manage this order in the updated Seller Center");
  const nextStatus=c.b.status??order.status,nextPayment=c.b.paymentStatus??order.payment_status;
  if(c.b.status&&c.b.status!==order.status){
    const allowed:Record<string,string[]>={pending:["confirmed","cancelled"],confirmed:["preparing","cancelled"],preparing:["completed","cancelled"],completed:[],cancelled:[]};
    assert((allowed[order.status]??[]).includes(c.b.status),409,"That order status change isn't allowed");
  }
  if(c.b.paymentStatus){
    assert(c.b.paymentStatus==="manual_confirmed"&&order.payment_status==="awaiting_manual",409,"Manual payment can only be recorded once");
    assert(nextStatus!=="cancelled",409,"Cancelled orders can't be marked as paid");
  }
  if(c.b.status==="cancelled"){
    assert(order.status!=="cancelled",409,"This order is already cancelled");
    assert(order.payment_status==="awaiting_manual",409,"Resolve the manually received payment before cancelling this order");
    await c.q(`UPDATE shop_products p SET inventory=p.inventory+i.quantity,updated_at=now()
      FROM shop_order_items i WHERE i.order_id=$1 AND p.id=i.product_id`,[order.id]);
  }
  await c.q("UPDATE shop_orders SET status=$1,payment_status=$2,updated_at=now() WHERE id=$3",[nextStatus,nextPayment,order.id]);
  c.impact.add(order.buyer_id);
  const [updated]=await c.q(`SELECT o.*,b.name AS buyer_name,s.name AS seller_name FROM shop_orders o
    JOIN users b ON b.id=o.buyer_id JOIN users s ON s.id=o.seller_id WHERE o.id=$1`,[order.id]);
  return shopOrderShape(updated,c.q);
});
route("get","/business/overview","GetBusinessOverview",overview);
route("patch","/business/status","UpdateBusinessStatus",async c=>{await c.q("UPDATE users SET is_open=$1 WHERE id=$2",[c.b.isOpen,c.u]);return overview(c);});
route("get","/business/quick-replies","ListQuickReplies",async c=>c.q("SELECT id,label,content FROM quick_replies WHERE user_id=$1 ORDER BY label LIMIT 200",[c.u]));
route("post","/business/quick-replies","CreateQuickReply",async c=>(await c.q("INSERT INTO quick_replies (id,user_id,label,content) VALUES ($1,$2,$3,$4) RETURNING id,label,content",[uuid(),c.u,c.b.label,c.b.content]))[0],201);
route("get","/notifications","ListNotifications",async c=>(await c.q(`SELECT n.* FROM notifications n WHERE user_id=$1 AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id=$1 AND target_id=n.actor_id) OR (target_id=$1 AND user_id=n.actor_id)) ORDER BY created_at DESC LIMIT 100`,[c.u])).map(r=>({id:r.id,type:r.type,title:r.title,body:r.body,read:r.read,createdAt:r.created_at})));
route("post","/notifications/:notificationId/read","MarkNotificationRead",async c=>{assert((await c.q("UPDATE notifications SET read=true WHERE id=$1 AND user_id=$2 RETURNING id",[c.p.notificationId,c.u])).length);return {success:true};});

// Internal mail stores only public identity keys, routing metadata, and signed ciphertext envelopes.
// Subject and body are encrypted by the sender's device before any request reaches this router.
function mailAccount(c:Context,key?:Row) {
  const username=typeof c.user.username==="string"?c.user.username:null;
  return {
    address:username?`${username}@vastmind.com`:null,
    keyReady:Boolean(key),
    encryptionPublicKey:key?.encryption_public_key??null,
    signingPublicKey:key?.signing_public_key??null,
  };
}
function mailContact(row:Row) {
  return {
    userId:row.contact_id,
    name:row.contact_name,
    username:row.contact_username,
    address:`${row.contact_username}@vastmind.com`,
    avatarUrl:row.contact_avatar_url??null,
    encryptionPublicKey:row.contact_encryption_public_key,
    signingPublicKey:row.contact_signing_public_key,
  };
}
function mailMessageShape(row:Row) {
  return {
    id:row.message_id,
    threadId:row.thread_id,
    senderId:row.sender_id,
    senderName:row.sender_name,
    senderUsername:row.sender_username,
    senderSigningPublicKey:row.sender_signing_public_key,
    createdAt:row.message_created_at,
    envelope:{
      encapsulatedSecret:row.encapsulated_secret,
      ciphertext:row.ciphertext,
      signature:row.signature,
    },
  };
}
function mailThreadShape(row:Row) {
  const latest=row.last_message_id?mailMessageShape({
    message_id:row.last_message_id,
    thread_id:row.id,
    sender_id:row.last_sender_id,
    sender_name:row.last_sender_name,
    sender_username:row.last_sender_username,
    sender_signing_public_key:row.last_sender_signing_public_key,
    message_created_at:row.last_message_created_at,
    encapsulated_secret:row.last_encapsulated_secret,
    ciphertext:row.last_ciphertext,
    signature:row.last_signature,
  }):null;
  return {
    id:row.id,
    contact:mailContact(row),
    createdAt:row.thread_created_at,
    updatedAt:row.thread_updated_at,
    unreadCount:Number(row.unread_count??0),
    archived:Boolean(row.archived),
    lastMessage:latest,
  };
}
async function mailThreadQuery(q:Query,threadId:string,userId:string) {
  const rows=await q(`SELECT t.id,t.created_at AS thread_created_at,t.updated_at AS thread_updated_at,
      (mine.archived_at IS NOT NULL) AS archived,
      other.user_id AS contact_id,u.name AS contact_name,u.username AS contact_username,u.avatar_url AS contact_avatar_url,
      contact_key.encryption_public_key AS contact_encryption_public_key,
      contact_key.signing_public_key AS contact_signing_public_key,
      (SELECT COUNT(*)::int FROM mail_messages unread
        WHERE unread.thread_id=t.id AND unread.sender_id<>$2
          AND unread.created_at>COALESCE(mine.last_read_at,'epoch'::timestamptz)) AS unread_count,
      latest.id AS last_message_id,latest.sender_id AS last_sender_id,latest.sender_name AS last_sender_name,
      latest.sender_username AS last_sender_username,latest.sender_signing_public_key AS last_sender_signing_public_key,
      latest.created_at AS last_message_created_at,latest.encapsulated_secret AS last_encapsulated_secret,
      latest.ciphertext AS last_ciphertext,latest.signature AS last_signature
    FROM mail_threads t
    JOIN mail_members mine ON mine.thread_id=t.id AND mine.user_id=$2
    JOIN mail_members other ON other.thread_id=t.id AND other.user_id<>$2
    JOIN users u ON u.id=other.user_id
    JOIN mail_keys contact_key ON contact_key.user_id=u.id
    LEFT JOIN LATERAL (
      SELECT m.id,m.sender_id,sender.name AS sender_name,sender.username AS sender_username,
        sender_key.signing_public_key AS sender_signing_public_key,m.created_at,
        envelope.encapsulated_secret,envelope.ciphertext,envelope.signature
      FROM mail_messages m
      JOIN users sender ON sender.id=m.sender_id
      JOIN mail_keys sender_key ON sender_key.user_id=m.sender_id
      JOIN mail_envelopes envelope ON envelope.message_id=m.id AND envelope.recipient_id=$2
      WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1
    ) latest ON true
    WHERE t.id=$1 LIMIT 1`,[threadId,userId]);
  return rows[0]?mailThreadShape(rows[0]):null;
}

route("get","/mail/account","GetMailAccount",async c=>{
  const [key]=await c.q("SELECT encryption_public_key,signing_public_key FROM mail_keys WHERE user_id=$1",[c.u]);
  return mailAccount(c,key);
});
route("put","/mail/keys","RegisterMailKeys",async c=>{
  const [existing]=await c.q("SELECT encryption_public_key,signing_public_key FROM mail_keys WHERE user_id=$1",[c.u]);
  if(existing) {
    assert(existing.encryption_public_key===c.b.encryptionPublicKey&&existing.signing_public_key===c.b.signingPublicKey,409,"This recovery phrase does not match the mail identity already registered to this account.");
    return mailAccount(c,existing);
  }
  await c.q(`INSERT INTO mail_keys (user_id,encryption_public_key,signing_public_key)
    VALUES ($1,$2,$3) ON CONFLICT (user_id) DO NOTHING`,[c.u,c.b.encryptionPublicKey,c.b.signingPublicKey]);
  const [registered]=await c.q("SELECT encryption_public_key,signing_public_key FROM mail_keys WHERE user_id=$1",[c.u]);
  assert(registered?.encryption_public_key===c.b.encryptionPublicKey&&registered?.signing_public_key===c.b.signingPublicKey,409,"This account already has a different mail identity. Restore it with its original recovery phrase.");
  return mailAccount(c,registered);
});
route("get","/mail/recipients","SearchMailRecipients",async c=>{
  const term=String(c.s.q).trim().toLowerCase().replace(/[\\%_]/g,char=>`\\${char}`);
  assert(term.length>=2,400,"Search for at least two characters.");
  const candidates=await c.q(`SELECT u.id,u.name,u.username,u.avatar_url,k.encryption_public_key,k.signing_public_key
    FROM users u JOIN mail_keys k ON k.user_id=u.id
    WHERE u.id<>$1 AND u.username IS NOT NULL
      AND (lower(u.username) LIKE $2 OR lower(u.name) LIKE $2)
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE
        (b.user_id=$1 AND b.target_id=u.id) OR (b.user_id=u.id AND b.target_id=$1))
    ORDER BY lower(u.name),lower(u.username) LIMIT 30`,[c.u,`%${term}%`]);
  const visible=[];
  for(const candidate of candidates) {
    try { await canMessage(c.u,candidate.id,c.q); }
    catch(error) {
      if(error instanceof HttpError&&error.status===403)continue;
      throw error;
    }
    visible.push({
      userId:candidate.id,name:candidate.name,username:candidate.username,
      address:`${candidate.username}@vastmind.com`,avatarUrl:candidate.avatar_url??null,
      encryptionPublicKey:candidate.encryption_public_key,signingPublicKey:candidate.signing_public_key,
    });
  }
  return visible;
});
route("get","/mail/threads","ListMailThreads",async c=>{
  const box=c.s.box??"inbox";
  const rows=await c.q(`SELECT t.id,t.created_at AS thread_created_at,t.updated_at AS thread_updated_at,
      (mine.archived_at IS NOT NULL) AS archived,
      other.user_id AS contact_id,u.name AS contact_name,u.username AS contact_username,u.avatar_url AS contact_avatar_url,
      contact_key.encryption_public_key AS contact_encryption_public_key,
      contact_key.signing_public_key AS contact_signing_public_key,
      (SELECT COUNT(*)::int FROM mail_messages unread
        WHERE unread.thread_id=t.id AND unread.sender_id<>$1
          AND unread.created_at>COALESCE(mine.last_read_at,'epoch'::timestamptz)) AS unread_count,
      latest.id AS last_message_id,latest.sender_id AS last_sender_id,latest.sender_name AS last_sender_name,
      latest.sender_username AS last_sender_username,latest.sender_signing_public_key AS last_sender_signing_public_key,
      latest.created_at AS last_message_created_at,latest.encapsulated_secret AS last_encapsulated_secret,
      latest.ciphertext AS last_ciphertext,latest.signature AS last_signature
    FROM mail_members mine
    JOIN mail_threads t ON t.id=mine.thread_id
    JOIN mail_members other ON other.thread_id=t.id AND other.user_id<>$1
    JOIN users u ON u.id=other.user_id
    JOIN mail_keys contact_key ON contact_key.user_id=u.id
    LEFT JOIN LATERAL (
      SELECT m.id,m.sender_id,sender.name AS sender_name,sender.username AS sender_username,
        sender_key.signing_public_key AS sender_signing_public_key,m.created_at,
        envelope.encapsulated_secret,envelope.ciphertext,envelope.signature
      FROM mail_messages m
      JOIN users sender ON sender.id=m.sender_id
      JOIN mail_keys sender_key ON sender_key.user_id=m.sender_id
      JOIN mail_envelopes envelope ON envelope.message_id=m.id AND envelope.recipient_id=$1
      WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1
    ) latest ON true
    WHERE mine.user_id=$1 AND (
      ($2='inbox' AND mine.archived_at IS NULL) OR
      ($2='archived' AND mine.archived_at IS NOT NULL) OR
      ($2='sent' AND EXISTS (SELECT 1 FROM mail_messages sent WHERE sent.thread_id=t.id AND sent.sender_id=$1))
    )
    ORDER BY COALESCE(latest.created_at,t.updated_at) DESC LIMIT 200`,[c.u,box]);
  return rows.map(mailThreadShape);
});
route("post","/mail/threads","CreateMailThread",async c=>{
  const address=String(c.b.address).trim().toLowerCase();
  const match=/^([a-z0-9._-]{3,80})@vastmind\.com$/.exec(address);
  assert(match,400,"Use an internal username@vastmind.com address.");
  const username=match[1];
  const [recipient]=await c.q(`SELECT u.id,u.username FROM users u JOIN mail_keys k ON k.user_id=u.id
    WHERE lower(u.username)=lower($1)`,[username]);
  assert(recipient,404,"No active VastMind mail account was found for that address.");
  assert(recipient.id!==c.u,400,"Choose another VastMind member for this conversation.");
  await canMessage(c.u,recipient.id,c.q);
  const [block]=await c.q("SELECT 1 FROM blocks WHERE (user_id=$1 AND target_id=$2) OR (user_id=$2 AND target_id=$1) LIMIT 1",[c.u,recipient.id]);
  assert(!block,403,"Mail cannot be started between these accounts.");
  const [ownKey]=await c.q("SELECT user_id FROM mail_keys WHERE user_id=$1",[c.u]);
  assert(ownKey,409,"Set up your recovery phrase before starting a mail conversation.");
  const members=[c.u,recipient.id].sort();
  const directKey=members.join(":");
  const [thread]=await c.q(`INSERT INTO mail_threads (id,direct_key) VALUES ($1,$2)
    ON CONFLICT (direct_key) DO UPDATE SET updated_at=mail_threads.updated_at RETURNING id`,[uuid(),directKey]);
  for(const member of members)await c.q("INSERT INTO mail_members (thread_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",[thread.id,member]);
  c.impact.add(recipient.id);
  const result=await mailThreadQuery(c.q,thread.id,c.u);
  assert(result,500,"Could not create the mail conversation.");
  return result;
},201);
route("get","/mail/threads/:threadId/messages","ListMailMessages",async c=>{
  const [membershipRow]=await c.q("SELECT last_read_at FROM mail_members WHERE thread_id=$1 AND user_id=$2",[c.p.threadId,c.u]);
  assert(membershipRow,404,"Mail thread not found.");
  const limit=Math.min(100,Math.max(1,Number(c.s.limit??40)));
  const before=c.s.before?new Date(c.s.before):null;
  const rows=await c.q(`SELECT m.id AS message_id,m.thread_id,m.sender_id,sender.name AS sender_name,
      sender.username AS sender_username,sender_key.signing_public_key AS sender_signing_public_key,
      m.created_at AS message_created_at,e.encapsulated_secret,e.ciphertext,e.signature
    FROM mail_messages m
    JOIN users sender ON sender.id=m.sender_id
    JOIN mail_keys sender_key ON sender_key.user_id=m.sender_id
    JOIN mail_envelopes e ON e.message_id=m.id AND e.recipient_id=$2
    WHERE m.thread_id=$1 AND ($3::timestamptz IS NULL OR m.created_at<$3)
    ORDER BY m.created_at DESC LIMIT $4`,[c.p.threadId,c.u,before,limit+1]);
  const hasMore=rows.length>limit;
  const selected=rows.slice(0,limit);
  const items=selected.reverse().map(mailMessageShape);
  return {items,nextBefore:hasMore?items[0]?.createdAt??null:null};
});
route("post","/mail/threads/:threadId/messages","SendMailMessage",async c=>{
  const members=await c.q(`SELECT mm.user_id,k.encryption_public_key FROM mail_members mm
    LEFT JOIN mail_keys k ON k.user_id=mm.user_id WHERE mm.thread_id=$1 ORDER BY mm.user_id`,[c.p.threadId]);
  assert(members.length===2&&members.some(member=>member.user_id===c.u),404,"Mail thread not found.");
  const otherMember=members.find(member=>member.user_id!==c.u);
  assert(otherMember,404,"Mail thread not found.");
  await canMessage(c.u,otherMember.user_id,c.q);
  const block=await c.q("SELECT 1 FROM blocks WHERE (user_id=$1 AND target_id=$2) OR (user_id=$2 AND target_id=$1) LIMIT 1",[c.u,otherMember.user_id]);
  assert(!block,403,"Mail cannot be sent between these accounts.");
  assert(members.every(member=>member.encryption_public_key),409,"All thread members must activate internal mail first.");
  const recipientIds=c.b.envelopes.map((envelope:Row)=>envelope.recipientId);
  assert(new Set(recipientIds).size===members.length&&members.every(member=>recipientIds.includes(member.user_id)),400,"Provide one encrypted copy for each thread member.");
  const [senderKey]=await c.q("SELECT signing_public_key FROM mail_keys WHERE user_id=$1",[c.u]);
  assert(senderKey,409,"Your device does not have an active mail identity.");
  const messageId=uuid();
  for(const envelope of c.b.envelopes) {
    const valid=verifyMailEnvelopeSignature({
      threadId:c.p.threadId,senderId:c.u,recipientId:envelope.recipientId,
      senderSigningPublicKey:senderKey.signing_public_key,
      encapsulatedSecret:envelope.encapsulatedSecret,ciphertext:envelope.ciphertext,signature:envelope.signature,
    });
    assert(valid,400,"A message envelope failed sender verification.");
  }
  const [messageRow]=await c.q(`INSERT INTO mail_messages (id,thread_id,sender_id) VALUES ($1,$2,$3)
    RETURNING id,thread_id,sender_id,created_at`,[messageId,c.p.threadId,c.u]);
  for(const envelope of c.b.envelopes)await c.q(`INSERT INTO mail_envelopes
    (message_id,recipient_id,encapsulated_secret,ciphertext,signature) VALUES ($1,$2,$3,$4,$5)`,
    [messageId,envelope.recipientId,envelope.encapsulatedSecret,envelope.ciphertext,envelope.signature]);
  await c.q("UPDATE mail_threads SET updated_at=NOW() WHERE id=$1",[c.p.threadId]);
  for(const member of members)c.impact.add(member.user_id);
  const ownEnvelope=c.b.envelopes.find((envelope:Row)=>envelope.recipientId===c.u);
  assert(ownEnvelope,400,"A sender copy is required for the Sent mailbox.");
  return {
    id:messageRow.id,threadId:messageRow.thread_id,senderId:c.u,
    senderName:c.user.name,senderUsername:c.user.username,
    senderSigningPublicKey:senderKey.signing_public_key,createdAt:messageRow.created_at,
    envelope:{
      encapsulatedSecret:ownEnvelope.encapsulatedSecret,
      ciphertext:ownEnvelope.ciphertext,
      signature:ownEnvelope.signature,
    },
  };
},201);
route("patch","/mail/threads/:threadId/read","MarkMailThreadRead",async c=>{
  const rows=await c.q("UPDATE mail_members SET last_read_at=NOW() WHERE thread_id=$1 AND user_id=$2 RETURNING user_id",[c.p.threadId,c.u]);
  assert(rows.length,404,"Mail thread not found.");
  const others=await c.q("SELECT user_id FROM mail_members WHERE thread_id=$1 AND user_id<>$2",[c.p.threadId,c.u]);
  for(const other of others)c.impact.add(other.user_id);
  return {success:true};
});
route("patch","/mail/threads/:threadId/archive","SetMailThreadArchived",async c=>{
  const rows=await c.q(`UPDATE mail_members SET archived_at=CASE WHEN $3 THEN COALESCE(archived_at,NOW()) ELSE NULL END
    WHERE thread_id=$1 AND user_id=$2 RETURNING archived_at`,[c.p.threadId,c.u,c.b.archived]);
  assert(rows.length,404,"Mail thread not found.");
  return {archived:Boolean(rows[0].archived_at)};
});
export default router;
