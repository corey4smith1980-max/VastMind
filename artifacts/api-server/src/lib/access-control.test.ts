import { test } from "node:test";
import strict from "node:assert/strict";
import { pool } from "@workspace/db";
import { transaction, uuid, membership, canMessage, chatAllowed, postAccess, blocked, canDiscover, HttpError, conversation, channel, contacts, summary, toggleFollow, blockMember } from "./social";
import { CreateChatBody, SendMessageBody, VoteOnPollBody, DecideCommunityRequestBody, CreateChatResponse, CreateChannelResponse } from "@workspace/api-zod";

test("generated input contracts reject invalid content",()=>{
  strict.equal(SendMessageBody.safeParse({content:""}).success,false);
  strict.equal(SendMessageBody.safeParse({content:"x".repeat(4001)}).success,false);
  strict.equal(CreateChatBody.safeParse({type:"private",memberIds:[]}).success,false);
  strict.equal(VoteOnPollBody.safeParse({}).success,false);
  strict.equal(DecideCommunityRequestBody.safeParse({approve:"yes"}).success,false);
});
test("relational authorization and privacy are enforced",async()=>{
  const rollback=new Error("rollback test fixtures");
  try {
    await transaction(async q=>{
      const a=uuid(),b=uuid(),outsider=uuid(),chat=uuid(),co=uuid(),p=uuid();
      for(const id of [a,b,outsider])await q("INSERT INTO users (id,name,username) VALUES ($1,'Access test',$1)",[id]);
      // A one-way follow is not a trusted contact; reciprocal follows are.
      await strict.rejects(() => toggleFollow(a, a, q), HttpError);
      strict.equal((await toggleFollow(a, outsider, q)).following, true);
      strict.equal(await contacts(a, outsider, q), false);
      strict.equal((await summary(outsider, a, q)).following, true);
      strict.equal((await toggleFollow(outsider, a, q)).following, true);
      strict.equal(await contacts(a, outsider, q), true);
      await q("UPDATE users SET allow_messages_from='contacts',profile_visibility='contacts',last_seen_at=now() WHERE id=$1", [outsider]);
      await canMessage(a, outsider, q);
      strict.equal(await canDiscover(a, (await q("SELECT * FROM users WHERE id=$1", [outsider]))[0], q), true);
      strict.ok((await summary(outsider, a, q)).lastSeenAt);
      await q("UPDATE users SET show_last_seen=false WHERE id=$1", [outsider]);
      strict.equal((await summary(outsider, a, q)).lastSeenAt, null);
      strict.equal((await toggleFollow(outsider, a, q)).following, false);
      strict.equal(await contacts(a, outsider, q), false);
      await strict.rejects(() => canMessage(a, outsider, q), HttpError);
      strict.equal((await summary(outsider, a, q)).username, "");
      await strict.rejects(() => toggleFollow(b, outsider, q), HttpError);
      await q("UPDATE users SET profile_visibility='everyone' WHERE id=$1", [outsider]);
      await toggleFollow(outsider, a, q);
      await blockMember(a, outsider, q);
      strict.equal((await q(
        "SELECT 1 FROM follows WHERE (user_id=$1 AND target_id=$2) OR (user_id=$2 AND target_id=$1)",
        [a, outsider],
      )).length, 0);
      await strict.rejects(() => toggleFollow(outsider, a, q), HttpError);
      await q("DELETE FROM blocks WHERE user_id=$1 AND target_id=$2", [a, outsider]);
      // PostgreSQL full-text matching works independently of substring order.
      const [search] = await q(`
        SELECT to_tsvector('simple', $1) @@ websearch_to_tsquery('simple', $2) AS matched`,
        ["world says hello", "hello world"],
      );
      strict.equal(search.matched, true);
      await q("INSERT INTO chats (id,type) VALUES ($1,'private')",[chat]);
      await q("INSERT INTO chat_members (chat_id,user_id,role) VALUES ($1,$2,'owner'),($1,$3,'member')",[chat,a,b]);
      CreateChatResponse.parse(await conversation(chat,a,q));
      await strict.rejects(()=>membership(chat,outsider,q),HttpError);
      await strict.rejects(()=>membership(chat,b,q,true),HttpError);
      await canMessage(a,b,q);
      await q("UPDATE users SET allow_messages_from='nobody',profile_visibility='nobody' WHERE id=$1",[b]);
      await strict.rejects(()=>canMessage(a,b,q),HttpError);
      strict.equal(await canDiscover(a,(await q("SELECT * FROM users WHERE id=$1",[b]))[0],q),false);
      await q("INSERT INTO blocks (user_id,target_id) VALUES ($1,$2)",[b,a]);
      strict.equal(await blocked(a,b,q),true);
      await strict.rejects(()=>chatAllowed(chat,a,q),HttpError);
      await q("INSERT INTO communities (id,owner_id,name,description,category,is_private) VALUES ($1,$2,'Test','Test','Test',true)",[co,a]);
      await q("INSERT INTO posts (id,author_id,community_id,content) VALUES ($1,$2,$3,'Private post')",[p,a,co]);
      await strict.rejects(()=>postAccess(p,outsider,q),HttpError);
      await q("INSERT INTO community_members (community_id,user_id) VALUES ($1,$2)",[co,outsider]);
      await strict.rejects(()=>postAccess(p,outsider,q),HttpError);
      const channelId=uuid();
      await q("INSERT INTO channels (id,owner_id,name,description) VALUES ($1,$2,'Test','Test')",[channelId,a]);
      CreateChannelResponse.parse(await channel(channelId,outsider,q));
      throw rollback;
    });
  } catch(e) {if(e!==rollback)throw e;}
  finally {await pool.end();}
});
