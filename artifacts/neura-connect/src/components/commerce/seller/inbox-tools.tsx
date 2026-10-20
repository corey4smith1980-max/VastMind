"use client";
import { useState } from "react";
import Link from "next/link";
import { Inbox, Loader2, MessageSquareReply, Percent, Plus, Store, Users, Zap } from "lucide-react";
import {
  useGetBusinessOverview, getGetBusinessOverviewQueryKey, useListQuickReplies, getListQuickRepliesQueryKey,
  useCreateQuickReply, useUpdateBusinessStatus,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/states";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";
import { useInvalidate, usePollInterval } from "@/lib/realtime";
import { cn } from "@/lib/utils";

// ---------- Business tools: availability, inbox stats, quick replies ----------
export function InboxTools() {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const poll = usePollInterval(30_000);
  const overview = useGetBusinessOverview({ query: { queryKey: getGetBusinessOverviewQueryKey(), refetchInterval: poll } });
  const replies = useListQuickReplies({ query: { queryKey: getListQuickRepliesQueryKey() } });
  const [label, setLabel] = useState("");
  const [content, setContent] = useState("");

  const status = useUpdateBusinessStatus({
    mutation: {
      onSuccess: (_d, v) => { invalidate("/api/business"); toast({ title: v.data.isOpen ? "You're open for messages" : "Marked as closed" }); },
      onError: (e) => toast({ title: "Couldn't update", description: errMessage(e), variant: "destructive" }),
    },
  });
  const createReply = useCreateQuickReply({
    mutation: {
      onSuccess: () => { setLabel(""); setContent(""); invalidate("/api/business/quick-replies"); toast({ title: "Quick reply saved", description: "Use it from the bolt button in any chat." }); },
      onError: (e) => toast({ title: "Couldn't save", description: errMessage(e), variant: "destructive" }),
    },
  });

  const o = overview.data;
  const isOpen = status.isPending ? status.variables?.data.isOpen ?? o?.isOpen : o?.isOpen;
  const stats = o ? [
    { label: "Unread customer chats", value: String(o.unreadCustomerChats), icon: Inbox, tone: "bg-primary text-primary-foreground" },
    { label: "Customers", value: String(o.totalCustomers), icon: Users, tone: "bg-card" },
    { label: "Response rate", value: `${Math.round(o.responseRate * (o.responseRate <= 1 ? 1000 : 10)) / 10}%`, icon: Percent, tone: "bg-accent/40" },
  ] : [];

  return (
    <div>

      {/* Availability */}
      <section className={cn("rise flex items-center gap-4 rounded-[1.8rem] p-5 transition-colors duration-500 sm:p-6", isOpen ? "bg-[hsl(var(--ink))] text-[#f4ece0]" : "border bg-card")}>
        <span className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl", isOpen ? "bg-online/20 text-online" : "bg-muted text-muted-foreground")}><Store className="h-6 w-6" /></span>
        <div className="flex-1">
          {overview.isLoading ? <Skeleton className="h-6 w-40" /> : <p className="font-display text-2xl font-semibold">{isOpen ? "Open for messages" : "Closed right now"}</p>}
          <p className={cn("text-sm", isOpen ? "text-[#f4ece0]/70" : "text-muted-foreground")}>{isOpen ? "Customers see you're available." : "Customers can still message — they'll know you'll reply later."}</p>
        </div>
        <Switch checked={!!isOpen} disabled={!o || status.isPending} onCheckedChange={(v) => status.mutate({ data: { isOpen: v } })} aria-label="Open for messages" data-testid="switch-business-open" />
      </section>

      {/* Stats */}
      {overview.isError ? <ErrorState error={overview.error} onRetry={() => overview.refetch()} /> : (
        <section className="mt-4 grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr]">
          {overview.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-[1.6rem]" />) : stats.map((s, i) => (
            <div key={s.label} className={cn("rise rounded-[1.6rem] border p-5", s.tone)} style={{ animationDelay: `${i * 60}ms` }} data-testid={`stat-${i}`}>
              <s.icon className="h-5 w-5 opacity-80" />
              <p className="font-display mt-4 text-4xl font-bold tabular-nums">{s.value}</p>
              <p className="mt-1 text-sm opacity-80">{s.label}</p>
            </div>
          ))}
        </section>
      )}
      {o && o.unreadCustomerChats > 0 ? (
        <Button asChild variant="outline" className="mt-3 rounded-full"><Link href="/chats"><MessageSquareReply className="mr-1 h-4 w-4" /> Answer customers</Link></Button>
      ) : null}

      {/* Quick replies */}
      <section className="mt-10 grid gap-6 md:grid-cols-[1fr_1.2fr]">
        <div className="rounded-[1.6rem] border bg-card p-5">
          <h2 className="font-display flex items-center gap-2 text-xl font-semibold"><Zap className="h-5 w-5 text-primary" /> New quick reply</h2>
          <div className="mt-4 space-y-3">
            <div><Label htmlFor="qr-label">Label</Label><Input id="qr-label" value={label} maxLength={80} placeholder="Opening hours" onChange={(e) => setLabel(e.target.value)} data-testid="input-reply-label" /></div>
            <div><Label htmlFor="qr-content">Message</Label><Textarea id="qr-content" value={content} maxLength={2000} rows={4} placeholder="We're open Tue–Sat, 8 till 4." onChange={(e) => setContent(e.target.value)} data-testid="input-reply-content" /></div>
            <Button className="w-full rounded-full" disabled={!label.trim() || !content.trim() || createReply.isPending} onClick={() => createReply.mutate({ data: { label: label.trim(), content: content.trim() } })} data-testid="button-save-reply">
              {createReply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save reply
            </Button>
          </div>
        </div>
        <div>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Saved replies · usable in every chat</h2>
          <div className="mt-3 space-y-2">
            {replies.isLoading ? [0, 1].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />) : null}
            {replies.isError ? <ErrorState error={replies.error} onRetry={() => replies.refetch()} /> : null}
            {replies.data?.length === 0 ? <EmptyState icon={Zap} title="No saved replies" body="Save the answers you type over and over." className="py-8" /> : null}
            {replies.data?.map((r) => (
              <div key={r.id} className="rise rounded-2xl border bg-card p-4" data-testid={`card-reply-${r.id}`}>
                <p className="font-semibold">/{r.label}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{r.content}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
