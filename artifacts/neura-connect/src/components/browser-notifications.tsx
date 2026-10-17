"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { useListNotifications, getListNotificationsQueryKey, useGetPushConfig, savePushSubscription, removePushSubscription } from "@workspace/api-client-react";
import { basePath } from "@/lib/base";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const preferenceKey = (id: string) => `neura-browser-notifications:${id}`;

/** Browser alerts are opt-in and never expose private message bodies. */
export function BrowserNotificationBridge() {
  const { userId } = useAuth();
  const data = useListNotifications({ query: { queryKey: getListNotificationsQueryKey(), enabled: !!userId, refetchInterval: 20000 } });
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => { seen.current = null; }, [userId]);
  useEffect(() => {
    if (!data.data || !userId) return;
    const ids = new Set(data.data.map((n) => n.id));
    const previous = seen.current;
    seen.current = ids;
    if (!previous || typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return;
    let enabled = false;
    try { enabled = localStorage.getItem(preferenceKey(userId)) === "true"; } catch { return; }
    if (!enabled) return;
    const latest = data.data.find((n) => !n.read && !previous.has(n.id));
    if (!latest) return;
    try {
      const notification = new Notification("VastMind", { body: "You have new activity. Open the app to view it.", tag: "iam-new-activity" });
      notification.onclick = () => { window.focus(); notification.close(); };
    } catch {
      // Some mobile browsers expose Notification but require service-worker push.
    }
  }, [data.data, userId]);
  return null;
}

export function BrowserNotificationSettings() {
  const { userId } = useAuth();
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy,setBusy]=useState(false);
  const config=useGetPushConfig();
  const { toast } = useToast();
  useEffect(() => {
    setSupported(typeof Notification !== "undefined" && "serviceWorker" in navigator && "PushManager" in window);
    if("serviceWorker" in navigator)navigator.serviceWorker.getRegistration(`${basePath}/`).then(async r=>{
      const s=await r?.pushManager.getSubscription();
      setEnabled(!!s&&localStorage.getItem("neura-push-owner")===userId);
    }).catch(()=>setEnabled(false));
  }, [userId]);
  async function toggle() {
    if (!userId) return;
    setBusy(true);
    try {
      const next = !enabled;
      if (!next) {
        const registration=await navigator.serviceWorker.getRegistration(`${basePath}/`);
        const subscription=await registration?.pushManager.getSubscription();
        if(subscription){
          await removePushSubscription({endpoint:subscription.endpoint});
          await subscription.unsubscribe();
        }
        localStorage.removeItem("neura-push-owner");
        setEnabled(false);return;
      }
      if(!config.data?.configured||!config.data.publicKey)throw new Error("Server push configuration is not ready.");
      if (await Notification.requestPermission() !== "granted") {
        toast({ title: "Notifications weren't enabled", description: "You can allow notifications in your browser's site settings." });
        return;
      }
      const registration=await navigator.serviceWorker.register(`${basePath}/neura-push.js`,{scope:`${basePath}/`,updateViaCache:"none"});
      // Wait for this worker, rather than navigator.serviceWorker.ready, which can
      // resolve to another artifact's worker on a shared workspace origin.
      const worker=registration.installing||registration.waiting||registration.active;
      if(worker?.state!=="activated")await new Promise<void>((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error("Notification setup timed out")),15000);
        const onState=()=>{if(worker?.state==="activated"){clearTimeout(timeout);worker.removeEventListener("statechange",onState);resolve();}else if(worker?.state==="redundant"){clearTimeout(timeout);reject(new Error("Notification setup failed"));}};
        worker?.addEventListener("statechange",onState);onState();
      });
      const key=config.data.publicKey;
      const decoded=atob((key+"=".repeat((4-key.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/"));
      const applicationServerKey=Uint8Array.from(decoded,c=>c.charCodeAt(0));
      let subscription=await registration.pushManager.getSubscription();
      if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey});
      const json=subscription.toJSON();
      if(!json.keys?.p256dh||!json.keys.auth)throw new Error("Browser did not provide push keys.");
      try{await savePushSubscription({endpoint:subscription.endpoint,keys:{p256dh:json.keys.p256dh,auth:json.keys.auth}});}
      catch(e){await subscription.unsubscribe();throw e;}
      localStorage.setItem("neura-push-owner",userId);
      localStorage.setItem(preferenceKey(userId),"false");
      setEnabled(true);
    } catch(e) {
      toast({ title: "Couldn't update notifications",description:e instanceof Error?e.message:"Try again in your browser's site settings.", variant: "destructive" });
    }finally{setBusy(false);}
  }
  return <div className="rounded-2xl border bg-card p-4">
    <Button type="button" variant="outline" disabled={!supported||busy||(!enabled&&!config.data?.configured)} onClick={toggle}><Bell className="mr-2 h-4 w-4" />{busy?"Updating…":enabled ? "Disable closed-app alerts" : "Enable closed-app alerts"}</Button>
    <p className="mt-3 text-sm text-muted-foreground">{!supported?"This browser doesn't support push here. On iPhone or iPad, add the app to your Home Screen first.":config.isError?"Couldn't check push setup. Reload to try again.":!config.data?.configured?"Closed-app notifications need the server's VAPID keys before they can be enabled.":"Receive private activity alerts even when this tab is closed. Message contents stay off the lock screen. Delivery depends on your browser and device settings."}</p>
  </div>;
}
