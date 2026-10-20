"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Clock, Mic, Crown, Globe2, Loader2, Lock, Plus, Search, UserCheck, UsersRound, X } from "lucide-react";
import {
  useListCommunities, getListCommunitiesQueryKey, useCreateCommunity, useJoinCommunity,
  useListCommunityRequests, getListCommunityRequestsQueryKey, useDecideCommunityRequest, type Community,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { PageScroll } from "@/components/page-scroll";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/states";
import { UserAvatar } from "@/components/user-avatar";
import { useToast } from "@/hooks/use-toast";
import { errMessage, relTime } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useInvalidate, usePollInterval } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import { useCall } from "@/components/calling/call-provider";

// ---------- Create community ----------
function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const [f, setF] = useState({ name: "", description: "", category: "", isPrivate: false });
  const create = useCreateCommunity({
    mutation: {
      onSuccess: (c) => { invalidate("/api/communities"); toast({ title: `${c.name} is live` }); setF({ name: "", description: "", category: "", isPrivate: false }); onOpenChange(false); },
      onError: (e) => toast({ title: "Couldn't create", description: errMessage(e), variant: "destructive" }),
    },
  });
  const valid = f.name.trim().length >= 2 && f.description.trim().length >= 2 && f.category.trim().length >= 2;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader><DialogTitle className="font-display text-2xl">Start a community</DialogTitle><DialogDescription>A home for a street, a club, a cause or a craft.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="c-name">Name</Label><Input id="c-name" value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="input-community-name" /></div>
          <div><Label htmlFor="c-cat">Category</Label><Input id="c-cat" value={f.category} maxLength={40} placeholder="Neighbourhood, Sport, Food…" onChange={(e) => setF({ ...f, category: e.target.value })} data-testid="input-community-category" /></div>
          <div><Label htmlFor="c-desc">Description</Label><Textarea id="c-desc" value={f.description} maxLength={500} rows={3} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid="input-community-description" /></div>
          <div className="flex items-center justify-between rounded-xl border p-3">
            <Label htmlFor="c-priv">Request to join<span className="block text-xs font-normal text-muted-foreground">You approve every new member</span></Label>
            <Switch id="c-priv" checked={f.isPrivate} onCheckedChange={(v) => setF({ ...f, isPrivate: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!valid || create.isPending} className="rounded-full" onClick={() => create.mutate({ data: { name: f.name.trim(), description: f.description.trim(), category: f.category.trim(), isPrivate: f.isPrivate } })} data-testid="button-submit-community">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create community
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Owner: approve / decline join requests ----------
function RequestsDialog({ community, onClose }: { community: Community | null; onClose: () => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const id = community?.id ?? "";
  const reqs = useListCommunityRequests(id, { query: { enabled: !!community, queryKey: getListCommunityRequestsQueryKey(id), refetchInterval: 20_000 } });
  const decide = useDecideCommunityRequest({
    mutation: {
      onSuccess: (_r, v) => { invalidate(`/api/communities`); toast({ title: v.data.approve ? "Member approved" : "Request declined" }); },
      onError: (e) => toast({ title: "Couldn't update request", description: errMessage(e), variant: "destructive" }),
    },
  });
  return (
    <Dialog open={!!community} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-3xl">
        <DialogHeader><DialogTitle className="font-display text-2xl">Join requests</DialogTitle><DialogDescription>{community?.name}</DialogDescription></DialogHeader>
        {reqs.isLoading ? <Skeleton className="h-14" /> : null}
        {reqs.isError ? <ErrorState error={reqs.error} onRetry={() => reqs.refetch()} /> : null}
        {reqs.data?.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No one is waiting. All caught up.</p> : null}
        <ul className="space-y-1">
          {reqs.data?.map((u) => (
            <li key={u.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted" data-testid={`row-request-${u.id}`}>
              <UserAvatar id={u.id} name={u.name} src={u.avatarUrl} online={u.online} size="sm" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{u.name}</span><span className="text-xs text-muted-foreground">@{u.username}</span></span>
              <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" disabled={decide.isPending} onClick={() => decide.mutate({ communityId: id, userId: u.id, data: { approve: false } })} aria-label={`Decline ${u.name}`}><X className="h-4 w-4" /></Button>
              <Button size="icon" className="h-8 w-8 rounded-full" disabled={decide.isPending} onClick={() => decide.mutate({ communityId: id, userId: u.id, data: { approve: true } })} aria-label={`Approve ${u.name}`} data-testid={`button-approve-${u.id}`}><Check className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Community card ----------
function CommunityCard({ c, i, onRequests }: { c: Community; i: number; onRequests: (c: Community) => void }) {
  const me = useMe();
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const join = useJoinCommunity({
    mutation: {
      onSuccess: (r) => { invalidate("/api/communities", "/api/feed"); toast({ title: r.membership === "requested" ? "Request sent" : r.membership === "member" ? `Welcome to ${c.name}` : "Updated" }); },
      onError: (e) => toast({ title: "Couldn't join", description: errMessage(e), variant: "destructive" }),
    },
  });
  const owner = c.ownerId === me.id;
  const call = useCall();
  return (
    <article className={cn("rise flex flex-col rounded-[1.6rem] border bg-card p-5", i % 5 === 0 && "sm:col-span-2")} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }} data-testid={`card-community-${c.id}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-accent/40 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest">{c.category}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">{c.isPrivate ? <Lock className="h-3 w-3" /> : <Globe2 className="h-3 w-3" />}{c.isPrivate ? "Request" : "Open"}</span>
      </div>
      <Link href={`/videos?community=${c.id}`} className="mt-3 hover:text-primary"><h3 className="font-display text-2xl font-semibold leading-tight">{c.name}</h3></Link>
      <p className="mt-1.5 line-clamp-3 flex-1 text-sm text-muted-foreground">{c.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-auto font-mono text-xs text-muted-foreground">{c.memberCount} member{c.memberCount === 1 ? "" : "s"} · {relTime(c.createdAt)}</span>
        {owner ? (
          <>
            <span className="flex items-center gap-1 text-xs font-semibold text-primary"><Crown className="h-3.5 w-3.5" /> You run this</span>
            {c.isPrivate ? <Button size="sm" variant="outline" className="rounded-full" onClick={() => onRequests(c)} data-testid={`button-requests-${c.id}`}><UserCheck className="mr-1 h-3.5 w-3.5" /> Requests</Button> : null}
          </>
        ) : c.membership === "member" ? (
          <Button size="sm" variant="secondary" className="rounded-full" asChild><Link href={`/videos?community=${c.id}`}><Check className="mr-1 h-3.5 w-3.5" /> Joined · open</Link></Button>
        ) : c.membership === "requested" ? (
          <Button size="sm" variant="outline" className="rounded-full" disabled><Clock className="mr-1 h-3.5 w-3.5" /> Requested</Button>
        ) : (
          <Button size="sm" className="rounded-full" disabled={join.isPending} onClick={() => join.mutate({ communityId: c.id })} data-testid={`button-join-${c.id}`}>
            {join.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{c.isPrivate ? "Ask to join" : "Join"}
          </Button>
        )}
        {c.membership === "member" ? (
          <Button size="sm" variant="outline" className="rounded-full" disabled={call.busy} onClick={() => call.startCall({ scope: "community", id: c.id, video: false, title: c.name })} data-testid={`button-voice-room-${c.id}`}>
            <Mic className="mr-1 h-3.5 w-3.5" /> Join voice room
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export default function CommunitiesPage() {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [reqFor, setReqFor] = useState<Community | null>(null);
  useEffect(() => { const t = window.setTimeout(() => setDq(q.trim()), 300); return () => window.clearTimeout(t); }, [q]);
  const params = dq || category ? { ...(dq ? { q: dq } : {}), ...(category ? { category } : {}) } : undefined;
  const poll = usePollInterval(45_000);
  const list = useListCommunities(params, { query: { queryKey: getListCommunitiesQueryKey(params), refetchInterval: poll } });
  const all = useListCommunities(undefined, { query: { queryKey: getListCommunitiesQueryKey(), staleTime: 60_000 } });
  const categories = useMemo(() => Array.from(new Set((all.data ?? []).map((c) => c.category))).sort(), [all.data]);

  return (
    <PageScroll className="max-w-5xl">
      <PageHeader kicker="Find your people" title="Communities" sub="Neighbourhoods, clubs and causes. Join the open ones, ask to join the rest."
        actions={<Button className="rounded-full" onClick={() => setCreateOpen(true)} data-testid="button-new-community"><Plus className="mr-1 h-4 w-4" /> New community</Button>} />
      <div className="relative mt-6">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search communities" className="h-11 rounded-full bg-card pl-10" aria-label="Search communities" data-testid="input-search-communities" />
      </div>
      {categories.length ? (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Categories">
          <button onClick={() => setCategory(null)} className={cn("rounded-full border px-3 py-1 text-sm", !category ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>All</button>
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c === category ? null : c)} className={cn("rounded-full border px-3 py-1 text-sm", category === c ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{c}</button>
          ))}
        </div>
      ) : null}
      <div className="mt-6">
        {list.isLoading ? <CardSkeleton /> : null}
        {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : null}
        {list.data?.length === 0 ? (
          <EmptyState icon={UsersRound} title={dq || category ? "No matches" : "No communities yet"} body={dq || category ? "Try a different search or category." : "Start the first one — your street, your club, your cause."}
            action={<Button className="rounded-full" onClick={() => setCreateOpen(true)}>Start a community</Button>} />
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.data?.map((c, i) => <CommunityCard key={c.id} c={c} i={i} onRequests={setReqFor} />)}
        </div>
      </div>
      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RequestsDialog community={reqFor} onClose={() => setReqFor(null)} />
    </PageScroll>
  );
}
