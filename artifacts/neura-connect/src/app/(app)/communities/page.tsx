"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check, Clock, HandHeart, HeartHandshake, Loader2, Lock, Mic, Plus, Search,
  ShieldCheck, UserCheck, UsersRound, X, MessageCircle, Sparkles, CircleDollarSign,
} from "lucide-react";
import {
  useListCommunities, getListCommunitiesQueryKey, useJoinCommunity,
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
    <article className="rise grid gap-3 border-b py-4 first:border-t sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }} data-testid={`card-community-${c.id}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-wide text-primary">{c.category}</span>
          <span className="flex items-center gap-1">{c.isPrivate ? <Lock className="h-3 w-3" /> : <UsersRound className="h-3 w-3" />}{c.isPrivate ? "Members by request" : "Open to join"}</span>
          <span>{c.memberCount} member{c.memberCount === 1 ? "" : "s"}</span>
          <span>{relTime(c.createdAt)}</span>
        </div>
        <Link href={`/videos?community=${c.id}`} className="mt-1 inline-block text-lg font-semibold leading-tight hover:text-primary">{c.name}</Link>
        <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-muted-foreground">{c.description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {owner ? <><span className="flex items-center gap-1 text-xs font-semibold text-primary"><UserCheck className="h-3.5 w-3.5" /> You manage this</span>
          {c.isPrivate ? <Button size="sm" variant="outline" onClick={() => onRequests(c)} data-testid={`button-requests-${c.id}`}><UserCheck className="mr-1 h-3.5 w-3.5" /> Requests</Button> : null}</>
          : c.membership === "member" ? <Button size="sm" variant="outline" asChild><Link href={`/videos?community=${c.id}`}><MessageCircle className="mr-1 h-3.5 w-3.5" /> Open discussion</Link></Button>
          : c.membership === "requested" ? <Button size="sm" variant="outline" disabled><Clock className="mr-1 h-3.5 w-3.5" /> Requested</Button>
          : <Button size="sm" disabled={join.isPending} onClick={() => join.mutate({ communityId: c.id })}>{join.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}{c.isPrivate ? "Request to join" : "Join"}</Button>}
        {c.membership === "member" ? <Button size="sm" variant="ghost" disabled={call.busy} onClick={() => call.startCall({ scope: "community", id: c.id, video: false, title: c.name })} data-testid={`button-voice-room-${c.id}`}><Mic className="mr-1 h-3.5 w-3.5" /> Voice room</Button> : null}
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
    <article className="grid min-w-0 gap-3 border-b bg-card px-4 py-4 transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" data-testid={`card-gig-${gig.id}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-semibold", gig.kind === "offer" ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground")}>
          {gig.kind === "offer" ? <Sparkles className="h-3.5 w-3.5" /> : <HandHeart className="h-3.5 w-3.5" />}{gig.kind === "offer" ? "Skill offered" : "Help requested"}
        </span>
        <span className="text-xs text-muted-foreground">{categoryLabel(gig.category)}</span>
        <span className="text-xs text-muted-foreground">{stateCopy}</span>
        {gig.rateNote ? <span className="inline-flex items-center gap-1 text-xs font-medium"><CircleDollarSign className="h-3.5 w-3.5" />{gig.rateNote}</span> : null}
        </div>
        <h3 className="mt-1 text-base font-semibold leading-tight">{gig.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{gig.description}</p>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <UserAvatar id={gig.author.id} name={gig.author.name} src={gig.author.avatarUrl} online={gig.author.online} size="sm" />
          <span>{gig.author.name}</span><span>·</span><span>{gig.communityName}</span><span>·</span><span>{relTime(gig.createdAt)}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span className="mr-auto text-xs text-muted-foreground sm:mr-2">{gig.responseCount} response{gig.responseCount === 1 ? "" : "s"}{gig.myResponseState === "pending" ? " · You responded" : gig.myResponseState === "accepted" ? " · Matched" : ""}</span>
        {isAuthor ? <Button size="sm" variant="outline" onClick={() => onOpen(gig)}><MessageCircle className="mr-1.5 h-4 w-4" /> Responses</Button>
          : gig.myResponseId ? <Button size="sm" variant="outline" disabled>{gig.myResponseState === "accepted" ? "Matched with you" : gig.myResponseState === "declined" ? "Response declined" : "Response sent"}</Button>
          : gig.state === "open" ? <Button size="sm" onClick={() => onOpen(gig)}><MessageCircle className="mr-1.5 h-4 w-4" /> Contact</Button>
          : matched && isResponder ? <Button size="sm" variant="outline" onClick={() => complete.mutate({ gigId: gig.id })} disabled={complete.isPending}>Mark complete</Button> : null}
        {isAuthor && gig.state === "open" ? <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={close.isPending} onClick={() => close.mutate({ gigId: gig.id })}>Close</Button> : null}
        {isAuthor && matched ? <Button size="sm" variant="outline" disabled={complete.isPending} onClick={() => complete.mutate({ gigId: gig.id })}>Mark complete</Button> : null}
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
    <section className="scroll-mt-6" aria-labelledby="marketplace-title">
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><HeartHandshake className="h-4 w-4" /> Community board</span>
          <h2 id="marketplace-title" className="mt-1 text-2xl font-semibold tracking-tight">Help wanted. Skills offered.</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Find local help or share what you know. Contact stays private until you choose to respond.</p>
        </div>
        <Button className="shrink-0" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Post a listing</Button>
      </div>
      <p className="mt-3 flex items-center gap-2 border-l-2 border-primary/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> Payment is arranged between members; VastMind checkout and payouts aren’t enabled yet.</p>
      <div className="mt-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex border-b" role="tablist" aria-label="Opportunity view">
            {([["community", "All listings"], ["mine", "My listings"]] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={scope === value} onClick={() => setScope(value)} className={cn("border-b-2 px-4 py-2 text-sm transition-colors", scope === value ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{label}</button>)}
          </div>
          <p className="text-xs text-muted-foreground">Messages on responses are private to the listing author.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(140px,auto))]">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search help and skills" className="h-10 rounded-md bg-card pl-9" aria-label="Search opportunities" /></div>
          <select aria-label="Filter by community" value={communityId} onChange={(e) => setCommunityId(e.target.value)} className="h-10 rounded-md border bg-card px-3 text-sm"><option value="">All communities</option>{communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select aria-label="Filter by offer or request" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="h-10 rounded-md border bg-card px-3 text-sm"><option value="all">Offers & requests</option><option value="offer">Skill offers</option><option value="request">Help requests</option></select>
          <select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 rounded-md border bg-card px-3 text-sm"><option value="">All categories</option>{gigCategories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
        </div>
      </div>
      <div className="mt-5">
        {list.isLoading ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-64 rounded-3xl" /><Skeleton className="h-64 rounded-3xl" /></div> : null}
        {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : null}
        {!list.isLoading && !list.isError && list.data?.length === 0 ? <div className="border-y border-dashed bg-card/40 px-6 py-10 text-center"><div className="mx-auto grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary"><HandHeart className="h-5 w-5" /></div><h3 className="mt-3 font-semibold">{scope === "mine" ? "No listings from you yet" : "No listings found"}</h3><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{scope === "mine" ? "Post a skill you can share, or ask your community for a hand." : "Try a different search or filter, or add the first listing."}</p><Button className="mt-4" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Post a listing</Button></div> : null}
        {list.data?.length ? <div className="border-t">{list.data.map((gig) => <GigCard key={gig.id} gig={gig} onOpen={setSelectedGig} />)}</div> : null}
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
  const [reqFor, setReqFor] = useState<Community | null>(null);
  useEffect(() => { const t = window.setTimeout(() => setDq(q.trim()), 300); return () => window.clearTimeout(t); }, [q]);
  const params = dq || category ? { ...(dq ? { q: dq } : {}), ...(category ? { category } : {}) } : undefined;
  const poll = usePollInterval(45_000);
  const list = useListCommunities(params, { query: { queryKey: getListCommunitiesQueryKey(params), refetchInterval: poll } });
  const all = useListCommunities(undefined, { query: { queryKey: getListCommunitiesQueryKey(), staleTime: 60_000 } });
  const categories = useMemo(() => Array.from(new Set((all.data ?? []).map((c) => c.category))).sort(), [all.data]);

  return (
    <PageScroll className="max-w-5xl">
      <PageHeader kicker="VastMind local" title="Community board" sub="Find neighbors, useful conversations, and local people ready to help. Browse listings first, then join a community." />
      <Marketplace communities={all.data ?? []} />
      <section aria-label="Discover communities">
        <div className="mt-12 border-b pb-4">
          <h2 className="text-xl font-semibold">Local groups and conversations</h2>
          <p className="mt-1 text-sm text-muted-foreground">Join open groups or request access to private communities.</p>
        </div>
        <div className="relative mt-4"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search local groups" className="h-10 max-w-xl rounded-md bg-card pl-9" aria-label="Search communities" data-testid="input-search-communities" /></div>
        {categories.length ? <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Community categories">
          <button onClick={() => setCategory(null)} className={cn("rounded-full border px-3 py-1 text-sm", !category ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>All</button>
          {categories.map((c) => <button key={c} onClick={() => setCategory(c === category ? null : c)} className={cn("rounded-full border px-3 py-1 text-sm", category === c ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{c}</button>)}
        </div> : null}
        <div className="mt-6">
          {list.isLoading ? <CardSkeleton /> : null}
          {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : null}
          {list.data?.length === 0 ? <EmptyState icon={UsersRound} title={dq || category ? "No matches" : "No groups listed yet"} body={dq || category ? "Try a different search or category." : "Check back soon, or browse the community board above."} /> : null}
          <div className="divide-y">{list.data?.map((c, i) => <CommunityCard key={c.id} c={c} i={i} onRequests={setReqFor} />)}</div>
        </div>
      </section>
      <RequestsDialog community={reqFor} onClose={() => setReqFor(null)} />
    </PageScroll>
  );
}
