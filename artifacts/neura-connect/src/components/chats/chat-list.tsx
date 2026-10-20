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

// ---------- Left panel: searchable conversation list ----------
export function ChatList({ activeId, onSelect, onNew }: { activeId: string | null; onSelect: (id: string) => void; onNew: () => void }) {
  const me = useMe();
  const { typing } = useRealtime();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDq(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const params = dq ? { q: dq } : undefined;
  const poll = usePollInterval(20_000);
  const chats = useListChats(params, { query: { queryKey: getListChatsQueryKey(params), refetchInterval: poll } });

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="px-4 pb-3 pt-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Chats</h1>
            <ConnectionPill className="mt-1 text-muted-foreground" />
          </div>
          <Button size="icon" className="h-11 w-11 rounded-2xl" onClick={onNew} aria-label="New conversation" data-testid="button-new-chat">
            <MessageSquarePlus className="h-5 w-5" />
          </Button>
        </div>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" className="rounded-xl border-0 bg-muted pl-9" aria-label="Search conversations" data-testid="input-search-chats" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4" role="list">
        {chats.isLoading ? <RowSkeleton /> : null}
        {chats.isError ? <ErrorState error={chats.error} onRetry={() => chats.refetch()} /> : null}
        {chats.data && chats.data.length === 0 ? (
          dq ? <EmptyState icon={Search} title="Nothing on that line" body={`No conversations match “${dq}”.`} />
            : <EmptyState icon={MessageSquarePlus} title="No conversations yet" body="Find a friend by name and say hello, or start a group for your crew." action={<Button className="rounded-full" onClick={onNew}>Start a conversation</Button>} />
        ) : null}
        {chats.data?.map((c, i) => {
          const other = otherMember(c, me.id);
          const isGroup = c.type === "group";
          const t = (typing[c.id] ?? []).filter((x) => x.userId !== me.id);
          const active = c.id === activeId;
          const lastSticker = VASTMIND_STICKERS.find((item) => item.token === c.lastMessage);
          return (
            <button key={c.id} role="listitem" onClick={() => onSelect(c.id)} data-testid={`row-chat-${c.id}`}
              className={cn("rise group flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors duration-150", active ? "bg-primary/10" : "hover:bg-muted")}
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
    </div>
  );
}
