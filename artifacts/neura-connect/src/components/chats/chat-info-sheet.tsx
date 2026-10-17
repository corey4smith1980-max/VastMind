"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Crown, Flag, Link2, Loader2, LogOut, MoreHorizontal, ShieldOff, UserMinus, UserPlus } from "lucide-react";
import {
  useAddChatMember, useCreateChatInvite, useLeaveChat, useRemoveChatMember, type Conversation,
} from "@workspace/api-client-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserAvatar } from "@/components/user-avatar";
import { UserSearch } from "@/components/user-search";
import { BlockDialog, ReportDialog } from "@/components/safety-dialogs";
import { chatTitle } from "@/components/chats/helpers";
import { useToast } from "@/hooks/use-toast";
import { basePath } from "@/lib/base";
import { errMessage, relTime } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useInvalidate } from "@/lib/realtime";

// ---------- Conversation details: members, admin tools, invite, leave, safety ----------
export function ChatInfoSheet({ chat, open, onOpenChange }: { chat: Conversation; open: boolean; onOpenChange: (o: boolean) => void }) {
  const me = useMe();
  const router = useRouter();
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const [adding, setAdding] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [blockT, setBlockT] = useState<{ id: string; name: string } | null>(null);
  const [reportT, setReportT] = useState<{ id: string; name: string } | null>(null);
  const [invite, setInvite] = useState<string | null>(null);

  const myRole = chat.members.find((m) => m.user.id === me.id)?.role;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const isGroup = chat.type === "group";
  const onErr = (title: string) => (e: unknown) => toast({ title, description: errMessage(e), variant: "destructive" });

  const add = useAddChatMember({ mutation: { onSuccess: () => { invalidate("/api/chats"); toast({ title: "Member added" }); }, onError: onErr("Couldn't add member") } });
  const remove = useRemoveChatMember({ mutation: { onSuccess: () => { invalidate("/api/chats"); toast({ title: "Member removed" }); }, onError: onErr("Couldn't remove member") } });
  const leave = useLeaveChat({
    mutation: {
      onSuccess: () => { invalidate("/api/chats"); onOpenChange(false); router.replace("/chats"); toast({ title: "You left the conversation" }); },
      onError: onErr("Couldn't leave"),
    },
  });
  const createInvite = useCreateChatInvite({
    mutation: {
      onSuccess: (r) => setInvite(r.inviteUrl ?? `${window.location.origin}${basePath}/invite/${r.inviteCode}`),
      onError: onErr("Couldn't create invite"),
    },
  });

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast({ title: "Invite link copied" }); } catch { toast({ title: "Copy failed", description: text }); }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader className="items-center text-center">
            <SheetTitle className="font-display text-2xl">{chatTitle(chat, me.id)}</SheetTitle>
            <SheetDescription>
              {isGroup ? `${chat.memberCount} members · ${chat.isPrivate ? "private" : "open"} group` : "Direct conversation"} · since {relTime(chat.createdAt)}
            </SheetDescription>
          </SheetHeader>

          {/* Invite + add (groups) */}
          {isGroup ? (
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button variant="outline" className="rounded-xl" disabled={!isAdmin && chat.isPrivate} onClick={() => setAdding((a) => !a)} data-testid="button-add-member"><UserPlus className="mr-1 h-4 w-4" /> Add people</Button>
              <Button variant="outline" className="rounded-xl" disabled={createInvite.isPending || (!isAdmin && chat.isPrivate)} onClick={() => createInvite.mutate({ chatId: chat.id })} data-testid="button-create-invite">
                {createInvite.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Link2 className="mr-1 h-4 w-4" />} Invite link
              </Button>
            </div>
          ) : null}
          {isGroup && !isAdmin && chat.isPrivate ? <p className="mt-2 text-center text-xs text-muted-foreground">Only admins can add people to this private group.</p> : null}
          {invite ? (
            <div className="rise mt-3 flex items-center gap-2 rounded-xl border bg-muted/60 p-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs" data-testid="text-invite-url">{invite}</code>
              <Button size="sm" variant="secondary" onClick={() => copy(invite)}><Copy className="h-3.5 w-3.5" /></Button>
            </div>
          ) : null}
          {adding ? (
            <div className="rise mt-3 rounded-2xl border p-3">
              <UserSearch autoFocus excludeIds={chat.members.map((m) => m.user.id)} onPick={(u) => add.mutate({ chatId: chat.id, data: { userId: u.id } })} />
            </div>
          ) : null}

          {/* Members */}
          <h3 className="mt-6 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Members</h3>
          <ul className="mt-2 space-y-1">
            {chat.members.map((m) => {
              const self = m.user.id === me.id;
              return (
                <li key={m.user.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted" data-testid={`row-member-${m.user.id}`}>
                  <UserAvatar id={m.user.id} name={m.user.name} src={m.user.avatarUrl} online={m.user.online} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{m.user.name}{self ? " (you)" : ""}</span>
                    <span className="block text-xs text-muted-foreground">@{m.user.username}</span>
                  </span>
                  {m.role !== "member" ? (
                    <span className="flex items-center gap-1 rounded-full bg-accent/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                      {m.role === "owner" ? <Crown className="h-3 w-3" /> : null}{m.role}
                    </span>
                  ) : null}
                  {!self ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Actions for ${m.user.name}`}><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isGroup && isAdmin && m.role !== "owner" ? (
                          <>
                            <DropdownMenuItem onClick={() => remove.mutate({ chatId: chat.id, userId: m.user.id })} data-testid={`button-remove-member-${m.user.id}`}><UserMinus className="mr-2 h-4 w-4" /> Remove from group</DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        ) : null}
                        <DropdownMenuItem onClick={() => setReportT({ id: m.user.id, name: m.user.name })}><Flag className="mr-2 h-4 w-4" /> Report</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setBlockT({ id: m.user.id, name: m.user.name })}><ShieldOff className="mr-2 h-4 w-4" /> Block</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {isGroup ? (
            <Button variant="ghost" className="mt-6 w-full justify-start rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmLeave(true)} data-testid="button-leave-chat">
              <LogOut className="mr-2 h-4 w-4" /> Leave group
            </Button>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Leave this group?</AlertDialogTitle>
            <AlertDialogDescription>You'll stop receiving messages. Someone will need to add you back.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => leave.mutate({ chatId: chat.id })} data-testid="button-confirm-leave">Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <BlockDialog target={blockT} onClose={() => setBlockT(null)} />
      <ReportDialog target={reportT} onClose={() => setReportT(null)} />
    </>
  );
}
