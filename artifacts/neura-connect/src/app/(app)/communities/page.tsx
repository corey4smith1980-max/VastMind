"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check, Clock, HandHeart, HeartHandshake, Loader2, Lock, Mic, Plus, Search,
  ShieldCheck, UserCheck, UsersRound, X, MessageCircle, Sparkles, CircleDollarSign,
} from "lucide-react";
import {
  useListCommunities, getListCommunitiesQueryKey, useCreateCommunity, useJoinCommunity,
  useListCommunityRequests, getListCommunityRequestsQueryKey, useDecideCommunityRequest,
  type Community, useListCommunityGigs, getListCommunityGigsQueryKey, useCreateCommunityGig,
  useCreateCommunityGigResponse, useListCommunityGigResponses, getListCommunityGigResponsesQueryKey,
  useDecideCommunityGigResponse, useCompleteCommunityGig, useCloseCommunityGig,
  type CommunityGig, type CommunityGigCategory,
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

const gigCategories: { value: CommunityGigCategory; label: string }[] = [
  { value: "home-repairs", label: "Home & repairs" }, { value: "learning", label: "Learning" },
  { value: "creative", label: "Creative" }, { value: "technology", label: "Technology" },
  { value: "personal-care", label: "Personal care" }, { value: "food-events", label: "Food & events" },
  { value: "transport", label: "Transport" }, { value: "errands", label: "Errands" },
  { value: "childcare", label: "Childcare" }, { value: "other", label: "Other" },
];
const categoryLabel = (value: string) => gigCategories.find((item) => item.value === value)?.label ?? value;

function CreateCommunityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
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
        <DialogFooter><Button disabled={!valid || create.isPending} className="rounded-full" onClick={() => create.mutate({ data: { name: f.name.trim(), description: f.description.trim(), category: f.category.trim(), isPrivate: f.isPrivate } })} data-testid="button-submit-community">
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create community
        </Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestsDialog({ community, onClose }: { community: Community | null; onClose: () => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const id = community?.id ?? "";
  const reqs = useListCommunityRequests(id, { query: { enabled: !!community, queryKey: getListCommunityRequestsQueryKey(id), refetchInterval: 20_000 } });
  const decide = useDecideCommunityRequest({
    mutation: {
      onSuccess: (_r, v) => { invalidate("/api/communities"); toast({ title: v.data.approve ? "Member approved" : "Request declined" }); },
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
        <ul className="space-y-1">{reqs.data?.map((u) => (
          <li key={u.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted" data-testid={`row-request-${u.id}`}>
            <UserAvatar id={u.id} name={u.name} src={u.avatarUrl} online={u.online} size="sm" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{u.name}</span><span className="text-xs text-muted-foreground">@{u.username}</span></span>
            <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" disabled={decide.isPending} onClick={() => decide.mutate({ communityId: id, userId: u.id, data: { approve: false } })} aria-label={`Decline ${u.name}`}><X className="h-4 w-4" /></Button>
            <Button size="icon" className="h-8 w-8 rounded-full" disabled={decide.isPending} onClick={() => decide.mutate({ communityId: id, userId: u.id, data: { approve: true } })} aria-label={`Approve ${u.name}`} data-testid={`button-approve-${u.id}`}><Check className="h-4 w-4" /></Button>
          </li>
        ))}</ul>
      </DialogContent>
    </Dialog>
  );
}

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
        <span className="flex items-center gap-1 text-xs text-muted-foreground">{c.isPrivate ? <Lock className="h-3 w-3" /> : <UsersRound className="h-3 w-3" />}{c.isPrivate ? "Request" : "Open"}</span>
      </div>
      <Link href={`/videos?community=${c.id}`} className="mt-3 hover:text-primary"><h3 className="font-display text-2xl font-semibold leading-tight">{c.name}</h3></Link>
      <p className="mt-1.5 line-clamp-3 flex-1 text-sm text-muted-foreground">{c.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-auto font-mono text-xs text-muted-foreground">{c.memberCount} member{c.memberCount === 1 ? "" : "s"} · {relTime(c.createdAt)}</span>
        {owner ? <><span className="flex items-center gap-1 text-xs font-semibold text-primary"><UserCheck className="h-3.5 w-3.5" /> You run this</span>
          {c.isPrivate ? <Button size="sm" variant="outline" className="rounded-full" onClick={() => onRequests(c)} data-testid={`button-requests-${c.id}`}><UserCheck className="mr-1 h-3.5 w-3.5" /> Requests</Button> : null}</>
          : c.membership === "member" ? <Button size="sm" variant="secondary" className="rounded-full" asChild><Link href={`/videos?community=${c.id}`}><Check className="mr-1 h-3.5 w-3.5" /> Joined · open</Link></Button>
          : c.membership === "requested" ? <Button size="sm" variant="outline" className="rounded-full" disabled><Clock className="mr-1 h-3.5 w-3.5" /> Requested</Button>
          : <Button size="sm" className="rounded-full" disabled={join.isPending} onClick={() => join.mutate({ communityId: c.id })} data-testid={`button-join-${c.id}`}>{join.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{c.isPrivate ? "Ask to join" : "Join"}</Button>}
        {c.membership === "member" ? <Button size="sm" variant="outline" className="rounded-full" disabled={call.busy} onClick={() => call.startCall({ scope: "community", id: c.id, video: false, title: c.name })} data-testid={`button-voice-room-${c.id}`}><Mic className="mr-1 h-3.5 w-3.5" /> Join voice room</Button> : null}
      </div>
    </article>
  );
}

function CreateGigDialog({ open, onOpenChange, communities }: { open: boolean; onOpenChange: (open: boolean) => void; communities: Community[] }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const [form, setForm] = useState({ communityId: "", kind: "offer" as "offer" | "request", title: "", category: "other" as CommunityGigCategory, description: "", rateNote: "" });
  const members = communities.filter((community) => community.membership === "member");
  const create = useCreateCommunityGig({
    mutation: {
      onSuccess: () => { invalidate("/api/community-gigs"); toast({ title: "Opportunity posted", description: "Your community can now see it." }); setForm({ communityId: "", kind: "offer", title: "", category: "other", description: "", rateNote: "" }); onOpenChange(false); },
      onError: (e) => toast({ title: "Couldn't post this yet", description: errMessage(e), variant: "destructive" }),
    },
  });
  useEffect(() => {
    if (open) setForm((current) => ({ ...current, communityId: members.some((c) => c.id === current.communityId) ? current.communityId : members[0]?.id ?? "" }));
  // Memberships are read when the dialog opens; avoid reinitializing the user's edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const valid = !!form.communityId && form.title.trim().length >= 3 && form.description.trim().length >= 3;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl">
        <DialogHeader><DialogTitle className="font-display text-2xl">{form.kind === "offer" ? "Offer a skill" : "Request help"}</DialogTitle><DialogDescription>Keep it friendly and specific. Share details privately after someone responds.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div><Label htmlFor="gig-kind">I want to</Label><select id="gig-kind" className="mt-1 flex h-10 w-full rounded-xl border bg-background px-3 text-sm" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "offer" | "request" })}><option value="offer">Offer a skill</option><option value="request">Request help</option></select></div>
          <div><Label htmlFor="gig-community">Community</Label><select id="gig-community" className="mt-1 flex h-10 w-full rounded-xl border bg-background px-3 text-sm" value={form.communityId} onChange={(e) => setForm({ ...form, communityId: e.target.value })}><option value="">Choose a community</option>{members.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{members.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">Join a community before posting an opportunity.</p> : null}</div>
          <div><Label htmlFor="gig-title">Title</Label><Input id="gig-title" maxLength={100} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={form.kind === "offer" ? "e.g. Weekend bike tune-ups" : "e.g. Help fixing a leaky tap"} /></div>
          <div><Label htmlFor="gig-category">Category</Label><select id="gig-category" className="mt-1 flex h-10 w-full rounded-xl border bg-background px-3 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as CommunityGigCategory })}>{gigCategories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
          <div><Label htmlFor="gig-description">Description</Label><Textarea id="gig-description" maxLength={2000} rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What would be useful to know?" /><p className="mt-1 text-xs text-muted-foreground">Please don’t include precise addresses or sensitive personal details.</p></div>
          <div><Label htmlFor="gig-rate">Rate or budget note <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="gig-rate" maxLength={120} value={form.rateNote} onChange={(e) => setForm({ ...form, rateNote: e.target.value })} placeholder="Free-form note, if useful" /></div>
        </div>
        <DialogFooter><Button className="rounded-full" disabled={!valid || create.isPending} onClick={() => create.mutate({ data: { communityId: form.communityId, kind: form.kind, title: form.title.trim(), category: form.category, description: form.description.trim(), ...(form.rateNote.trim() ? { rateNote: form.rateNote.trim() } : {}) } })}>
          {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Publish listing
        </Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GigCard({ gig, onOpen }: { gig: CommunityGig; onOpen: (gig: CommunityGig) => void }) {
  const me = useMe();
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const close = useCloseCommunityGig({ mutation: {
    onSuccess: () => { invalidate("/api/community-gigs"); toast({ title: "Listing closed" }); },
    onError: (e) => toast({ title: "Couldn't close listing", description: errMessage(e), variant: "destructive" }),
  } });
  const complete = useCompleteCommunityGig({ mutation: {
    onSuccess: () => { invalidate("/api/community-gigs"); toast({ title: "Marked complete", description: "Thanks for helping your community." }); },
    onError: (e) => toast({ title: "Couldn't mark complete", description: errMessage(e), variant: "destructive" }),
  } });
  const isAuthor = gig.author.id === me.id;
  const isResponder = gig.myResponseState === "accepted";
  const matched = gig.state === "matched";
  const stateCopy = { open: "Open", matched: "Matched", completed: "Completed", closed: "Closed" }[gig.state];
  return (
    <article className="group flex min-w-0 flex-col rounded-[1.5rem] border bg-card p-5 transition-transform hover:-translate-y-0.5" data-testid={`card-gig-${gig.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", gig.kind === "offer" ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground")}>
          {gig.kind === "offer" ? <Sparkles className="h-3.5 w-3.5" /> : <HandHeart className="h-3.5 w-3.5" />}{gig.kind === "offer" ? "Skill offered" : "Help requested"}
        </span>
        <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">{stateCopy}</span>
      </div>
      <div className="mt-4 flex items-start gap-3">
        <UserAvatar id={gig.author.id} name={gig.author.name} src={gig.author.avatarUrl} online={gig.author.online} size="sm" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl font-semibold leading-tight">{gig.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{gig.author.name} · {gig.communityName} · {relTime(gig.createdAt)}</p>
        </div>
      </div>
      <p className="mt-4 line-clamp-3 flex-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{gig.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-muted px-2.5 py-1">{categoryLabel(gig.category)}</span>
        {gig.rateNote ? <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1"><CircleDollarSign className="h-3.5 w-3.5" />{gig.rateNote}</span> : null}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
        <span className="mr-auto text-xs text-muted-foreground">{gig.responseCount} response{gig.responseCount === 1 ? "" : "s"}{gig.myResponseState === "pending" ? " · You responded" : gig.myResponseState === "accepted" ? " · You’re matched" : ""}</span>
        {isAuthor ? <Button size="sm" variant="outline" className="rounded-full" onClick={() => onOpen(gig)}><MessageCircle className="mr-1.5 h-4 w-4" /> Responses</Button>
          : gig.myResponseId ? <Button size="sm" variant="outline" className="rounded-full" disabled>{gig.myResponseState === "accepted" ? "Matched with you" : gig.myResponseState === "declined" ? "Response declined" : "Response sent"}</Button>
          : gig.state === "open" ? <Button size="sm" className="rounded-full" onClick={() => onOpen(gig)}><MessageCircle className="mr-1.5 h-4 w-4" /> Introduce yourself</Button>
          : matched && isResponder ? <Button size="sm" variant="outline" className="rounded-full" onClick={() => complete.mutate({ gigId: gig.id })} disabled={complete.isPending}>Mark complete</Button> : null}
        {isAuthor && gig.state === "open" ? <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" disabled={close.isPending} onClick={() => close.mutate({ gigId: gig.id })}>Close listing</Button> : null}
        {isAuthor && matched ? <Button size="sm" variant="outline" className="rounded-full" disabled={complete.isPending} onClick={() => complete.mutate({ gigId: gig.id })}>Mark complete</Button> : null}
      </div>
    </article>
  );
}

function GigDetailsDialog({ gig, onClose }: { gig: CommunityGig | null; onClose: () => void }) {
  const me = useMe();
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const gigId = gig?.id ?? "";
  const isAuthor = !!gig && gig.author.id === me.id;
  const responses = useListCommunityGigResponses(gigId, { query: { enabled: !!gig && isAuthor, queryKey: getListCommunityGigResponsesQueryKey(gigId), refetchInterval: 15_000 } });
  const [message, setMessage] = useState("");
  useEffect(() => { setMessage(""); }, [gigId]);
  const createResponse = useCreateCommunityGigResponse({ mutation: {
    onSuccess: () => { invalidate("/api/community-gigs"); toast({ title: "Introduction sent", description: "Only the listing author can see your message." }); setMessage(""); onClose(); },
    onError: (e) => toast({ title: "Couldn't send your introduction", description: errMessage(e), variant: "destructive" }),
  } });
  const decide = useDecideCommunityGigResponse({ mutation: {
    onSuccess: () => { invalidate("/api/community-gigs", `/api/community-gigs/${gigId}/responses`); toast({ title: "Response updated" }); },
    onError: (e) => toast({ title: "Couldn't update response", description: errMessage(e), variant: "destructive" }),
  } });
  const canRespond = !!gig && !isAuthor && gig.state === "open" && !gig.myResponseId;
  return (
    <Dialog open={!!gig} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto rounded-3xl sm:max-w-xl">
        <DialogHeader><DialogTitle className="font-display text-2xl">{isAuthor ? "Private responses" : "A note to the author"}</DialogTitle><DialogDescription>{gig?.title} · {gig?.communityName}</DialogDescription></DialogHeader>
        {isAuthor ? <div className="space-y-3">
          <p className="rounded-xl bg-muted/70 p-3 text-xs text-muted-foreground"><Lock className="mr-1 inline h-3.5 w-3.5" />Only you, the listing author, can read these private messages.</p>
          {responses.isLoading ? <Skeleton className="h-20 w-full" /> : null}
          {responses.isError ? <ErrorState error={responses.error} onRetry={() => responses.refetch()} /> : null}
          {responses.data?.length === 0 ? <div className="rounded-2xl border border-dashed p-7 text-center"><MessageCircle className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 text-sm font-medium">No introductions yet</p><p className="mt-1 text-xs text-muted-foreground">New responses will appear here, visible only to you.</p></div> : null}
          {responses.data?.map((response) => <div key={response.id} className="rounded-2xl border p-4">
            <div className="flex items-center gap-3"><UserAvatar id={response.author.id} name={response.author.name} src={response.author.avatarUrl} online={response.author.online} size="sm" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{response.author.name}</p><p className="text-xs text-muted-foreground">{relTime(response.createdAt)} · {response.state}</p></div>{response.state === "pending" && gig?.state === "open" ? <div className="flex gap-1"><Button size="icon" variant="outline" className="h-8 w-8 rounded-full" aria-label={`Decline ${response.author.name}`} disabled={decide.isPending} onClick={() => decide.mutate({ gigId, responseId: response.id, data: { accept: false } })}><X className="h-4 w-4" /></Button><Button size="icon" className="h-8 w-8 rounded-full" aria-label={`Accept ${response.author.name}`} disabled={decide.isPending} onClick={() => decide.mutate({ gigId, responseId: response.id, data: { accept: true } })}><Check className="h-4 w-4" /></Button></div> : null}</div>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{response.message}</p>
          </div>)}
        </div> : canRespond ? <div className="space-y-3">
          <p className="rounded-xl bg-primary/5 p-3 text-sm text-muted-foreground"><ShieldCheck className="mr-1 inline h-4 w-4 text-primary" />Your introduction is private. Only the person who posted this listing can see it.</p>
          <div><Label htmlFor="gig-response">Your introduction</Label><Textarea id="gig-response" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1200} rows={5} placeholder="Share a little about how you could help or what you’d like to know." /><p className="mt-1 text-right text-xs text-muted-foreground">{message.length}/1200</p></div>
        </div> : <p className="rounded-2xl bg-muted/60 p-5 text-sm text-muted-foreground">{gig?.myResponseState === "pending" ? "Your introduction is with the listing author. They’re the only person who can read it." : gig?.myResponseState === "accepted" ? "You’re matched. Coordinate directly and mark this complete when you’re done." : gig?.myResponseState === "declined" ? "The listing author has declined this response." : "This listing is no longer open for introductions."}</p>}
        <DialogFooter>{canRespond ? <Button className="rounded-full" disabled={message.trim().length < 2 || createResponse.isPending} onClick={() => createResponse.mutate({ gigId, data: { message: message.trim() } })}>{createResponse.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Send private introduction</Button> : null}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Marketplace({ communities }: { communities: Community[] }) {
  const [scope, setScope] = useState<"community" | "mine">("community");
  const [kind, setKind] = useState<"all" | "offer" | "request">("all");
  const [category, setCategory] = useState("");
  const [communityId, setCommunityId] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedGig, setSelectedGig] = useState<CommunityGig | null>(null);
  const poll = usePollInterval(30_000);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300); return () => window.clearTimeout(timer); }, [search]);
  const params = useMemo(() => ({
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...(communityId ? { communityId } : {}),
    ...(kind !== "all" ? { kind } : {}),
    ...(category ? { category: category as CommunityGigCategory } : {}),
    scope,
  }), [debouncedSearch, communityId, kind, category, scope]);
  const list = useListCommunityGigs(params, { query: { queryKey: getListCommunityGigsQueryKey(params), refetchInterval: poll } });
  return (
    <section className="mt-12 scroll-mt-6" aria-labelledby="marketplace-title">
      <div className="relative overflow-hidden rounded-[2rem] border bg-accent/25 p-5 sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full border-[24px] border-primary/5" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl"><span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.22em] text-primary"><HeartHandshake className="h-4 w-4" /> Neighbourhood exchange</span>
            <h2 id="marketplace-title" className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Good at something?<br className="hidden sm:block" /> Good people are nearby.</h2>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">Find a helping hand or offer your know-how to the communities you call home.</p>
          </div>
          <Button className="shrink-0 self-start rounded-full sm:self-auto" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Post an opportunity</Button>
        </div>
        <p className="relative mt-5 flex items-center gap-2 rounded-xl border border-primary/10 bg-background/70 px-3 py-2.5 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" />Payment is arranged between members; VastMind checkout and payouts aren’t enabled yet.</p>
      </div>
      <div className="mt-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-full border bg-card p-1" role="tablist" aria-label="Opportunity view">
            {([["community", "Community listings"], ["mine", "My opportunities"]] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={scope === value} onClick={() => setScope(value)} className={cn("rounded-full px-4 py-2 text-sm transition-colors", scope === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{label}</button>)}
          </div>
          <p className="text-xs text-muted-foreground">Messages on responses are private to the listing author.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(140px,auto))]">
          <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search opportunities" className="h-10 rounded-full bg-card pl-10" aria-label="Search opportunities" /></div>
          <select aria-label="Filter by community" value={communityId} onChange={(e) => setCommunityId(e.target.value)} className="h-10 rounded-full border bg-card px-4 text-sm"><option value="">All communities</option>{communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select aria-label="Filter by offer or request" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="h-10 rounded-full border bg-card px-4 text-sm"><option value="all">Offers & requests</option><option value="offer">Skill offers</option><option value="request">Help requests</option></select>
          <select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 rounded-full border bg-card px-4 text-sm"><option value="">All categories</option>{gigCategories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
        </div>
      </div>
      <div className="mt-5">
        {list.isLoading ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-64 rounded-3xl" /><Skeleton className="h-64 rounded-3xl" /></div> : null}
        {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : null}
        {!list.isLoading && !list.isError && list.data?.length === 0 ? <div className="rounded-[1.5rem] border border-dashed bg-card/70 px-6 py-12 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><HandHeart className="h-6 w-6" /></div><h3 className="mt-4 font-display text-xl font-semibold">{scope === "mine" ? "Your next opportunity starts here" : "Nothing posted just yet"}</h3><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{scope === "mine" ? "Post a skill you can share, or ask your community for a hand." : "Try another filter, or be the first to offer a skill or request help."}</p><Button className="mt-5 rounded-full" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Post an opportunity</Button></div> : null}
        {list.data?.length ? <div className="grid gap-4 md:grid-cols-2">{list.data.map((gig) => <GigCard key={gig.id} gig={gig} onOpen={setSelectedGig} />)}</div> : null}
      </div>
      <CreateGigDialog open={createOpen} onOpenChange={setCreateOpen} communities={communities} />
      <GigDetailsDialog gig={selectedGig} onClose={() => setSelectedGig(null)} />
    </section>
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
      <section aria-label="Discover communities">
        <div className="relative mt-6"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search communities" className="h-11 rounded-full bg-card pl-10" aria-label="Search communities" data-testid="input-search-communities" /></div>
        {categories.length ? <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Community categories">
          <button onClick={() => setCategory(null)} className={cn("rounded-full border px-3 py-1 text-sm", !category ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>All</button>
          {categories.map((c) => <button key={c} onClick={() => setCategory(c === category ? null : c)} className={cn("rounded-full border px-3 py-1 text-sm", category === c ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{c}</button>)}
        </div> : null}
        <div className="mt-6">
          {list.isLoading ? <CardSkeleton /> : null}
          {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : null}
          {list.data?.length === 0 ? <EmptyState icon={UsersRound} title={dq || category ? "No matches" : "No communities yet"} body={dq || category ? "Try a different search or category." : "Start the first one — your street, your club, your cause."} action={<Button className="rounded-full" onClick={() => setCreateOpen(true)}>Start a community</Button>} /> : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{list.data?.map((c, i) => <CommunityCard key={c.id} c={c} i={i} onRequests={setReqFor} />)}</div>
        </div>
      </section>
      <Marketplace communities={all.data ?? []} />
      <CreateCommunityDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RequestsDialog community={reqFor} onClose={() => setReqFor(null)} />
    </PageScroll>
  );
}
