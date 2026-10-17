"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { useListNotifications, getListNotificationsQueryKey } from "@workspace/api-client-react";
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
      const notification = new Notification("NeuraCoreConnect", { body: "You have new activity. Open the app to view it.", tag: "neura-new-activity" });
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
  const { toast } = useToast();
  useEffect(() => {
    setSupported(typeof Notification !== "undefined");
    try { setEnabled(!!userId && localStorage.getItem(preferenceKey(userId)) === "true" && Notification.permission === "granted"); } catch { setEnabled(false); }
  }, [userId]);
  async function toggle() {
    if (!userId) return;
    try {
      const next = !enabled;
      if (next && await Notification.requestPermission() !== "granted") {
        toast({ title: "Notifications weren't enabled", description: "You can allow notifications in your browser's site settings." });
        return;
      }
      localStorage.setItem(preferenceKey(userId), String(next));
      setEnabled(next);
    } catch {
      toast({ title: "This browser couldn't enable notifications", variant: "destructive" });
    }
  }
  return <div className="rounded-2xl border bg-card p-4">
    <Button type="button" variant="outline" disabled={!supported} onClick={toggle}><Bell className="mr-2 h-4 w-4" />{enabled ? "Disable browser alerts" : "Enable browser alerts"}</Button>
    <p className="mt-3 text-sm text-muted-foreground">Alerts for new activity while NeuraCoreConnect stays open in another tab. Closed-app push notifications are not enabled yet.</p>
  </div>;
}
