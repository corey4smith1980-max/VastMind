"use client";
// ---------- Realtime layer: socket.io over same origin with cookies ----------
// Server emits: data:changed {entity, chatId?}, typing {...}, presence {userId, online}
// Client emits: chat:join {chatId}, typing {chatId, isTyping}
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "@clerk/react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { BrowserNotificationBridge } from "@/components/browser-notifications";

export type ConnectionState = "offline" | "connecting" | "live" | "reconnecting";
type TypingEntry = { userId: string; name: string; at: number };

type RealtimeCtx = {
  socket: Socket | null;
  status: ConnectionState;
  presence: Record<string, boolean>;
  typing: Record<string, TypingEntry[]>;
  joinChat: (chatId: string) => void;
  sendTyping: (chatId: string, isTyping: boolean) => void;
};

const Ctx = createContext<RealtimeCtx>({
  socket: null, status: "offline", presence: {}, typing: {}, joinChat: () => {}, sendTyping: () => {},
});

/** Invalidate every query whose first key segment starts with one of the prefixes. */
export function invalidatePrefixes(qc: QueryClient, prefixes: string[]) {
  return qc.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey[0];
      return typeof k === "string" && prefixes.some((p) => k.startsWith(p));
    },
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return useCallback((...prefixes: string[]) => invalidatePrefixes(qc, prefixes), [qc]);
}

const ENTITY_MAP: Record<string, string[]> = {
  chats: ["/api/chats", "/api/business"],
  posts: ["/api/feed", "/api/posts"],
  communities: ["/api/communities", "/api/feed", "/api/users"],
  channels: ["/api/channels"],
  statuses: ["/api/statuses"],
  notifications: ["/api/notifications"],
  users: ["/api/users", "/api/feed", "/api/chats"],
  message: ["/api/chats", "/api/notifications", "/api/business"],
  chat: ["/api/chats", "/api/business"],
  member: ["/api/chats"],
  post: ["/api/feed", "/api/posts"],
  comment: ["/api/feed", "/api/posts", "/api/notifications"],
  reaction: ["/api/feed", "/api/notifications"],
  poll: ["/api/feed"],
  community: ["/api/communities", "/api/feed"],
  channel: ["/api/channels"],
  status: ["/api/statuses"],
  notification: ["/api/notifications"],
  business: ["/api/business"],
  quickReply: ["/api/business"],
  profile: ["/api/me", "/api/users"],
  user: ["/api/users", "/api/me"],
};

/** Polling interval helper: poll faster while the socket is not live. */
export function usePollInterval(liveMs: number) {
  const { status } = useRealtime();
  return status === "live" ? liveMs : Math.max(4000, Math.round(liveMs / 3));
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, userId } = useAuth();
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const joined = useRef<Set<string>>(new Set());
  const [status, setStatus] = useState<ConnectionState>("offline");
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [typing, setTyping] = useState<Record<string, TypingEntry[]>>({});

  useEffect(() => {
    joined.current.clear();
    setPresence({});
    setTyping({});
  }, [userId]);

  useEffect(() => {
    if (!isSignedIn) { setStatus("offline"); return; }
    setStatus("connecting");
    const socket = io({ path: "/api/socket.io", withCredentials: true, transports: ["websocket", "polling"] });
    socketRef.current = socket;
    let hadConnected = false;

    socket.on("connect", () => {
      setStatus("live");
      setPresence({});
      // Rejoin rooms and refresh anything we may have missed while away.
      joined.current.forEach((chatId) => socket.emit("chat:join", { chatId }));
      if (hadConnected) qc.invalidateQueries();
      hadConnected = true;
    });
    socket.on("disconnect", (reason) => {
      setStatus("reconnecting");
      // A privacy/block change forces server disconnect; reconnect after cookies settle.
      if (reason === "io server disconnect") socket.connect();
    });
    socket.io.on("reconnect_attempt", () => setStatus("reconnecting"));
    socket.on("connect_error", () => setStatus(hadConnected ? "reconnecting" : "offline"));

    socket.on("data:changed", (p: { entity?: string; chatId?: string }) => {
      if (p?.entity === "profile" || p?.entity === "users") setPresence({});
      const prefixes = (p?.entity && ENTITY_MAP[p.entity]) || null;
      if (prefixes) invalidatePrefixes(qc, prefixes);
      else qc.invalidateQueries();
    });
    socket.on("presence", (p: { userId: string; online: boolean }) => {
      setPresence((prev) => ({ ...prev, [p.userId]: p.online }));
    });
    socket.on("typing", (p: { chatId: string; userId: string; name: string; isTyping: boolean }) => {
      setTyping((prev) => {
        const list = (prev[p.chatId] ?? []).filter((t) => t.userId !== p.userId);
        if (p.isTyping) list.push({ userId: p.userId, name: p.name, at: Date.now() });
        return { ...prev, [p.chatId]: list };
      });
    });

    // Expire stale typing indicators (missed "stop" events)
    const sweep = window.setInterval(() => {
      setTyping((prev) => {
        let changed = false;
        const next: Record<string, TypingEntry[]> = {};
        for (const [k, v] of Object.entries(prev)) {
          const f = v.filter((t) => Date.now() - t.at < 6000);
          if (f.length !== v.length) changed = true;
          next[k] = f;
        }
        return changed ? next : prev;
      });
    }, 2000);

    return () => {
      window.clearInterval(sweep);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setStatus("offline");
    };
  }, [isSignedIn, userId, qc]);

  const joinChat = useCallback((chatId: string) => {
    joined.current.add(chatId);
    socketRef.current?.emit("chat:join", { chatId });
  }, []);
  const sendTyping = useCallback((chatId: string, isTyping: boolean) => {
    socketRef.current?.emit("typing", { chatId, isTyping });
  }, []);

  const value = useMemo(() => ({ socket:socketRef.current, status, presence, typing, joinChat, sendTyping }), [status, presence, typing, joinChat, sendTyping]);
  return <Ctx.Provider value={value}><BrowserNotificationBridge />{children}</Ctx.Provider>;
}

export function useRealtime() {
  return useContext(Ctx);
}

/** Merge server-provided online flag with live presence events. */
export function useIsOnline(userId: string | undefined, fallback: boolean) {
  const { presence } = useRealtime();
  if (!userId) return false;
  return presence[userId] ?? fallback;
}
