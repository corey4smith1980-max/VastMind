"use client";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Check, CheckCheck, Clock, Flag, Info, Loader2, MoreVertical, Paperclip, Phone, Video, Search, SendHorizontal, ShieldOff, Users, X, Zap,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetChatMessages, getGetChatMessagesQueryKey, useSendMessage, useMarkChatRead, getListChatsQueryKey,
  useListQuickReplies, getListQuickRepliesQueryKey, type Conversation, type Message, type MediaAttachment,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { ErrorState } from "@/components/states";
import { BlockDialog, ReportDialog } from "@/components/safety-dialogs";
import { ChatInfoSheet } from "@/components/chats/chat-info-sheet";
import { ComposerTools } from "@/components/chats/composer-tools";
import { chatTitle, otherMember } from "@/components/chats/helpers";
import { useToast } from "@/hooks/use-toast";
import { clock, dayLabel, errMessage, relTime } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useInvalidate, useIsOnline, usePollInterval, useRealtime } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import { useCall } from "@/components/calling/call-provider";
import { MediaPicker, MediaPreview } from "@/components/media-attachment";

const PAGE = 40;
const byTime = (a: Message, b: Message) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

// ---------- Message bubble ----------
function Bubble({ m, mine, showName, others }: { m: Message; mine: boolean; showName: boolean; others: number }) {
  if (m.type === "system") {
    return <div className="my-3 flex justify-center"><span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{m.content}</span></div>;
  }
  const readByOthers = m.readBy.filter((id) => id !== m.senderId).length;
  return (
    <div className={cn("rise flex gap-2", mine ? "justify-end" : "justify-start")} data-testid={`message-${m.id}`}>
      {!mine && showName ? <UserAvatar id={m.senderId} name={m.senderName} src={m.senderAvatarUrl} size="sm" className="mt-auto" /> : !mine ? <span className="w-8 shrink-0" /> : null}
      <div className={cn("max-w-[78%] rounded-[1.15rem] px-3.5 py-2 shadow-[0_1px_0_hsl(var(--ink)/.06)] sm:max-w-[64%]", mine ? "bubble-mine rounded-br-md" : "bubble-theirs rounded-bl-md border")}>
        {!mine && showName ? <p className="mb-0.5 text-xs font-semibold text-primary">{m.senderName}</p> : null}
        {m.media ? <MediaPreview media={m.media} /> : null}
        <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{m.content.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
          /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline break-all">{part}</a> : part
        )}</p>
        <p className={cn("mt-1 flex items-center justify-end gap-1 font-mono text-[10px]", mine ? "opacity-75" : "text-muted-foreground")}>
          {clock(m.createdAt)}
          {mine ? (
            readByOthers > 0 ? (
              <CheckCheck className="h-3.5 w-3.5 text-accent" aria-label={others > 1 ? `Read by ${readByOthers}` : "Read"} />
            ) : <Check className="h-3.5 w-3.5" aria-label="Sent" />
          ) : null}
        </p>
      </div>
    </div>
  );
}

function MessageRun({ items, meId, others }: { items: Message[]; meId: string; others: number }) {
  return (
    <>
      {items.map((m, i) => {
        const prev = items[i - 1];
        const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
        return (
          <Fragment key={m.id}>
            {newDay ? (
              <div className="sticky top-2 z-10 my-4 flex justify-center">
                <span className="rounded-full border bg-card/90 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur">{dayLabel(m.createdAt)}</span>
              </div>
            ) : null}
            <div className={cn(prev && prev.senderId === m.senderId && !newDay ? "mt-0.5" : "mt-3")}>
              <Bubble m={m} mine={m.senderId === meId} showName={!prev || prev.senderId !== m.senderId || newDay} others={others} />
            </div>
          </Fragment>
        );
      })}
    </>
  );
}

// ---------- Older page of history (cursor-based) ----------
function OlderPage({ chatId, before, meId, others, onCursor }: { chatId: string; before: string; meId: string; others: number; onCursor: (before: string, next: string | null) => void }) {
  const params = { before, limit: PAGE };
  const q = useGetChatMessages(chatId, params, { query: { queryKey: getGetChatMessagesQueryKey(chatId, params), staleTime: 60_000 } });
  const cb = useRef(onCursor);
  cb.current = onCursor;
  useEffect(() => {
    if (q.data) cb.current(before, q.data.nextBefore);
  }, [q.data, before]);
  if (q.isLoading) return <div className="space-y-2 py-3">{[0, 1, 2].map((i) => <Skeleton key={i} className={cn("h-10 w-1/2 rounded-2xl", i % 2 && "ml-auto")} />)}</div>;
  if (q.isError) return <p className="py-3 text-center text-xs text-destructive">Couldn't load older messages.</p>;
  return <MessageRun items={[...(q.data?.items ?? [])].sort(byTime)} meId={meId} others={others} />;
}

