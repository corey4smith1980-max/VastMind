import webpush from "web-push";
import { query } from "./social";
import { logger } from "./logger";

let configured=false;
export function pushConfiguration() {
  const publicKey=process.env.VAPID_PUBLIC_KEY;
  if(!process.env.VAPID_PRIVATE_KEY||!publicKey||!process.env.VAPID_SUBJECT)return {configured:false};
  try {
    if(!configured){webpush.setVapidDetails(process.env.VAPID_SUBJECT,publicKey,process.env.VAPID_PRIVATE_KEY);configured=true;}
    return {configured:true,publicKey};
  }catch{return {configured:false};}
}
/** Only browser-vendor endpoints are accepted, never arbitrary URLs from a client. */
export function validPushEndpoint(raw: string) {
  try {
    const url=new URL(raw),host=url.hostname;
    return url.protocol==="https:" && !url.port && !url.username && !url.password && (
      host==="fcm.googleapis.com" || host==="updates.push.services.mozilla.com" ||
      host.endsWith(".push.services.mozilla.com") || host==="web.push.apple.com" ||
      host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com")
    );
  }catch{return false;}
}
let busy=false;
export async function deliverPush() {
  if(busy||!pushConfiguration().configured)return;
  busy=true;
  try{
    // Atomic claim prevents duplicate sends from concurrent workers. Database
    // notifications remain authoritative even if a device's push service fails.
    const notes=await query(`UPDATE notifications SET push_sent_at=now() WHERE id IN
      (SELECT id FROM notifications WHERE push_sent_at IS NULL AND read=false
       AND created_at>now()-interval '5 minutes' ORDER BY created_at LIMIT 40 FOR UPDATE SKIP LOCKED) RETURNING *`);
    for(const n of notes) {
      const [blocked]=await query("SELECT 1 FROM blocks WHERE (user_id=$1 AND target_id=$2) OR (user_id=$2 AND target_id=$1)",[n.user_id,n.actor_id]);
      if(blocked)continue;
      const devices=await query("SELECT * FROM push_subscriptions WHERE user_id=$1",[n.user_id]);
      await Promise.all(devices.map(async d=>{
        if(!validPushEndpoint(d.endpoint))return;
        try {
          await webpush.sendNotification({endpoint:d.endpoint,keys:{p256dh:d.p256dh,auth:d.auth}},
            JSON.stringify({title:"NeuraCoreConnect",body:"You have new activity. Open the app to view it."}),
            {TTL:300,urgency:"normal",timeout:5000});
        }catch(error) {
          const status=(error as {statusCode?:number}).statusCode;
          if(status===404||status===410)await query("DELETE FROM push_subscriptions WHERE id=$1",[d.id]);
          else logger.warn({status},"Push notification delivery failed");
        }
      }));
    }
  }finally{busy=false;}
}
