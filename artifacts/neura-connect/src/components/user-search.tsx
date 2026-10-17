"use client";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useSearchUsers, getSearchUsersQueryKey, useGetSuggestedPeople, getGetSuggestedPeopleQueryKey, useToggleUserFollow, type UserSummary } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useInvalidate } from "@/lib/realtime";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";

// Debounced member search used by new chat + add member flows.
export function UserSearch({ onPick, selectedIds = [], excludeIds = [], autoFocus }: {
  onPick: (u: UserSummary) => void; selectedIds?: string[]; excludeIds?: string[]; autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const suggestions = useGetSuggestedPeople({ query: { queryKey: getGetSuggestedPeopleQueryKey(), enabled: !dq } });
  const follow = useToggleUserFollow({ mutation: {
    onSuccess: () => { invalidate("/api/users", "/api/feed", "/api/chats"); },
    onError: (error) => toast({ title: "Couldn't update follow", description: errMessage(error), variant: "destructive" }),
  } });
  useEffect(() => {
    const t = window.setTimeout(() => setDq(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const params = { q: dq };
  const res = useSearchUsers(params, { query: { enabled: dq.length > 0, queryKey: getSearchUsersQueryKey(params) } });
  const active = dq ? res : suggestions;
  const users = (active.data ?? []).filter((u) => !excludeIds.includes(u.id));
  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or @username" className="rounded-xl pl-9" aria-label="Search members" data-testid="input-user-search" />
      </div>
      <div className="mt-2 max-h-64 overflow-y-auto scrollbar-thin">
        {!dq ? <p className="px-2 py-3 text-xs text-muted-foreground">Suggested people · Shared communities first</p> : null}
        {active.isLoading ? <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div> : null}
        {active.isError ? <p className="px-2 py-6 text-center text-sm text-destructive">Couldn't load people. Try again.</p> : null}
        {active.data && users.length === 0 ? <p className="px-2 py-6 text-center text-sm text-muted-foreground">{dq ? `No one matches “${dq}”.` : "Invite your friends to join, or search by username."}</p> : null}
        {users.map((u) => {
          const on = selectedIds.includes(u.id);
          return (
            <div key={u.id} className="flex items-center gap-1">
            <button type="button" onClick={() => onPick(u)} data-testid={`button-pick-user-${u.id}`}
              className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted", on && "bg-primary/10")}>
              <UserAvatar id={u.id} name={u.name} src={u.avatarUrl} online={u.online} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{u.name}</span>
                <span className="block truncate text-xs text-muted-foreground">@{u.username}{u.mutualCommunities ? ` · ${u.mutualCommunities} shared communit${u.mutualCommunities === 1 ? "y" : "ies"}` : ""}</span>
              </span>
              {on ? <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">Added</span> : null}
            </button>
            <Button type="button" size="sm" variant={u.following ? "secondary" : "outline"}
              disabled={follow.isPending} aria-label={`${u.following ? "Unfollow" : "Follow"} ${u.name}`}
              onClick={() => follow.mutate({ userId: u.id })}>{u.following ? "Following" : "Follow"}</Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