// ---------- In-conversation search (server-side q) ----------
function SearchPanel({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDq(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);
  const params = { q: dq, limit: 50 };
  const res = useGetChatMessages(chatId, params, { query: { enabled: dq.length > 0, queryKey: getGetChatMessagesQueryKey(chatId, params) } });
  return (
    <div className="rise absolute inset-x-0 top-0 z-20 max-h-[70%] overflow-hidden border-b bg-card shadow-lg">
      <div className="flex items-center gap-2 p-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this conversation" className="border-0 bg-transparent shadow-none focus-visible:ring-0" aria-label="Search messages" data-testid="input-search-messages" />
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close search"><X className="h-4 w-4" /></Button>
      </div>
      <div className="max-h-[50vh] overflow-y-auto px-3 pb-3 scrollbar-thin">
        {dq && res.isLoading ? <Skeleton className="h-12" /> : null}
        {dq && res.data?.items.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No messages contain “{dq}”.</p> : null}
        {res.data?.items.map((m) => (
          <div key={m.id} className="rounded-xl p-2 hover:bg-muted">
            <p className="flex justify-between text-xs"><span className="font-semibold">{m.senderName}</span><span className="font-mono text-muted-foreground">{relTime(m.createdAt)}</span></p>
            <p className="text-sm">{m.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- The conversation pane ----------
export function ConversationPane({ chat, onBack }: { chat: Conversation; onBack: () => void }) {
  const [attachment,setAttachment]=useState<MediaAttachment>();
  const me = useMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const { joinChat, sendTyping, typing } = useRealtime();
  const poll = usePollInterval(15_000);
  const call = useCall();

  const [infoOpen, setInfoOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [blockT, setBlockT] = useState<{ id: string; name: string } | null>(null);
  const [reportT, setReportT] = useState<{ id: string; name: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [older, setOlder] = useState<string[]>([]);
  const [cursors, setCursors] = useState<Record<string, string | null>>({});

  const isGroup = chat.type === "group";
  const other = otherMember(chat, me.id);
  const otherOnline = useIsOnline(other?.user.id, other?.user.online ?? false);
  const others = chat.members.length - 1;

  // Latest page (polled; socket invalidates it on data:changed)
  const latestParams = { limit: PAGE };
  const latest = useGetChatMessages(chat.id, latestParams, { query: { queryKey: getGetChatMessagesQueryKey(chat.id, latestParams), refetchInterval: poll } });
  const latestItems = useMemo(() => [...(latest.data?.items ?? [])].sort(byTime), [latest.data]);
  const lastId = latestItems[latestItems.length - 1]?.id;

  // Next cursor for "load earlier": from the oldest loaded page.
  const nextCursor = older.length ? cursors[older[older.length - 1]] : latest.data?.nextBefore ?? null;
  const onCursor = useCallback((before: string, next: string | null) => setCursors((c) => (c[before] === next ? c : { ...c, [before]: next })), []);

  // Join the socket room for this chat.
  useEffect(() => { joinChat(chat.id); }, [chat.id, joinChat]);

  // Mark read whenever a new latest message arrives.
  const markRead = useMarkChatRead();
  const markRef = useRef(markRead.mutate);
  markRef.current = markRead.mutate;
  useEffect(() => {
    if (!lastId) return;
    markRef.current({ chatId: chat.id }, {
      onSuccess: () => {
        setAttachment(undefined);
        qc.invalidateQueries({ queryKey: getListChatsQueryKey() });
        invalidate("/api/notifications", "/api/business");
      },
    });
  }, [lastId, chat.id, qc, invalidate]);

  // Scroll management: stick to bottom for new messages; preserve position when prepending.
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const prevHeight = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    } else if (nearBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  });
  useEffect(() => { nearBottom.current = true; }, [lastId]);

  // Send + typing
  const send = useSendMessage({
    mutation: {
      onSuccess: () => {
        invalidate(`/api/chats/${chat.id}/messages`);
        qc.invalidateQueries({ queryKey: getListChatsQueryKey() });
      },
      onError: (e, vars) => { setDraft(vars.data.content); toast({ title: "Message not sent", description: errMessage(e), variant: "destructive" }); },
    },
  });
  const typingTimer = useRef<number | null>(null);
  const isTypingRef = useRef(false);
  function onDraft(v: string) {
    setDraft(v);
    if (!isTypingRef.current && v) { isTypingRef.current = true; sendTyping(chat.id, true); }
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => { isTypingRef.current = false; sendTyping(chat.id, false); }, 2500);
  }
  function submit() {
    const content = draft.trim() || (attachment ? (attachment.contentType.startsWith("audio/")?"Voice note":attachment.name) : "");
    if (!content || send.isPending) return;
    nearBottom.current = true;
    setDraft("");
    isTypingRef.current = false;
    sendTyping(chat.id, false);
    send.mutate({ chatId: chat.id, data: { content, mediaId:attachment?.id } });
  }

  const replies = useListQuickReplies({ query: { queryKey: getListQuickRepliesQueryKey(), staleTime: 60_000 } });
  const typers = (typing[chat.id] ?? []).filter((t) => t.userId !== me.id);

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center gap-2 border-b bg-card/95 px-2 py-2 backdrop-blur sm:px-4">
        <Button size="icon" variant="ghost" className="md:hidden" onClick={onBack} aria-label="Back to chats" data-testid="button-back"><ArrowLeft className="h-5 w-5" /></Button>
        <button className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left hover:bg-muted" onClick={() => setInfoOpen(true)} data-testid="button-chat-info">
          {isGroup ? (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground"><Users className="h-5 w-5" /></span>
          ) : <UserAvatar id={other?.user.id} name={other?.user.name} src={other?.user.avatarUrl} online={other?.user.online ?? false} />}
          <span className="min-w-0">
            <span className="block truncate font-display text-lg font-semibold leading-tight">{chatTitle(chat, me.id)}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {typers.length ? <span className="text-primary">{typers.map((t) => t.name.split(" ")[0]).join(", ")} typing…</span>
                : isGroup ? chat.members.map((m) => (m.user.id === me.id ? "You" : m.user.name.split(" ")[0])).join(", ")
                : otherOnline ? "Online" : other?.user.lastSeenAt ? `Last seen ${relTime(other.user.lastSeenAt)}` : `@${other?.user.username ?? ""}`}
            </span>
          </span>
        </button>
        <Button size="icon" variant="ghost" disabled={call.busy} onClick={() => call.startCall({ scope: "chat", id: chat.id, video: true, title: chatTitle(chat, me.id) })} aria-label="Start video call" data-testid="button-video-call"><Video className="h-5 w-5" /></Button>
        <Button size="icon" variant="ghost" disabled={call.busy} onClick={() => call.startCall({ scope: "chat", id: chat.id, video: false, title: chatTitle(chat, me.id) })} aria-label="Start voice call" data-testid="button-voice-call"><Phone className="h-5 w-5" /></Button>
        <Button size="icon" variant="ghost" onClick={() => setSearchOpen((s) => !s)} aria-label="Search messages" data-testid="button-search-messages"><Search className="h-5 w-5" /></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="More options" data-testid="button-chat-menu"><MoreVertical className="h-5 w-5" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setInfoOpen(true)}><Info className="mr-2 h-4 w-4" /> {isGroup ? "Group info & members" : "Contact info"}</DropdownMenuItem>
            {!isGroup && other ? (
              <>
                <DropdownMenuItem onClick={() => setReportT({ id: other.user.id, name: other.user.name })}><Flag className="mr-2 h-4 w-4" /> Report</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => setBlockT({ id: other.user.id, name: other.user.name })} data-testid="button-block-contact"><ShieldOff className="mr-2 h-4 w-4" /> Block</DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {searchOpen ? <div className="relative"><SearchPanel chatId={chat.id} onClose={() => setSearchOpen(false)} /></div> : null}

      {/* Messages */}
      <div
        ref={scroller}
        className="switchboard-bg flex-1 overflow-y-auto px-3 py-4 scrollbar-thin sm:px-6"
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          if (el.scrollTop < 60 && nextCursor && !older.includes(nextCursor)) {
            prevHeight.current = el.scrollHeight;
            setOlder((pages) => pages.includes(nextCursor) ? pages : [...pages, nextCursor]);
          }
        }}
        aria-live="polite"
        data-testid="list-messages"
      >
        {latest.isLoading ? (
          <div className="space-y-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className={cn("h-12 rounded-2xl", i % 2 ? "ml-auto w-1/2" : "w-2/5")} />)}</div>
        ) : latest.isError ? (
          <ErrorState error={latest.error} onRetry={() => latest.refetch()} />
        ) : (
          <>
            <div className="mb-2 flex justify-center">
              {nextCursor ? (
                <Button size="sm" variant="outline" className="rounded-full bg-card" onClick={() => { prevHeight.current = scroller.current?.scrollHeight ?? null; setOlder((o) => [...o, nextCursor]); }} data-testid="button-load-earlier">
                  Load earlier messages
                </Button>
              ) : latestItems.length ? (
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Beginning of conversation</span>
              ) : null}
            </div>
            {[...older].reverse().map((b) => <OlderPage key={b} chatId={chat.id} before={b} meId={me.id} others={others} onCursor={onCursor} />)}
            {latestItems.length === 0 ? (
              <div className="mx-auto mt-16 max-w-xs rounded-3xl border bg-card p-6 text-center">
                <p className="font-display text-xl font-semibold">The line is open.</p>
                <p className="mt-1 text-sm text-muted-foreground">Send the first message — {isGroup ? "everyone in the group will see it" : `${other?.user.name.split(" ")[0] ?? "they"}'ll get it right away`}.</p>
              </div>
            ) : <MessageRun items={latestItems} meId={me.id} others={others} />}
            {send.isPending ? (
              <div className="mt-2 flex justify-end"><div className="bubble-mine max-w-[64%] rounded-[1.15rem] rounded-br-md px-3.5 py-2 opacity-70"><p className="whitespace-pre-wrap text-[15px]">{send.variables?.data.content}</p><Clock className="ml-auto mt-1 h-3 w-3" aria-label="Sending" /></div></div>
            ) : null}
            {typers.length ? (
              <div className="mt-3 flex items-center gap-2" aria-label="Someone is typing">
                <div className="bubble-theirs flex gap-1 rounded-2xl rounded-bl-md border px-3 py-3">
                  {[0, 1, 2].map((i) => <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-foreground/50" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Composer */}
      {attachment?<div className="flex items-center justify-between border-t bg-card px-3 py-2 text-xs"><span className="truncate">Ready to send: {attachment.name}</span><Button type="button" variant="ghost" size="icon" aria-label="Remove attachment" onClick={()=>setAttachment(undefined)}><X className="h-4 w-4"/></Button></div>:null}
      <form className="flex items-end gap-1 border-t bg-card p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-2 sm:p-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <ComposerTools append={(value) => onDraft(`${draft}${draft ? " " : ""}${value}`.slice(0, 4000))} />
        <MediaPicker purpose="chat" chatId={chat.id} onChange={setAttachment} />
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="icon" variant="ghost" className="hidden sm:inline-flex" aria-label="Quick replies" data-testid="button-quick-replies"><Zap className="h-5 w-5" /></Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 rounded-2xl p-2">
            <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Quick replies</p>
            {replies.isLoading ? <Skeleton className="m-2 h-8" /> : null}
            {replies.data?.length === 0 ? <p className="p-2 text-sm text-muted-foreground">No saved replies yet. Add some in Business.</p> : null}
            {replies.data?.map((r) => (
              <button key={r.id} type="button" onClick={() => onDraft(draft ? `${draft} ${r.content}` : r.content)} className="block w-full rounded-xl p-2 text-left hover:bg-muted" data-testid={`button-use-reply-${r.id}`}>
                <span className="block text-sm font-semibold">{r.label}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{r.content}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <Textarea
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          rows={1}
          maxLength={4000}
          placeholder="Type a message"
          aria-label="Message"
          className="max-h-36 min-h-[44px] min-w-0 flex-1 resize-none rounded-2xl border-0 bg-muted py-3"
          data-testid="input-message"
        />
        <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full transition-transform active:scale-90" disabled={(!draft.trim()&&!attachment)||send.isPending} aria-label="Send" data-testid="button-send">
          {send.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
        </Button>
      </form>

      <ChatInfoSheet chat={chat} open={infoOpen} onOpenChange={setInfoOpen} />
      <BlockDialog target={blockT} onClose={() => setBlockT(null)} />
      <ReportDialog target={reportT} onClose={() => setReportT(null)} />
    </div>
  );
}
