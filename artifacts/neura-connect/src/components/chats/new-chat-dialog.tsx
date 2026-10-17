"use client";
import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { useCreateChat, type UserSummary } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { UserSearch } from "@/components/user-search";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";
import { useInvalidate } from "@/lib/realtime";

// ---------- Start a direct or group conversation ----------
export function NewChatDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const [mode, setMode] = useState<"private" | "group">("private");
  const [picked, setPicked] = useState<UserSummary[]>([]);
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const create = useCreateChat({
    mutation: {
      onSuccess: (c) => {
        invalidate("/api/chats");
        reset();
        onOpenChange(false);
        onCreated(c.id);
      },
      onError: (e) => toast({ title: "Couldn't start chat", description: errMessage(e), variant: "destructive" }),
    },
  });
  function reset() { setPicked([]); setName(""); setMode("private"); setIsPrivate(true); }

  function pick(u: UserSummary) {
    if (mode === "private") {
      create.mutate({ data: { type: "private", memberIds: [u.id] } });
      return;
    }
    setPicked((p) => (p.some((x) => x.id === u.id) ? p.filter((x) => x.id !== u.id) : [...p, u]));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">New conversation</DialogTitle>
          <DialogDescription>Message one person, or patch a few into a group.</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => { setMode(v as "private" | "group"); setPicked([]); }}>
          <TabsList className="grid w-full grid-cols-2 rounded-xl">
            <TabsTrigger value="private" data-testid="tab-direct">Direct</TabsTrigger>
            <TabsTrigger value="group" data-testid="tab-group">Group</TabsTrigger>
          </TabsList>
        </Tabs>
        {mode === "group" ? (
          <div className="space-y-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Group name (e.g. Saturday 5-a-side)" aria-label="Group name" data-testid="input-group-name" />
            <div className="flex items-center justify-between rounded-xl border p-3">
              <Label htmlFor="grp-private" className="text-sm">Private group<span className="block text-xs font-normal text-muted-foreground">Only admins can add people</span></Label>
              <Switch id="grp-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
            </div>
            {picked.length ? (
              <div className="flex flex-wrap gap-1.5">
                {picked.map((u) => (
                  <button key={u.id} onClick={() => pick(u)} className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {u.name}<X className="h-3 w-3" aria-label={`Remove ${u.name}`} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <UserSearch onPick={pick} selectedIds={picked.map((p) => p.id)} autoFocus />
        {mode === "group" ? (
          <Button disabled={!picked.length || create.isPending} className="w-full rounded-full"
            onClick={() => create.mutate({ data: { type: "group", name: name.trim() || null, isPrivate, memberIds: picked.map((p) => p.id) } })} data-testid="button-create-group">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create group · {picked.length} {picked.length === 1 ? "person" : "people"}
          </Button>
        ) : create.isPending ? <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Opening chat…</p> : null}
      </DialogContent>
    </Dialog>
  );
}
