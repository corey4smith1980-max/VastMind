import type { Server as HttpServer, IncomingMessage } from "node:http";
import { Server } from "socket.io";
import { clerkClient } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { z } from "zod";
import { getClerkProxyHost } from "../middlewares/clerkProxyMiddleware";
import { query, chatAllowed, blocked, canDiscover, onlineUsers, provision } from "./social";
import { logger } from "./logger";

let io:Server|undefined;
export function changed(users:string[],entity:string,chatId?:string) {
  for(const id of new Set(users))io?.to(`user:${id}`).emit("data:changed",{entity,...(chatId?{chatId}:{})});
}
export function evictChat(userId:string,chatId:string) {io?.in(`user:${userId}`).socketsLeave(`chat:${chatId}`);}
export function disconnectUser(userId:string) {io?.in(`user:${userId}`).disconnectSockets(true);}
async function authenticate(req:IncomingMessage, bearer?:string) {
  const host=getClerkProxyHost(req)??"localhost";
  const headers=new Headers();
  for(const [k,v] of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(","):v);
  if(bearer)headers.set("authorization",`Bearer ${bearer}`);
  const state=await clerkClient.authenticateRequest(new Request(`https://${host}${req.url??"/api/socket.io"}`,{headers}),{
    publishableKey:publishableKeyFromHost(host,process.env.CLERK_PUBLISHABLE_KEY),
    acceptsToken:"session_token",
  });
  const auth=state.toAuth();
  if(!auth?.userId || !auth.sessionId)throw new Error("Unauthorized");
  const session=await clerkClient.sessions.getSession(auth.sessionId);
  if(session.status!=="active")throw new Error("Unauthorized");
  return {userId:auth.userId,sessionId:auth.sessionId};
}
async function presence(userId:string,online:boolean) {
  const [user]=await query("SELECT * FROM users WHERE id=$1",[userId]);
  if(!user?.show_online_status)return;
  const peers=await query(`
    SELECT DISTINCT b.user_id
    FROM chat_members a JOIN chat_members b ON b.chat_id=a.chat_id
    WHERE a.user_id=$1 AND b.user_id<>$1
    UNION
    SELECT user_id FROM follows WHERE target_id=$1`, [userId]);
  for(const p of peers)if(await canDiscover(p.user_id,user))io?.to(`user:${p.user_id}`).emit("presence",{userId,online});
}
export function attachRealtime(server:HttpServer) {
  const expoOrigin=process.env.REPLIT_EXPO_DEV_DOMAIN ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}` : undefined;
  io=new Server(server,{
    path:"/api/socket.io",maxHttpBufferSize:8192,
    cors:{credentials:true,origin:(origin,callback)=>callback(null,!!origin && origin===expoOrigin)},
    allowRequest:(req,callback)=>{
      const origin=req.headers.origin;
      const host=getClerkProxyHost(req);
      try{callback(null,!origin || origin===expoOrigin || new URL(origin).host===host);}catch{callback(null,false);}
    },
  });
  io.use(async(socket,next)=>{
    try{
      // Native/Expo Web sends a short-lived Clerk session token through Socket.IO
      // auth. It receives the same signature/session checks as browser cookies.
      const rawToken=socket.handshake.auth?.token;
      const bearer=rawToken==null ? undefined : z.string().min(1).max(8192).parse(rawToken);
      const auth=await authenticate(socket.request,bearer);
      const user=await provision(auth.userId);
      socket.data={...auth,name:user.name};
      next();
    }catch{next(new Error("Authentication required"));}
  });
  io.on("connection",socket=>{
    const userId=socket.data.userId as string;
    socket.join(`user:${userId}`);
    const count=onlineUsers.get(userId)??0;onlineUsers.set(userId,count+1);
    if(count===0)presence(userId,true).catch(()=>logger.warn("Presence update failed"));
    // Active session checks bound revocation exposure, even for idle listeners.
    const timer=setInterval(async()=>{
      try{const session=await clerkClient.sessions.getSession(socket.data.sessionId);if(session.status!=="active")socket.disconnect(true);}
      catch{socket.disconnect(true);}
    },30_000);
    // Reconnect periodically to renew cookie/Bearer authentication.
    const expiry=setTimeout(()=>socket.conn.close(),5*60_000);
    let windowStart=Date.now(),events=0;
    const permitted=()=>{if(Date.now()-windowStart>10_000){windowStart=Date.now();events=0;}return ++events<=30;};
    socket.on("chat:join",async(raw,ack)=>{
      try{
        if(!permitted())throw new Error();
        const {chatId}=z.object({chatId:z.string().min(1).max(160)}).parse(raw);
        await chatAllowed(chatId,userId);
        await socket.join(`chat:${chatId}`);
        if(typeof ack==="function")ack({success:true});
      }catch{if(typeof ack==="function")ack({error:"Conversation access denied"});}
    });
    socket.on("typing",async raw=>{
      try{
        if(!permitted())return;
        const {chatId,isTyping}=z.object({chatId:z.string().min(1).max(160),isTyping:z.boolean()}).parse(raw);
        await chatAllowed(chatId,userId);
        const [user]=await query("SELECT * FROM users WHERE id=$1",[userId]);
        const members=await query("SELECT user_id FROM chat_members WHERE chat_id=$1 AND user_id<>$2",[chatId,userId]);
        for(const member of members)if(!await blocked(userId,member.user_id) && await canDiscover(member.user_id,user)) {
          io?.to(`user:${member.user_id}`).emit("typing",{chatId,userId,name:user.name,isTyping});
        }
      }catch{/* Invalid or unauthorized socket payloads do not reach recipients. */}
    });
    socket.on("disconnect",()=>{
      clearInterval(timer);clearTimeout(expiry);
      const remaining=(onlineUsers.get(userId)??1)-1;
      if(remaining>0)onlineUsers.set(userId,remaining);
      else {
        onlineUsers.delete(userId);
        // Persist a last-seen instant only when the member's final socket closes.
        query("UPDATE users SET last_seen_at=now() WHERE id=$1", [userId])
          .then(() => presence(userId, false))
          .catch(() => logger.warn("Presence update failed"));
      }
    });
  });
  return io;
}
