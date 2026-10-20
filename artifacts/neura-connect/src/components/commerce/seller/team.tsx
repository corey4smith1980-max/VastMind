"use client";
import { useEffect, useState } from "react";
import { Loader2, Search, UserMinus, UserPlus, Users } from "lucide-react";
import {
  useCommerceListTeam, getCommerceListTeamQueryKey, useCommerceUpdateTeam, useSearchUsers, getSearchUsersQueryKey,
  type CommerceShop, type CommerceTeamInputRole, type CommerceTeamMember,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { UserAvatar } from "@/components/user-avatar";
import { useToast } from "@/hooks/use-toast";
import { useInvalidate } from "@/lib/realtime";
import { errMessage } from "@/lib/format";
import { cn } from "@/lib/utils";
import { selectClass } from "../bits";

const ROLES: { value: CommerceTeamInputRole; label: string; desc: string }[] = [
  { value: "manager", label: "Manager", desc: "Catalog, orders, marketing and settings" },
  { value: "fulfillment", label: "Fulfillment", desc: "Orders, payment records and tracking" },
  { value: "marketer", label: "Marketer", desc: "Dashboard, coupons, campaigns and customers" },
  { value: "creator", label: "Creator", desc: "Tags products in own posts, own campaign links. No payouts." },
];

export function Team({ shop }: { shop: CommerceShop }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const team = useCommerceListTeam(shop.id, { query: { queryKey: getCommerceListTeamQueryKey(shop.id) } });
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const t = window.setTimeout(() => setDq(q.trim()), 300); return () => window.clearTimeout(t); }, [q]);
  const [role, setRole] = useState<CommerceTeamInputRole>("marketer");
  const [removing, setRemoving] = useState<CommerceTeamMember | null>(null);
  const search = useSearchUsers({ q: dq }, { query: { queryKey: getSearchUsersQueryKey({ q: dq }), enabled: dq.length >= 2 } });
  const update = useCommerceUpdateTeam({ mutation: {
    onSuccess: (_list, v) => { invalidate("/api/commerce"); setRemoving(null); toast({ title: v.data.approved ? "Team member added" : "Removed from team" }); if (v.data.approved) setQ(""); },
    onError: (e) => toast({ title: "Couldn't update team", description: errMessage(e), variant: "destructive" }),
  } });
  const members = new Set(team.data?.map((m) => m.userId));

  return <section className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
    <div className="rounded-[1.4rem] border bg-card p-5">
      <h3 className="font-display text-xl font-semibold">Add someone</h3>
      <fieldset className="mt-3"><legend className="mb-2 text-sm font-medium">Role</legend>
        <div className="grid gap-2 sm:grid-cols-2">{ROLES.map((r) => <button key={r.value} type="button" aria-pressed={role === r.value} onClick={() => setRole(r.value)} className={cn("rounded-xl border p-3 text-left transition-all", role === r.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50")} data-testid={`button-role-${r.value}`}><span className="block text-sm font-semibold">{r.label}</span><span className="text-[11px] text-muted-foreground">{r.desc}</span></button>)}</div>
      </fieldset>
      <label className="relative mt-4 block"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people by name or username" className="h-10 rounded-full pl-9" aria-label="Search people" data-testid="input-team-search" /></label>
      <div className="mt-3 space-y-1.5">
        {dq.length >= 2 && search.isLoading ? <Skeleton className="h-12 rounded-xl" /> : null}
        {search.data && !search.data.length ? <p className="text-sm text-muted-foreground">No one matches that search.</p> : null}
        {dq.length >= 2 ? search.data?.slice(0, 8).map((u) => <div key={u.id} className="flex items-center gap-3 rounded-xl border p-2">
          <UserAvatar id={u.id} name={u.name} src={u.avatarUrl} size="sm" />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{u.name}</span><span className="text-xs text-muted-foreground">@{u.username}</span></span>
          {u.id === shop.ownerId ? <span className="text-xs text-muted-foreground">Owner</span> : <Button size="sm" className="rounded-full" disabled={update.isPending} onClick={() => update.mutate({ shopId: shop.id, data: { userId: u.id, role, approved: true } })} data-testid={`button-add-member-${u.id}`}>{update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="mr-1 h-3.5 w-3.5" />}{members.has(u.id) ? "Change role" : "Add"}</Button>}
        </div>) : null}
      </div>
    </div>
    <div>
      {team.isError ? <ErrorState error={team.error} onRetry={() => team.refetch()} /> : null}
      {team.isLoading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div> : null}
      {team.data && team.data.length <= 1 ? <EmptyState icon={Users} title="Just you for now" body="Invite people you trust. Each role only sees what it needs." /> : null}
      <ul className="space-y-2">{team.data?.map((m) => <li key={m.userId} className="rise flex items-center gap-3 rounded-2xl border bg-card p-3" data-testid={`row-member-${m.userId}`}>
        <UserAvatar id={m.userId} name={m.name} size="sm" />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{m.name}</span><span className="text-xs text-muted-foreground">@{m.username}</span></span>
        {m.role === "owner" ? <span className="rounded-full bg-foreground px-2.5 py-1 text-[11px] font-semibold text-background">Owner</span> : <>
          <select aria-label={`Role for ${m.name}`} className={cn(selectClass, "h-8 w-auto text-xs")} value={m.role} disabled={update.isPending} onChange={(e) => update.mutate({ shopId: shop.id, data: { userId: m.userId, role: e.target.value as CommerceTeamInputRole, approved: true } })}>{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
          <Button size="icon" variant="ghost" aria-label={`Remove ${m.name}`} onClick={() => setRemoving(m)}><UserMinus className="h-4 w-4" /></Button>
        </>}
      </li>)}</ul>
    </div>
    <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
      <DialogContent><DialogHeader><DialogTitle>Remove {removing?.name}?</DialogTitle><DialogDescription>They lose access to this shop immediately. Existing product tags on their posts stop showing if they were a creator.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button><Button variant="destructive" disabled={update.isPending} onClick={() => removing && removing.role !== "owner" && update.mutate({ shopId: shop.id, data: { userId: removing.userId, role: removing.role, approved: false } })} data-testid="button-confirm-remove-member">Remove</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
