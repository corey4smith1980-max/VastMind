"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays, Check, Clock3, HandHeart, Loader2, MapPin, Plus, Search,
  UserRoundCheck,
} from "lucide-react";
import {
  getListCommunityGigsQueryKey,
  getListCommunityGigResponsesQueryKey,
  useCloseCommunityGig,
  useCompleteCommunityGig,
  useCreateCommunityGig,
  useCreateCommunityGigResponse,
  useDecideCommunityGigResponse,
  useListCommunityGigResponses,
  useListCommunityGigs,
  type CommunityGig,
  type CommunityGigCategory,
  type CommunityGigCreate,
  type CommunityGigKind,
  type ListCommunityGigsParams,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useMe } from "@/lib/me";
import { errMessage, relTime } from "@/lib/format";

const CATEGORIES: { id: CommunityGigCategory; label: string }[] = [
  { id: "errands", label: "Help & errands" },
  { id: "home-repairs", label: "Home & repairs" },
  { id: "transport", label: "Driving & delivery" },
  { id: "learning", label: "Learning & tutoring" },
  { id: "creative", label: "Creative work" },
  { id: "technology", label: "Technology" },
  { id: "personal-care", label: "Personal care" },
  { id: "food-events", label: "Food & events" },
  { id: "childcare", label: "Child & pet care" },
  { id: "jobs", label: "Jobs & projects" },
  { id: "other", label: "Other" },
];

type Modal = "create" | "respond" | "manage" | null;
type KindFilter = CommunityGigKind | "all";
type CategoryFilter = CommunityGigCategory | "all";

