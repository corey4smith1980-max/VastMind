"use client";
import { useEffect, useState } from "react";
import { MessageSquarePlus, Search, Users } from "lucide-react";
import { useListChats, getListChatsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/states";
import { UserAvatar } from "@/components/user-avatar";
import { ConnectionPill } from "@/components/shell/connection-pill";
import { chatTitle, otherMember } from "@/components/chats/helpers";
import { VASTMIND_STICKERS } from "@/components/chats/emoji-data";
import { useMe } from "@/lib/me";
import { chatTime } from "@/lib/format";
import { usePollInterval, useRealtime } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import { AlertsButton } from "@/components/shell/alerts-button";
import { MutualStatusStrip } from "@/components/status/status-ring";

type ChatFilter = "All" | "Unread" | "Groups";

// ---------- Left panel: searchable conversation list ----------
export function ChatList({ activeId, onSelect, onNew }: { activeId: string | null; onSelect: (id: string) => void; onNew: () => void }) {
  const me = useMe();
  const { typing } = useRealtime();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("All");
  useEffect(() => {
    const t = window.setTimeout(() => setDq(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const params = dq ? { q: dq } : undefined;
  const poll = usePollInterval(20_000);
  const chats = useListChats(params, { query: { queryKey: getListChatsQueryKey(params), refetchInterval: poll } });
  const visibleChats = (chats.data ?? []).filter((chat) =>
    filter === "All" || (filter === "Unread" ? chat.unreadCount > 0 : chat.type === "group"));

  return (
    <div className="relative flex h-full flex-col bg-card">
      <div className="px-4 pb-3 pt-5">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MutualStatusStrip meId={me.id} compact />
              <h1 className="font-display text-3xl font-bold">VastMind</h1>
            </div>
            <ConnectionPill className="mt-1 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-2">
            <AlertsButton />
          </div>
        </div>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" className="rounded-xl border-0 bg-muted pl-9" aria-label="Search conversations" data-testid="input-search-chats" />
        </div>
        <div role="tablist" aria-label="Filter conversations" className="mt-3 flex gap-2">
          {(["All", "Unread", "Groups"] as ChatFilter[]).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={filter === item} onClick={() => setFilter(item)}
              className={cn("rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors", filter === item ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}
              data-testid={`tab-chat-filter-${item.toLowerCase()}`}>{item}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-24" role="list">
        {chats.isLoading ? <RowSkeleton /> : null}
        {chats.isError ? <ErrorState error={chats.error} onRetry={() => chats.refetch()} /> : null}
        {chats.data && visibleChats.length === 0 ? (
          dq ? <EmptyState icon={Search} title="Nothing on that line" body={`No conversations match “${dq}”.`} />
            : <EmptyState icon={filter === "Groups" ? Users : MessageSquarePlus} title={filter === "All" ? "No conversations yet" : `No ${filter.toLowerCase()} conversations`} body="Start a conversation with someone you know by searching their exact username." action={<Button className="rounded-full" onClick={onNew}>Start a conversation</Button>} />
        ) : null}
        {visibleChats.map((c, i) => {
          const other = otherMember(c, me.id);
          const isGroup = c.type === "group";
          const t = (typing[c.id] ?? []).filter((x) => x.userId !== me.id);
          const active = c.id === activeId;
          const lastSticker = VASTMIND_STICKERS.find((item) => item.token === c.lastMessage);
          return (
            <button key={c.id} role="listitem" onClick={() => onSelect(c.id)} data-testid={`row-chat-${c.id}`}
              className={cn("rise group flex w-full items-center gap-3 rounded-xl border-b border-border/55 px-2.5 py-3 text-left transition-colors duration-150", active ? "bg-primary/10" : "hover:bg-muted/70")}
              style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
              {isGroup ? (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground"><Users className="h-5 w-5" /></span>
              ) : (
                <UserAvatar id={other?.user.id} name={other?.user.name} src={other?.user.avatarUrl} online={other?.user.online ?? false} />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("truncate font-semibold", active && "text-primary")}>{chatTitle(c, me.id)}</span>
                  <span className={cn("shrink-0 font-mono text-[11px]", c.unreadCount ? "text-primary" : "text-muted-foreground")}>{chatTime(c.lastMessageAt ?? c.createdAt)}</span>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={cn("truncate text-sm", t.length ? "italic text-primary" : c.unreadCount ? "font-medium text-foreground" : "text-muted-foreground")}>
                    {t.length ? `${t[0].name.split(" ")[0]} is typing…` : lastSticker ? `Sticker · ${lastSticker.label}` : c.lastMessage ?? (isGroup ? `${c.memberCount} members` : "Say hello")}
                  </span>
                  {c.unreadCount ? <span className="min-w-[20px] rounded-full bg-primary px-1.5 text-center font-mono text-[11px] font-bold leading-5 text-primary-foreground" aria-label={`${c.unreadCount} unread`}>{c.unreadCount}</span> : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <Button size="icon" className="absolute bottom-24 right-3 z-20 h-12 w-12 rounded-full shadow-lg md:bottom-5" onClick={onNew} aria-label="New conversation" data-testid="button-new-chat">
        <MessageSquarePlus className="h-5 w-5" />
      </Button>
    </div>
  );
}
