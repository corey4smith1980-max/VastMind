"use client";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Heart, MessageCircle, MessagesSquare, Radio, UsersRound } from "lucide-react";
import { useListNotifications, getListNotificationsQueryKey, useMarkNotificationRead, type NotificationType } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { PageScroll } from "@/components/page-scroll";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/states";
import { useToast } from "@/hooks/use-toast";
import { errMessage, relTime } from "@/lib/format";
import { useInvalidate, usePollInterval } from "@/lib/realtime";
import { cn } from "@/lib/utils";

const META: Record<NotificationType, { icon: typeof Bell; href: string }> = {
  message: { icon: MessagesSquare, href: "/chats" },
  reaction: { icon: Heart, href: "/feed" },
  comment: { icon: MessageCircle, href: "/feed" },
  community: { icon: UsersRound, href: "/communities" },
  channel: { icon: Radio, href: "/channels" },
};

// ---------- Notifications ----------
export default function NotificationsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const poll = usePollInterval(20_000);
  const list = useListNotifications({ query: { queryKey: getListNotificationsQueryKey(), refetchInterval: poll } });
  const mark = useMarkNotificationRead({
    mutation: { onSuccess: () => invalidate("/api/notifications"), onError: (e) => toast({ title: "Couldn't update", description: errMessage(e), variant: "destructive" }) },
  });
  const unread = (list.data ?? []).filter((n) => !n.read);

  async function markAll() {
    await Promise.all(unread.map((n) => mark.mutateAsync({ notificationId: n.id }).catch(() => null)));
  }

  return (
    <PageScroll>
      <PageHeader kicker="Switchboard log" title="Alerts" sub={unread.length ? `${unread.length} new since you last looked.` : "You're all caught up."}
        actions={unread.length ? <Button variant="outline" className="rounded-full" onClick={markAll} disabled={mark.isPending} data-testid="button-mark-all-read"><CheckCheck className="mr-1 h-4 w-4" /> Mark all read</Button> : null} />
      <div className="mt-6 overflow-hidden rounded-[1.6rem] border bg-card">
        {list.isLoading ? <RowSkeleton count={5} /> : null}
        {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : null}
        {list.data?.length === 0 ? <EmptyState icon={Bell} title="Nothing yet" body="Messages, reactions, comments and community news will land here." /> : null}
        <ul className="divide-y">
          {list.data?.map((n, i) => {
            const M = META[n.type] ?? { icon: Bell, href: "/chats" };
            return (
              <li key={n.id} className="rise" style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
                <button className={cn("flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/60", !n.read && "bg-primary/5")} data-testid={`row-notification-${n.id}`}
                  onClick={() => { if (!n.read) mark.mutate({ notificationId: n.id }); router.push(M.href); }}>
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", n.read ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground")}><M.icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2"><span className={cn("truncate", !n.read && "font-semibold")}>{n.title}</span><span className="shrink-0 font-mono text-[11px] text-muted-foreground">{relTime(n.createdAt)}</span></span>
                    <span className="line-clamp-2 text-sm text-muted-foreground">{n.body}</span>
                  </span>
                  {!n.read ? <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </PageScroll>
  );
}