/** Standalone local listings; no user-created community or payment account is required. */
export function CommunityMarketplace() {
  const me = useMe();
  const client = useQueryClient();
  const { toast } = useToast();
  const [modal, setModal] = useState<Modal>(null);
  const [activeGig, setActiveGig] = useState<CommunityGig | null>(null);
  const [kind, setKind] = useState<KindFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [draftKind, setDraftKind] = useState<CommunityGigCreate["kind"]>("request");
  const [draftCategory, setDraftCategory] = useState<CommunityGigCreate["category"]>("other");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rateNote, setRateNote] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [responseMessage, setResponseMessage] = useState("");

  const params = useMemo<ListCommunityGigsParams>(() => ({
    scope: "community",
    ...(search.trim() ? { q: search.trim() } : {}),
    ...(location.trim() ? { location: location.trim() } : {}),
    ...(kind !== "all" ? { kind } : {}),
    ...(category !== "all" ? { category } : {}),
  }), [category, kind, location, search]);
  const listings = useListCommunityGigs(params);
  const activeId = activeGig?.id ?? "";
  const responses = useListCommunityGigResponses(activeId, {
    query: { queryKey: getListCommunityGigResponsesQueryKey(activeId), enabled: modal === "manage" && activeGig?.author.id === me.id },
  });

  const refresh = () => {
    void client.invalidateQueries({ queryKey: getListCommunityGigsQueryKey() });
    if (activeId) void client.invalidateQueries({ queryKey: getListCommunityGigResponsesQueryKey(activeId) });
  };
  const fail = (titleText: string, error: unknown) => toast({
    title: titleText, description: errMessage(error), variant: "destructive",
  });
  const create = useCreateCommunityGig({ mutation: {
    onSuccess: () => {
      setModal(null); setTitle(""); setDescription(""); setRateNote(""); setLocationLabel(""); setDueDate("");
      refresh(); toast({ title: "Listing published", description: "Members can now respond privately." });
    },
    onError: error => fail("Couldn't publish listing", error),
  } });
  const respond = useCreateCommunityGigResponse({ mutation: {
    onSuccess: () => {
      setModal(null); setResponseMessage(""); refresh();
      toast({ title: "Response sent", description: "Only the listing owner can read it." });
    },
    onError: error => fail("Couldn't send response", error),
  } });
  const decide = useDecideCommunityGigResponse({ mutation: {
    onSuccess: refresh, onError: error => fail("Couldn't update response", error),
  } });
  const close = useCloseCommunityGig({ mutation: {
    onSuccess: refresh, onError: error => fail("Couldn't close listing", error),
  } });
  const complete = useCompleteCommunityGig({ mutation: {
    onSuccess: refresh, onError: error => fail("Couldn't complete listing", error),
  } });

  const showCreate = () => {
    setDraftKind("request"); setDraftCategory("other"); setModal("create");
  };
  const submitListing = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !description.trim()) return;
    create.mutate({ data: {
      kind: draftKind, category: draftCategory, title: title.trim(), description: description.trim(),
      ...(rateNote.trim() ? { rateNote: rateNote.trim() } : {}),
      ...(locationLabel.trim() ? { locationLabel: locationLabel.trim() } : {}),
      ...(dueDate ? { dueDate } : {}),
    } });
  };
  const submitResponse = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeGig || responseMessage.trim().length < 2) return;
    respond.mutate({ gigId: activeGig.id, data: { message: responseMessage.trim() } });
  };

  return (
    <section className="mx-auto w-full max-w-[900px] space-y-4" aria-label="Community opportunities">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border bg-card p-4 sm:p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Local opportunities</p>
          <h2 className="mt-1 font-display text-xl font-bold">Ask for help. Offer what you can do.</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">Share a task or skill listing, then review private responses and choose who to work with.</p>
        </div>
        <Button type="button" onClick={showCreate} className="rounded-full" data-testid="button-create-community-listing">
          <Plus className="mr-2 h-4 w-4" />Create listing
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_190px]">
        <label className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search tasks, skills, and services" aria-label="Search opportunities" className="h-11 rounded-full bg-card pl-10" />
        </label>
        <label className="relative">
          <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={location} onChange={event => setLocation(event.target.value)} placeholder="Filter by area" aria-label="Filter listings by area" className="h-11 rounded-full bg-card pl-9" />
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">Use a broad area such as a city and state or country. Don’t post a street address. Area labels are entered by members; VastMind does not look up or share IP-based location.</p>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter listings">
        {([["all", "All listings"], ["request", "Help requests"], ["offer", "Skills & services"]] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}
            className={`min-h-9 rounded-full border px-3.5 text-xs font-semibold ${kind === value ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}>
            {label}
          </button>
        ))}
        <select aria-label="Filter by category" value={category} onChange={event => setCategory(event.target.value as CategoryFilter)}
          className="h-9 rounded-full border bg-card px-3 text-xs font-medium">
          <option value="all">Every category</option>
          {CATEGORIES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </div>

      {listings.isLoading ? <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">Loading local listings…</div> : null}
      {listings.isError ? <div role="alert" className="rounded-2xl border border-destructive/40 bg-card p-5 text-sm">Couldn’t load opportunities. <button className="font-semibold text-primary underline" onClick={() => void listings.refetch()}>Try again</button></div> : null}
      {!listings.isLoading && !listings.isError && !listings.data?.length ? (
        <div className="rounded-2xl border bg-card px-6 py-12 text-center">
          <HandHeart className="mx-auto h-8 w-8 text-primary" />
          <h3 className="mt-3 font-display text-lg font-semibold">No listings match these filters</h3>
          <p className="mt-1 text-sm text-muted-foreground">Try another area or category, or be the first to post a request or skill.</p>
          <Button type="button" className="mt-4 rounded-full" onClick={showCreate}>Create a listing</Button>
        </div>
      ) : null}

      <div className="space-y-3">
        {listings.data?.map(gig => {
          const isOwner = gig.author.id === me.id;
          const canComplete = gig.state === "matched" && (isOwner || gig.myResponseState === "accepted");
          const canRespond = gig.state === "open" && !isOwner && !gig.myResponseId;
          return (
            <article key={gig.id} className="rounded-2xl border bg-card p-4 sm:p-5" data-testid={`community-listing-${gig.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${gig.kind === "request" ? "bg-primary/10 text-primary" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>{gig.kind === "request" ? "Help request" : "Skill or service"}</span>
                <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium">{CATEGORIES.find(item => item.id === gig.category)?.label ?? "Other"}</span>
                <span className="ml-auto rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground">{gig.state === "open" ? "Open" : gig.state === "matched" ? "Matched" : gig.state === "completed" ? "Completed" : "Closed"}</span>
              </div>
              <div className="mt-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold leading-snug">{gig.title}</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{gig.description}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    <span>{gig.author.name} · {relTime(gig.createdAt)}</span>
                    {gig.locationLabel ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{gig.locationLabel}</span> : null}
                    {gig.dueDate ? <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />Needed by {new Date(`${gig.dueDate}T12:00:00`).toLocaleDateString()}</span> : null}
                    {gig.rateNote ? <span>{gig.rateNote}</span> : null}
                  </div>
                  {gig.myResponseState ? <p className="mt-2 text-xs font-medium text-primary">Your response: {gig.myResponseState}</p> : null}
                  {gig.communityName ? <p className="mt-2 text-[11px] text-muted-foreground">Legacy group listing · {gig.communityName}</p> : null}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
                {canRespond ? <Button type="button" size="sm" className="rounded-full" onClick={() => { setActiveGig(gig); setResponseMessage(""); setModal("respond"); }}>Respond privately</Button> : null}
                {isOwner ? <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => { setActiveGig(gig); setModal("manage"); }}>
                  <UserRoundCheck className="mr-1.5 h-4 w-4" />Responses ({gig.responseCount})
                </Button> : null}
                {canComplete ? <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={complete.isPending} onClick={() => complete.mutate({ gigId: gig.id })}>
                  {complete.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Mark complete
                </Button> : null}
                {isOwner && gig.state === "open" ? <Button type="button" size="sm" variant="ghost" className="rounded-full text-muted-foreground" disabled={close.isPending} onClick={() => close.mutate({ gigId: gig.id })}>Close listing</Button> : null}
                {!isOwner && gig.state === "open" && gig.myResponseId ? <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />Response sent</span> : null}
              </div>
            </article>
          );
        })}
      </div>

      <Dialog open={modal !== null} onOpenChange={open => { if (!open) setModal(null); }}>
        <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto rounded-3xl p-5">
          <DialogHeader className="mb-4 text-left">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Community marketplace</p>
              <DialogTitle className="mt-1 font-display text-xl font-bold">
                {modal === "create" ? "Create a listing" : modal === "respond" ? "Send a private response" : "Manage responses"}
              </DialogTitle>
              <DialogDescription className="sr-only">Create an opportunity, respond privately, or review responses to your listing.</DialogDescription>
            </div>
          </DialogHeader>

          {modal === "create" ? <form className="space-y-4" onSubmit={submitListing}>
            <div className="grid grid-cols-2 gap-2">
              {([["request", "I need help"], ["offer", "I offer a skill or service"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={draftKind === value} onClick={() => setDraftKind(value)}
                className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${draftKind === value ? "border-primary bg-primary/10 text-primary" : "bg-card text-muted-foreground"}`}>{label}</button>)}
            </div>
            <label className="block space-y-1.5 text-sm font-medium">Category
              <select value={draftCategory} onChange={event => setDraftCategory(event.target.value as CommunityGigCreate["category"])} className="h-11 w-full rounded-xl border bg-background px-3">
                {CATEGORIES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5 text-sm font-medium">Title
              <Input required minLength={3} maxLength={100} value={title} onChange={event => setTitle(event.target.value)} placeholder={draftKind === "request" ? "What do you need done?" : "What skill or service do you offer?"} />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">Details
              <textarea required minLength={3} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} placeholder="Add the important details, availability, and how members should respond." className="min-h-28 w-full resize-y rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-sm font-medium">Broad area (optional)
                <Input maxLength={120} value={locationLabel} onChange={event => setLocationLabel(event.target.value)} placeholder="City, state or country" />
              </label>
              <label className="block space-y-1.5 text-sm font-medium">Needed by (optional)
                <Input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} />
              </label>
            </div>
            <label className="block space-y-1.5 text-sm font-medium">Rate or reward note (optional)
              <Input maxLength={120} value={rateNote} onChange={event => setRateNote(event.target.value)} placeholder="e.g. $80 fixed, negotiable, or free" />
            </label>
            <p className="rounded-xl bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">VastMind does not hold or process payment for this listing. Agree on terms directly and never share an exact address publicly.</p>
            <Button type="submit" className="w-full rounded-full" disabled={create.isPending}>
              {create.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Publishing…</> : "Publish listing"}
            </Button>
          </form> : null}

          {modal === "respond" && activeGig ? <form className="space-y-4" onSubmit={submitResponse}>
            <div className="rounded-xl bg-muted p-3">
              <p className="font-semibold">{activeGig.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{activeGig.kind === "request" ? "Tell the requester how you can help." : "Tell the provider about your needs."}</p>
            </div>
            <label className="block space-y-1.5 text-sm font-medium">Your message
              <textarea required minLength={2} maxLength={1200} value={responseMessage} onChange={event => setResponseMessage(event.target.value)} placeholder="Share your availability, relevant experience, and estimated completion time." className="min-h-28 w-full resize-y rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary" />
            </label>
            <p className="text-xs text-muted-foreground">Only the listing owner can read your response. VastMind does not process payment.</p>
            <Button type="submit" className="w-full rounded-full" disabled={respond.isPending || responseMessage.trim().length < 2}>
              {respond.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : "Send private response"}
            </Button>
          </form> : null}

          {modal === "manage" && activeGig ? <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{activeGig.responseCount} private response{activeGig.responseCount === 1 ? "" : "s"} for <span className="font-medium text-foreground">{activeGig.title}</span>.</p>
            {responses.isLoading ? <p className="text-sm text-muted-foreground">Loading responses…</p> : null}
            {responses.isError ? <p role="alert" className="text-sm text-destructive">Couldn’t load responses. <button className="underline" onClick={() => void responses.refetch()}>Retry</button></p> : null}
            {responses.data?.length === 0 ? <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">No responses yet.</p> : null}
            {responses.data?.map(response => <article key={response.id} className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{response.author.name}</p>
                <span className="text-xs capitalize text-muted-foreground">{response.state}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{response.message}</p>
              {activeGig.state === "open" && response.state === "pending" ? <div className="mt-3 flex gap-2">
                <Button type="button" size="sm" className="rounded-full" disabled={decide.isPending} onClick={() => decide.mutate({ gigId: activeGig.id, responseId: response.id, data: { accept: true } })}>Accept</Button>
                <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={decide.isPending} onClick={() => decide.mutate({ gigId: activeGig.id, responseId: response.id, data: { accept: false } })}>Decline</Button>
              </div> : null}
            </article>)}
          </div> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
