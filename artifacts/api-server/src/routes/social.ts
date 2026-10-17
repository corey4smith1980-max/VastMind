import { Router } from "express";
import { getAuth } from "@clerk/express";
import rateLimit from "express-rate-limit";
import * as schemas from "@workspace/api-zod";
import { z } from "zod";
import { query, transaction, provision, profile, summary, blocked, canDiscover, canMessage, membership, chatAllowed, conversation, message, community, postAccess, post, channelAccess, channel, updateShape, notify, uuid, assert, HttpError, onlineUsers, toggleFollow, blockMember, type Query, type Row } from "../lib/social";
import { changed, evictChat, disconnectUser } from "../lib/realtime";
import { claimMedia, mediaShape } from "../lib/media";
import { pushConfiguration, validPushEndpoint } from "../lib/push";

const router=Router();
router.use(async(req,res,next)=>{
  const auth=getAuth(req);
  if(!auth.userId){res.status(401).json({error:"Authentication required"});return;}
  res.locals.user=await provision(auth.userId);
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
    const s=validate(registry[`${operation}QueryParams`],req.query) as any;
    for(const value of Object.values(s))assert(typeof value!=="string" || value.length<=200,400,"Query is too long");
    const b=validate(registry[`${operation}Body`],req.body) as any;
    if(b && typeof b==="object")for(const [key,value] of Object.entries(b))if(typeof value==="string" && !["bio","status"].includes(key))assert(value.trim().length>0,400,"Text must not be blank");
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
  if(c.b.username!==undefined)assert(/^[a-zA-Z0-9_]{3,32}$/.test(c.b.username),400,"Username must be 3–32 letters, numbers or underscores");
  if(c.b.avatarUrl!==undefined && c.b.avatarUrl!==null)assert(c.b.avatarUrl===c.user.avatar_url,400,"Avatar uploads are not available yet");
  const map:Record<string,string>={name:"name",username:"username",bio:"bio",status:"status",avatarUrl:"avatar_url"};
  for(const [key,col] of Object.entries(map))if(c.b[key]!==undefined)await c.q(`UPDATE users SET ${col}=$1 WHERE id=$2`,[c.b[key],c.u]);
  return profile((await c.q("SELECT * FROM users WHERE id=$1",[c.u]))[0]);
});
route("put","/me/privacy","UpdatePrivacySettings",async c=>{
  await c.q("UPDATE users SET allow_messages_from=$1,profile_visibility=$2,show_online_status=$3,show_last_seen=$4 WHERE id=$5",[c.b.allowMessagesFrom,c.b.profileVisibility,c.b.showOnlineStatus,c.b.showLastSeen,c.u]);
  disconnectUser(c.u);
  return c.b;
});
route("get","/users/search","SearchUsers",async c=>{
  const rows=await c.q("SELECT * FROM users WHERE id<>$1 AND (name ILIKE $2 OR username ILIKE $2) ORDER BY name LIMIT 60",[c.u,`%${c.s.q.replace(/[%_\\]/g,"\\$&")}%`]);
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
  const media=await claimMedia(c.b.mediaId,c.u,"chat",c.p.chatId,c.q);
  const type=media?(media.content_type.startsWith("image/")?"image":media.content_type.startsWith("video/")?"video":"voice"):"text";
  const [sent]=await c.q("INSERT INTO messages (id,chat_id,sender_id,content,reply_to_id,media_id,type) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",[uuid(),c.p.chatId,c.u,c.b.content,c.b.replyToId??null,media?.id??null,type]);
  await c.q("UPDATE chat_members SET last_read_at=$1 WHERE chat_id=$2 AND user_id=$3",[sent.created_at,c.p.chatId,c.u]);
  await chatImpact(c,c.p.chatId);
  for(const target of c.impact)await notify(c.q,target,c.u,"message","New message","You have a new message.");
  return message(sent,c.u,c.q);
},201);
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
  if(c.s.communityId){const x=await community(c.s.communityId,c.u,c.q);assert(!x.isPrivate||x.membership==="member",403,"Community membership required");}
  const rows=await c.q(`SELECT p.id FROM posts p LEFT JOIN communities co ON co.id=p.community_id WHERE
    ($2::text IS NULL OR p.community_id=$2) AND ($3::timestamptz IS NULL OR p.created_at<$3)
    AND ($4::text IS NULL
      OR to_tsvector('simple', p.content) @@ websearch_to_tsquery('simple', $4)
      OR p.content ILIKE $5)
    AND (co.id IS NULL OR co.is_private=false OR EXISTS(SELECT 1 FROM community_members WHERE community_id=co.id AND user_id=$1 AND state='member'))
    AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id=$1 AND target_id IN(p.author_id,co.owner_id)) OR (target_id=$1 AND user_id IN(p.author_id,co.owner_id)))
    ORDER BY p.created_at DESC LIMIT 40`,[c.u,c.s.communityId??null,c.s.before??null,c.s.q??null,c.s.q?`%${c.s.q.replace(/[%_\\]/g,"\\$&")}%`:null]);
  return Promise.all(rows.map(r=>post(r.id,c.u,c.q)));
});
route("post","/posts","CreatePost",async c=>{
  if(c.b.communityId){const co=await community(c.b.communityId,c.u,c.q);assert(co.membership==="member",403,"Join the community before posting");}
  assert(!c.b.pollOptions?.length || c.b.pollOptions.length>=2,400,"Polls require at least two options");
  if(c.b.pollOptions)assert(new Set(c.b.pollOptions.map((x:string)=>x.trim().toLowerCase())).size===c.b.pollOptions.length && c.b.pollOptions.every((x:string)=>x.trim()),400,"Poll options must be distinct and nonempty");
  const id=uuid();await c.q("INSERT INTO posts (id,author_id,community_id,content) VALUES ($1,$2,$3,$4)",[id,c.u,c.b.communityId??null,c.b.content]);
  for(const label of c.b.pollOptions??[])await c.q("INSERT INTO poll_options (id,post_id,label) VALUES ($1,$2,$3)",[uuid(),id,label]);
  await feedImpact(c,c.b.communityId??null);return post(id,c.u,c.q);
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
  const rows=await c.q("SELECT s.* FROM statuses s WHERE expires_at>now() ORDER BY created_at DESC LIMIT 100");const result=[];
  for(const r of rows){const [u]=await c.q("SELECT * FROM users WHERE id=$1",[r.author_id]);if(await canDiscover(c.u,u,c.q))result.push({id:r.id,author:await summary(r.author_id,c.u,c.q),content:r.content,createdAt:r.created_at,expiresAt:r.expires_at,media:await mediaShape(r.media_id,c.q)});}return result;
});
route("post","/statuses","CreateStatus",async c=>{
  const media=await claimMedia(c.b.mediaId,c.u,"status",null,c.q);
  const [r]=await c.q("INSERT INTO statuses (id,author_id,content,media_id,expires_at) VALUES ($1,$2,$3,$4,now()+interval '24 hours') RETURNING *",[uuid(),c.u,c.b.content,media?.id??null]);return {id:r.id,author:await summary(c.u,c.u,c.q),content:r.content,createdAt:r.created_at,expiresAt:r.expires_at,media:await mediaShape(r.media_id,c.q)};
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
route("get","/business/overview","GetBusinessOverview",overview);
route("patch","/business/status","UpdateBusinessStatus",async c=>{await c.q("UPDATE users SET is_open=$1 WHERE id=$2",[c.b.isOpen,c.u]);return overview(c);});
route("get","/business/quick-replies","ListQuickReplies",async c=>c.q("SELECT id,label,content FROM quick_replies WHERE user_id=$1 ORDER BY label LIMIT 200",[c.u]));
route("post","/business/quick-replies","CreateQuickReply",async c=>(await c.q("INSERT INTO quick_replies (id,user_id,label,content) VALUES ($1,$2,$3,$4) RETURNING id,label,content",[uuid(),c.u,c.b.label,c.b.content]))[0],201);
route("get","/notifications","ListNotifications",async c=>(await c.q(`SELECT n.* FROM notifications n WHERE user_id=$1 AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id=$1 AND target_id=n.actor_id) OR (target_id=$1 AND user_id=n.actor_id)) ORDER BY created_at DESC LIMIT 100`,[c.u])).map(r=>({id:r.id,type:r.type,title:r.title,body:r.body,read:r.read,createdAt:r.created_at})));
route("post","/notifications/:notificationId/read","MarkNotificationRead",async c=>{assert((await c.q("UPDATE notifications SET read=true WHERE id=$1 AND user_id=$2 RETURNING id",[c.p.notificationId,c.u])).length);return {success:true};});
export default router;
