"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Globe2, LoaderCircle, Monitor, RotateCw, ShieldCheck, Smartphone } from "lucide-react";
import {
  getListIdentitySessionsQueryKey,
  useListIdentitySessions,
  useRevokeIdentitySession,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

type SessionItem = {
  id: string;
  kind: "web" | "mobile";
  createdAt: string;
  expiresAt: string;
  current: boolean;
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** Session controls expose only a coarse app/browser label and session dates. */
export function SessionManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<SessionItem | null>(null);
  const sessions = useListIdentitySessions({
    query: { queryKey: getListIdentitySessionsQueryKey(), refetchOnWindowFocus: true },
  });
  const revoke = useRevokeIdentitySession({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListIdentitySessionsQueryKey() });
        setSelected(null);
        toast({ title: "Session ended" });
      },
      onError: () => toast({
        title: "Couldn't end this session",
        description: "Refresh the list and try again.",
        variant: "destructive",
      }),
    },
  });

  const items = [...(sessions.data?.items ?? [])].sort(
    (left, right) => Number(right.current) - Number(left.current)
      || Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );

  return (
    <section className="rounded-2xl border bg-card p-6" aria-labelledby="signed-in-sessions-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 id="signed-in-sessions-title" className="font-display text-xl font-semibold">Signed-in devices</h2>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void sessions.refetch()}
          disabled={sessions.isFetching}
          aria-label="Refresh signed-in devices"
        >
          {sessions.isFetching ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Review active VastMind and legacy sign-ins. This screen shows only app or browser type and dates—not IP addresses, precise location, browser details, or device fingerprints.
      </p>

      {sessions.isLoading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading active sessions…
        </div>
      ) : sessions.isError ? (
        <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <p className="text-sm font-medium">Sessions couldn’t be loaded.</p>
          <Button type="button" variant="link" className="mt-1 h-auto p-0" onClick={() => void sessions.refetch()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          No active sessions were found for this account.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {items.map((session) => {
            const DeviceIcon = session.kind === "mobile" ? Smartphone : session.kind === "web" ? Globe2 : Monitor;
            return (
              <li key={session.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <DeviceIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{session.kind === "mobile" ? "VastMind app" : "Web browser"}</p>
                    {session.current ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">This session</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Signed in {formatDate(session.createdAt)}</p>
                  <p className="text-xs text-muted-foreground">Expires {formatDate(session.expiresAt)}</p>
                </div>
                {session.current ? (
                  <span className="text-sm text-muted-foreground">Sign out here to end</span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelected(session)}
                    disabled={revoke.isPending}
                    aria-label={`End ${session.kind === "mobile" ? "VastMind app" : "web browser"} session`}
                  >
                    End session
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this session?</AlertDialogTitle>
            <AlertDialogDescription>
              {selected?.kind === "mobile" ? "That VastMind app" : "That browser"} will be signed out and must sign in again to access this account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending}>Keep session</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!selected || revoke.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (selected) revoke.mutate({ sessionId: selected.id });
              }}
            >
              {revoke.isPending ? "Ending…" : "End session"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
