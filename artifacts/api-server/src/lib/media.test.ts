import { test } from "node:test";
import strict from "node:assert/strict";
import { pool } from "@workspace/db";
import { matchesMediaType, claimMedia, mediaShape } from "./media";
import { validPushEndpoint } from "./push";
import { transaction, uuid, HttpError } from "./social";
import { RequestUploadUrlBody, SendMessageBody, CreateStatusBody } from "@workspace/api-zod";

test("media metadata, signatures and push endpoints reject unsafe input",()=>{
  strict.equal(matchesMediaType(Buffer.from("<svg onload=alert(1)>"),"image/png"),false);
  strict.equal(matchesMediaType(Buffer.from([137,80,78,71,13,10,26,10]),"image/png"),true);
  strict.equal(matchesMediaType(Buffer.from("GIF89a"),"image/gif"),true);
  strict.equal(matchesMediaType(Buffer.from("plain text"),"audio/mp4"),false);
  strict.equal(RequestUploadUrlBody.safeParse({name:"large.png",size:26214401,contentType:"image/png",purpose:"chat"}).success,false);
  strict.equal(RequestUploadUrlBody.safeParse({name:"x.png",size:-1,contentType:"image/png",purpose:"status"}).success,false);
  strict.equal(SendMessageBody.safeParse({content:"Photo",mediaId:uuid()}).success,true);
  strict.equal(CreateStatusBody.safeParse({content:"Story",mediaId:uuid()}).success,true);
  strict.equal(validPushEndpoint("https://fcm.googleapis.com/fcm/send/test"),true);
  for(const endpoint of ["http://localhost/x","https://127.0.0.1/x","https://fcm.googleapis.com.evil.test/x","https://evil.test/push","https://fcm.googleapis.com:8080/x","https://name:password@fcm.googleapis.com/x"])strict.equal(validPushEndpoint(endpoint),false);
});

test("verified uploads are owner-bound, conversation-bound and single-use",async()=>{
  const rollback=new Error("rollback fixtures");
  try{
    await transaction(async q=>{
      const owner=uuid(),outsider=uuid(),chat=uuid(),otherChat=uuid(),media=uuid();
      await q("INSERT INTO users(id,name,username) VALUES ($1,'Media owner',$1),($2,'Other member',$2)",[owner,outsider]);
      await q("INSERT INTO chats(id,type) VALUES ($1,'group'),($2,'group')",[chat,otherChat]);
      await q(`INSERT INTO media_uploads(id,owner_id,object_path,name,content_type,size,purpose,chat_id,ready)
        VALUES($1,$2,'/objects/sealed/test','photo.png','image/png','69','chat',$3,true)`,[media,owner,chat]);
      strict.equal((await mediaShape(media,q))?.contentType,"image/png");
      await strict.rejects(()=>claimMedia(media,outsider,"chat",chat,q),HttpError);
      await strict.rejects(()=>claimMedia(media,owner,"chat",otherChat,q),HttpError);
      await strict.rejects(()=>claimMedia(media,owner,"status",null,q),HttpError);
      strict.equal((await claimMedia(media,owner,"chat",chat,q))?.id,media);
      await strict.rejects(()=>claimMedia(media,owner,"chat",chat,q),HttpError);
      strict.equal(await claimMedia(undefined,owner,"chat",chat,q),null);
      throw rollback;
    });
  }catch(e){if(e!==rollback)throw e;}
  finally{await pool.end();}
});
