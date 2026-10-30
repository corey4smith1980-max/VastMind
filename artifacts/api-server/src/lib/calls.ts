import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { assert, query, chatAllowed, blocked, canMessage } from "./social";

type Peer = { socketId: string; userId: string; name: string };
type Room = { roomId: string; scope: "chat" | "community"; id: string; title: string; video: boolean; peers: Map<string,Peer> };
const rooms = new Map<string,Room>();
const active = new Map<string,string>();
let joins:Promise<void>=Promise.resolve();
const key = z.string().min(1).max(160);

async function access(scope: string, id: string, userId: string) {
  if (scope === "chat") {
    const member=await chatAllowed(id,userId);
    if(member.type==="private")for(const other of await query("SELECT user_id FROM chat_members WHERE chat_id=$1 AND user_id<>$2",[id,userId]))await canMessage(userId,other.user_id);
    return;
  }
  assert(false,410,"Community voice rooms are no longer available");
}
function leave(io: Server,socket: Socket) {
  const roomId=active.get(socket.id);if(!roomId)return;
  const room=rooms.get(roomId);
  active.delete(socket.id);
  if(!room)return;
  room.peers.delete(socket.id);
  for(const peer of room.peers.values())io.to(peer.socketId).emit("call:peer-left",{roomId,socketId:socket.id});
  if(!room.peers.size)rooms.delete(roomId);
}
export function attachCalls(io: Server,socket: Socket) {
  let events=0,windowStart=Date.now();
  const limit=()=>{if(Date.now()-windowStart>10_000){events=0;windowStart=Date.now();}assert(++events<=150,429,"Calling rate limit reached");};
  socket.on("call:join",(raw,ack)=>{
    joins=joins.then(async()=>{
    try {
      limit();
      const input=z.object({scope:z.enum(["chat","community"]),id:key,video:z.boolean()}).parse(raw);
      const userId=socket.data.userId as string;
      await access(input.scope,input.id,userId);
      assert(!active.has(socket.id),409,"Leave the current call first");
      for(const room of rooms.values())assert(![...room.peers.values()].some(p=>p.userId===userId),409,"You are already in a call on another device");
      const roomId=`${input.scope}:${input.id}`;
      let room=rooms.get(roomId);
      assert(!room||room.peers.size<6,409,"This room is full (6 participants maximum)");
      if(room)for(const peer of room.peers.values())assert(!await blocked(userId,peer.userId),403,"This call is unavailable");
      const [item]=await query(input.scope==="chat"?"SELECT name FROM chats WHERE id=$1":"SELECT name FROM communities WHERE id=$1",[input.id]);
      room=rooms.get(roomId);
      if(room)for(const peer of room.peers.values())assert(!await blocked(userId,peer.userId),403,"This call is unavailable");
      if(!room){room={roomId,scope:input.scope,id:input.id,title:item?.name||"Private call",video:input.scope==="chat"&&input.video,peers:new Map()};rooms.set(roomId,room);}
      // Authorization awaits above can overlap: repeat capacity/identity checks before mutation.
      assert(socket.connected&&!active.has(socket.id)&&room.peers.size<6,409,"Call unavailable");
      // A departing last member can remove a room while authorization awaits.
      if(!rooms.has(roomId))rooms.set(roomId,room);
      assert(![...rooms.values()].some(r=>[...r.peers.values()].some(p=>p.userId===userId)),409,"Already in a call");
      const peers=[...room.peers.values()];
      const peer={socketId:socket.id,userId,name:socket.data.name as string};
      room.peers.set(socket.id,peer);active.set(socket.id,roomId);
      const iceServers: {urls:string|string[];username?:string;credential?:string}[]=[{urls:"stun:stun.l.google.com:19302"}];
      if(process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL)iceServers.push({urls:process.env.TURN_URL.split(","),username:process.env.TURN_USERNAME,credential:process.env.TURN_CREDENTIAL});
      if(typeof ack==="function")ack({roomId,scope:room.scope,id:room.id,title:room.title,video:room.video,peers,iceServers,relayConfigured:iceServers.length>1});
      for(const p of peers)io.to(p.socketId).emit("call:peer-joined",{roomId,peer});
      if(peers.length===0&&input.scope==="chat") {
        const members=await query("SELECT user_id FROM chat_members WHERE chat_id=$1 AND user_id<>$2",[input.id,userId]);
        for(const m of members)if(!await blocked(userId,m.user_id))io.to(`user:${m.user_id}`).emit("call:invite",{scope:"chat",id:input.id,title:room.title,video:room.video,caller:socket.data.name});
      }
    }catch(e){if(typeof ack==="function")ack({error:e instanceof Error?e.message:"Call unavailable"});}
    });
  });
  socket.on("call:signal",async(raw)=>{
    try {
      limit();
      const data=z.object({roomId:z.string().max(180),to:key,description:z.object({type:z.enum(["offer","answer"]),sdp:z.string().max(60_000)}).optional(),
        candidate:z.object({candidate:z.string().max(4096),sdpMid:z.string().nullable().optional(),sdpMLineIndex:z.number().int().nullable().optional(),usernameFragment:z.string().optional().nullable()}).optional()}).parse(raw);
      assert(Boolean(data.description)!==Boolean(data.candidate),400,"Invalid signal");
      const room=rooms.get(data.roomId);assert(room && active.get(socket.id)===data.roomId,403);
      const target=room!.peers.get(data.to);assert(target && target.socketId!==socket.id,403);
      await access(room!.scope,room!.id,socket.data.userId);
      await access(room!.scope,room!.id,target!.userId);
      assert(!await blocked(socket.data.userId,target!.userId),403);
      // Re-check after async authorization; a departing peer must not receive stale signals.
      assert(active.get(socket.id)===data.roomId && room!.peers.has(data.to),403);
      io.to(data.to).emit("call:signal",{roomId:data.roomId,from:socket.id,description:data.description,candidate:data.candidate});
    }catch{ /* Never forward unauthorized signalling or reveal participant details. */ }
  });
  socket.on("call:leave",()=>leave(io,socket));
  const watchdog=setInterval(async()=>{
    const room=rooms.get(active.get(socket.id)||"");if(!room)return;
    try{
      await access(room.scope,room.id,socket.data.userId);
      for(const p of room.peers.values())assert(!await blocked(socket.data.userId,p.userId),403);
    }catch{leave(io,socket);socket.emit("call:ended",{reason:"Call access changed"});}
  },15_000);
  socket.on("disconnect",()=>{clearInterval(watchdog);leave(io,socket);});
}
