"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, CircleDollarSign, Clock3, ExternalLink, Megaphone, ShieldCheck, Sparkles, X } from "lucide-react";
import {
  getGetGrowthOverviewQueryKey, getGetGrowthReviewQueueQueryKey, getGetGrowthVerificationQueryKey,
  useCreateGrowthPromotion, useGetGrowthOverview, useGetGrowthReviewQueue, useGetGrowthVerification,
  useReviewGrowthVerification, useSubmitGrowthVerification, useUpdateGrowthPromotion,
  type GrowthPromotionInput, type GrowthPromotionTargetType,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageScroll } from "@/components/page-scroll";
import { ErrorState } from "@/components/states";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";
import { cn } from "@/lib/utils";

const moneyLabel = (minor?: number | null, currency?: string | null) => {
  if (minor == null || !currency) return "No budget set";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100); }
  catch { return `${currency} ${(minor / 100).toFixed(2)}`; }
};
const targetNames: Record<GrowthPromotionTargetType, string> = { post: "Feed post", channel: "Channel", product: "Product" };

function GrowthContent() {
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const overview = useGetGrowthOverview({ query: { queryKey: getGetGrowthOverviewQueryKey(), refetchOnMount: "always" } });
  const verification = useGetGrowthVerification({ query: { queryKey: getGetGrowthVerificationQueryKey(), refetchOnMount: "always" } });
  const reviewer = !!overview.data?.isPlatformReviewer;
  const queue = useGetGrowthReviewQueue({ query: { enabled: reviewer, queryKey: getGetGrowthReviewQueueQueryKey(), refetchOnMount: "always" } });
  const [promotionOpen, setPromotionOpen] = useState(!!params.get("targetId"));
  const [verifyForm, setVerifyForm] = useState({ businessName: "", website: "", reason: "" });
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const verificationInitialized = useRef(false);
  useEffect(() => {
    if (verification.data && !verificationInitialized.current) {
      verificationInitialized.current = true;
      setVerifyForm({ businessName: verification.data.businessName, website: verification.data.website, reason: verification.data.reason });
    }
  }, [verification.data]);

  const refreshGrowth = () => {
    void queryClient.invalidateQueries({ queryKey: getGetGrowthOverviewQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetGrowthVerificationQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetGrowthReviewQueueQueryKey() });
  };
  const createPromotion = useCreateGrowthPromotion({ mutation: {
    onSuccess: () => { refreshGrowth(); setPromotionOpen(false); toast({ title: "Promotion draft saved", description: "It remains a draft while billing is unavailable." }); },
    onError: (error) => toast({ title: "Draft did not save", description: errMessage(error), variant: "destructive" }),
  } });
  const cancelPromotion = useUpdateGrowthPromotion({ mutation: {
    onSuccess: () => { refreshGrowth(); toast({ title: "Draft cancelled" }); },
    onError: (error) => toast({ title: "Could not cancel draft", description: errMessage(error), variant: "destructive" }),
  } });
  const submitVerification = useSubmitGrowthVerification({ mutation: {
    onSuccess: () => { refreshGrowth(); toast({ title: "Application submitted", description: "A reviewer will assess it manually." }); },
    onError: (error) => toast({ title: "Application did not submit", description: errMessage(error), variant: "destructive" }),
  } });
  const reviewApplication = useReviewGrowthVerification({ mutation: {
    onSuccess: () => { refreshGrowth(); toast({ title: "Review recorded" }); },
    onError: (error) => toast({ title: "Review did not save", description: errMessage(error), variant: "destructive" }),
  } });

  if (overview.isLoading || verification.isLoading) return <PageScroll className="max-w-6xl"><Skeleton className="h-52 rounded-[2rem]" /><div className="mt-5 grid gap-4 md:grid-cols-2"><Skeleton className="h-64 rounded-3xl" /><Skeleton className="h-64 rounded-3xl" /></div></PageScroll>;
  if (overview.isError) return <PageScroll className="max-w-6xl"><ErrorState error={overview.error} onRetry={() => overview.refetch()} /></PageScroll>;
  if (verification.isError) return <PageScroll className="max-w-6xl"><ErrorState error={verification.error} onRetry={() => verification.refetch()} /></PageScroll>;
  if (!overview.data || !verification.data) return null;
  const data = overview.data;
  const targetType = (params.get("targetType") ?? "post") as GrowthPromotionTargetType;
  const targetId = params.get("targetId") ?? "";
  const targetName = params.get("name") ?? "";

  function onCreatePromotion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const budget = String(form.get("budget") ?? "").trim();
    const currency = String(form.get("currency") ?? "").trim().toUpperCase();
    if (budget && !/^[A-Z]{3}$/.test(currency)) {
      toast({ title: "Choose a currency", description: "Enter a three-letter currency code for the optional planning amount.", variant: "destructive" });
      return;
    }
    const input: GrowthPromotionInput = {
      targetType: String(form.get("targetType")) as GrowthPromotionTargetType,
      targetId: String(form.get("targetId")).trim(),
      name: String(form.get("name")).trim(),
      objective: String(form.get("objective")) as GrowthPromotionInput["objective"],
      durationDays: Number(form.get("durationDays")),
      ...(budget ? { desiredDailyBudgetMinor: Math.round(Number(budget) * 100) } : {}),
      ...(budget && currency ? { currency } : {}),
    };
    createPromotion.mutate({ data: input });
  }

  return <PageScroll className="max-w-6xl">
    <div className="mx-auto w-full">
      <Link href="/business" className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Business Center
      </Link>
      <header className="relative overflow-hidden rounded-[2rem] bg-[hsl(184_34%_18%)] px-6 py-7 text-[hsl(42_43%_96%)] sm:px-9 sm:py-9">
        <div aria-hidden className="absolute -right-10 -top-24 h-72 w-72 rounded-full border border-white/10" />
        <div aria-hidden className="absolute -right-1 top-5 h-48 w-48 rounded-full border border-white/10" />
        <div className="relative max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[.24em] text-[hsl(42_76%_68%)]">VastMind growth</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Make room to grow.</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">A clear home for your promotion drafts and business verification. No paid reach is running here.</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.07] px-3.5 py-2 text-xs font-medium"><ShieldCheck className="h-4 w-4 text-[hsl(42_76%_68%)]" />Billing is not available yet</span>
            <span className="rounded-full border border-white/15 px-3.5 py-2 text-xs text-white/75">Subscription: {data.subscriptionStatus.replace("_", " ")}</span>
            <Button onClick={() => setPromotionOpen(true)} className="rounded-full bg-[hsl(42_76%_68%)] px-5 text-[hsl(184_34%_18%)] hover:bg-[hsl(42_76%_74%)]" data-testid="button-new-growth-promotion"><Megaphone className="mr-2 h-4 w-4" />Create a draft</Button>
          </div>
        </div>
      </header>

      <section aria-labelledby="plan-heading" className="mt-6">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">01 / Entitlements</p><h2 id="plan-heading" className="mt-1 font-display text-2xl font-semibold">Your plan</h2></div>
          <span className="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">Current: {data.currentPlan}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.plans.map((plan, index) => <article key={plan.id} className={cn("rounded-[1.5rem] border bg-card p-5", plan.id === data.currentPlan && "border-primary/40 bg-primary/[.035]")}>
            <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Plan {String(index + 1).padStart(2, "0")}</p><h3 className="mt-1 font-display text-xl font-semibold">{plan.name}</h3></div>{plan.id === data.currentPlan ? <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">Current</span> : null}</div>
            <ul className="mt-4 space-y-2">{plan.features.map((feature) => <li key={feature} className="flex gap-2 text-sm text-muted-foreground"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(42_65%_52%)]" />{feature}</li>)}</ul>
            <Button disabled className="mt-5 w-full rounded-full" variant={plan.id === data.currentPlan ? "outline" : "secondary"} title="Plan changes are unavailable until billing is configured">{plan.id === data.currentPlan ? "Your current plan" : "Upgrade unavailable"}</Button>
          </article>)}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="promotions-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">02 / Drafts</p><h2 id="promotions-heading" className="mt-1 font-display text-2xl font-semibold">Promotion ideas</h2></div>
          <span className="text-xs text-muted-foreground">{data.promotions.length} saved</span>
        </div>
        {!data.promotions.length ? <div className="grid min-h-48 place-items-center rounded-[1.5rem] border border-dashed bg-card/60 px-5 text-center">
          <div><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></span><h3 className="mt-3 font-display text-lg font-semibold">Start with an idea</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">Save what you might want to promote. Drafts do not spend money or distribute content.</p><Button onClick={() => setPromotionOpen(true)} variant="outline" className="mt-4 rounded-full">Create a draft</Button></div>
        </div> : <div className="space-y-2">
          {data.promotions.map((promotion) => <article key={promotion.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(42_70%_91%)] text-[hsl(184_34%_20%)]"><Megaphone className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{promotion.name}</h3><span className="rounded-full bg-[hsl(42_70%_91%)] px-2 py-0.5 text-[10px] font-semibold text-[hsl(184_34%_20%)]">{promotion.state === "cancelled" ? "Cancelled" : "Draft"}</span></div><p className="mt-1 text-xs text-muted-foreground">{targetNames[promotion.targetType]} · {promotion.objective.replace("_", " ")} · {promotion.durationDays} days</p></div>
            <div className="flex items-center justify-between gap-3 sm:justify-end"><span className="text-xs text-muted-foreground">Desired budget: {moneyLabel(promotion.desiredDailyBudgetMinor, promotion.currency)}</span>{promotion.state !== "cancelled" ? <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" disabled={cancelPromotion.isPending} onClick={() => cancelPromotion.mutate({ promotionId: promotion.id, data: { state: "cancelled" } })}><X className="mr-1 h-3.5 w-3.5" />Cancel draft</Button> : <span className="text-xs text-muted-foreground">Cancelled</span>}</div>
          </article>)}
        </div>}
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted/60 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground"><CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0" />Billing is deliberately deferred. These are saved plans only—not active campaigns, spend, delivery, or performance reports.</p>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_.85fr]" aria-label="Business verification">
        <VerificationForm verification={verification.data} values={verifyForm} onChange={setVerifyForm} onSubmit={() => submitVerification.mutate({ data: verifyForm })} pending={submitVerification.isPending} />
        <aside className="rounded-[1.5rem] border bg-[hsl(185_38%_95%)] p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[hsl(184_34%_28%)]">Badge status</p>
          <h2 className="mt-2 flex items-center gap-2 font-display text-2xl font-semibold">{verification.data.state === "approved" ? <BadgeCheck className="h-6 w-6 text-[hsl(164_39%_35%)]" /> : <ShieldCheck className="h-6 w-6 text-[hsl(184_34%_35%)]" />}{verification.data.state.replace("_", " ")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[hsl(184_20%_32%)]">{verification.data.eligibleForBadge ? "Your business can be considered for a badge. Approval is manual and handled by VastMind reviewers." : "Verification is reviewed manually. Badge eligibility is checked by the server and cannot be enabled from this page."}</p>
          {verification.data.reviewNote ? <div className="mt-4 rounded-xl border border-[hsl(184_25%_82%)] bg-white/55 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(184_20%_38%)]">Reviewer note</p><p className="mt-1 text-sm">{verification.data.reviewNote}</p></div> : null}
          <div className="mt-5 flex items-start gap-2 border-t border-[hsl(184_25%_82%)] pt-4 text-xs leading-relaxed text-[hsl(184_20%_38%)]"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" />Badge approval is not automatic. The server requires an active paid subscription and a configured reviewer.</div>
        </aside>
      </section>

      {reviewer ? <section className="mt-8" aria-labelledby="review-queue-heading">
        <div className="mb-3"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">Reviewer tools</p><h2 id="review-queue-heading" className="mt-1 font-display text-2xl font-semibold">Verification queue</h2></div>
        {queue.isLoading ? <Skeleton className="h-40 rounded-2xl" /> : queue.isError ? <div className="rounded-2xl border bg-card p-4"><ErrorState error={queue.error} onRetry={() => queue.refetch()} /></div> : !queue.data?.length ? <div className="rounded-2xl border bg-card px-5 py-8 text-center text-sm text-muted-foreground">No applications waiting for review.</div> :
          <div className="space-y-3">{queue.data.map((item) => <article key={item.applicationId} className="rounded-2xl border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{item.businessName}</h3><p className="text-xs text-muted-foreground">{item.name} · @{item.username} · {new Date(item.createdAt).toLocaleDateString()}</p></div><a href={item.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">{item.website}<ExternalLink className="h-3 w-3" /></a></div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{item.reason}</p>
            <Label htmlFor={`review-note-${item.applicationId}`} className="mt-4 block">Review note</Label><Textarea id={`review-note-${item.applicationId}`} value={reviewNotes[item.applicationId] ?? ""} onChange={(e) => setReviewNotes((current) => ({ ...current, [item.applicationId]: e.target.value }))} maxLength={1000} rows={2} className="mt-1.5" placeholder="Share a concise decision note" />
            <div className="mt-3 flex justify-end gap-2"><Button variant="outline" className="rounded-full" disabled={reviewApplication.isPending} onClick={() => reviewApplication.mutate({ applicationId: item.applicationId, data: { decision: "rejected", reviewNote: reviewNotes[item.applicationId] ?? "" } })}>Reject</Button><Button className="rounded-full" disabled={reviewApplication.isPending} onClick={() => reviewApplication.mutate({ applicationId: item.applicationId, data: { decision: "approved", reviewNote: reviewNotes[item.applicationId] ?? "" } })}>Approve</Button></div>
          </article>)}</div>}
      </section> : null}

      {promotionOpen ? <PromotionDialog
        key={`${targetType}-${targetId}`}
        defaultType={targetType}
        defaultId={targetId}
        defaultName={targetName}
        busy={createPromotion.isPending}
        onClose={() => setPromotionOpen(false)}
        onSubmit={onCreatePromotion}
      /> : null}
    </div>
  </PageScroll>;
}

function VerificationForm({ verification, values, onChange, onSubmit, pending }: {
  verification: { state: string; businessName: string; website: string; reason: string };
  values: { businessName: string; website: string; reason: string };
  onChange: (value: { businessName: string; website: string; reason: string }) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  const locked = verification.state === "pending" || verification.state === "approved";
  const fields = locked ? { businessName: verification.businessName, website: verification.website, reason: verification.reason } : values;
  return <section className="rounded-[1.5rem] border bg-card p-5 sm:p-6" aria-labelledby="verification-heading">
    <p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">03 / Trust</p>
    <h2 id="verification-heading" className="mt-1 font-display text-2xl font-semibold">Business verification</h2>
    <p className="mt-1 text-sm text-muted-foreground">Tell us who you are. A person reviews every application.</p>
    <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div><Label htmlFor="growth-business-name">Business name</Label><Input id="growth-business-name" required minLength={2} maxLength={120} value={fields.businessName} disabled={locked} onChange={(e) => onChange({ ...values, businessName: e.target.value })} className="mt-1.5" /></div>
      <div><Label htmlFor="growth-business-website">Website</Label><Input id="growth-business-website" type="url" required maxLength={300} placeholder="https://yourbusiness.example" value={fields.website} disabled={locked} onChange={(e) => onChange({ ...values, website: e.target.value })} className="mt-1.5" /></div>
      <div><Label htmlFor="growth-business-reason">What should reviewers know?</Label><Textarea id="growth-business-reason" required minLength={20} maxLength={1500} rows={4} value={fields.reason} disabled={locked} onChange={(e) => onChange({ ...values, reason: e.target.value })} className="mt-1.5" placeholder="Describe your business and how people can verify it." /></div>
      {locked ? <p className="rounded-xl bg-muted px-3 py-2.5 text-xs text-muted-foreground">{verification.state === "approved" ? "This application has been approved. Contact support if the business details change." : "Your application is in the review queue."}</p> :
        <Button type="submit" className="w-full rounded-full" disabled={pending || values.businessName.trim().length < 2 || !values.website.trim() || values.reason.trim().length < 20}>{pending ? "Submitting application…" : verification.state === "rejected" ? "Resubmit for review" : "Submit for review"}</Button>}
    </form>
  </section>;
}

function PromotionDialog({ defaultType, defaultId, defaultName, busy, onClose, onSubmit }: {
  defaultType: GrowthPromotionTargetType; defaultId: string; defaultName: string; busy: boolean; onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-[1.75rem] p-5 sm:p-7">
      <DialogHeader className="text-left">
        <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">Save as a draft</p><DialogTitle className="mt-1 font-display text-2xl font-semibold">Promotion idea</DialogTitle></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close promotion form"><X className="h-4 w-4" /></Button></div>
        <DialogDescription className="mt-2 text-sm leading-relaxed">This only saves your plan. It will not activate, spend money, or distribute the selected content.</DialogDescription>
      </DialogHeader>
      <form className="mt-5 space-y-4" onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="promotion-target-type">Content type</Label><select id="promotion-target-type" name="targetType" defaultValue={defaultType} className="mt-1.5 h-10 w-full rounded-xl border bg-background px-3 text-sm">{Object.entries(targetNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
          <div><Label htmlFor="promotion-target-id">Content ID</Label><Input id="promotion-target-id" name="targetId" required defaultValue={defaultId} placeholder="Select or enter an ID" className="mt-1.5" /></div>
        </div>
        <div><Label htmlFor="promotion-name">Draft name</Label><Input id="promotion-name" name="name" required minLength={1} maxLength={120} defaultValue={defaultName ? `Promote ${defaultName}` : ""} placeholder="A name you will recognize" className="mt-1.5" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="promotion-objective">Intent</Label><select id="promotion-objective" name="objective" defaultValue={defaultType === "product" ? "product_clicks" : "reach"} className="mt-1.5 h-10 w-full rounded-xl border bg-background px-3 text-sm"><option value="reach">Introduce this to more people</option><option value="engagement">Invite conversation</option><option value="product_clicks">Help people find the product</option></select></div>
          <div><Label htmlFor="promotion-days">Draft duration</Label><select id="promotion-days" name="durationDays" defaultValue="7" className="mt-1.5 h-10 w-full rounded-xl border bg-background px-3 text-sm">{[3, 7, 14, 30].map((day) => <option key={day} value={day}>{day} days</option>)}</select></div>
        </div>
        <fieldset className="grid gap-4 rounded-2xl border bg-muted/30 p-4 sm:grid-cols-[1fr_110px]">
          <div><Label htmlFor="promotion-budget">Desired daily budget (optional)</Label><Input id="promotion-budget" name="budget" type="number" min="0" step="0.01" placeholder="Not set" className="mt-1.5" /></div>
          <div><Label htmlFor="promotion-currency">Currency</Label><Input id="promotion-currency" name="currency" maxLength={3} defaultValue="USD" className="mt-1.5 uppercase" /></div>
          <p className="sm:col-span-2 text-xs leading-relaxed text-muted-foreground">This is only an optional planning note. VastMind will not charge or run a promotion.</p>
        </fieldset>
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" className="rounded-full" onClick={onClose}>Keep browsing</Button><Button type="submit" className="rounded-full px-5" disabled={busy}>{busy ? "Saving draft…" : "Save draft"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

export default function BusinessGrowthPage() {
  return <Suspense fallback={<PageScroll className="max-w-6xl"><Skeleton className="h-52 rounded-[2rem]" /></PageScroll>}><GrowthContent /></Suspense>;
}
