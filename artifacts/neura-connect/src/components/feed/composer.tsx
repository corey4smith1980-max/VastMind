"use client";
import { useState } from "react";
import { BarChart3, ImageOff, Loader2, Plus, X } from "lucide-react";
import { useCreatePost, useListCommunities, getListCommunitiesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/user-avatar";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useInvalidate } from "@/lib/realtime";

// ---------- Post / poll composer ----------
export function Composer({ defaultCommunityId }: { defaultCommunityId?: string }) {
  const me = useMe();
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const [content, setContent] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [community, setCommunity] = useState<string>(defaultCommunityId ?? "none");
  const [poll, setPoll] = useState<string[] | null>(null);
  const communities = useListCommunities(undefined, { query: { queryKey: getListCommunitiesQueryKey(), staleTime: 60_000 } });
  const mine = (communities.data ?? []).filter((c) => c.membership === "member");

  const create = useCreatePost({
    mutation: {
      onSuccess: () => {
        invalidate("/api/feed");
        setContent(""); setPoll(null); setAnonymous(false);
        toast({ title: "Posted" });
      },
      onError: (e) => toast({ title: "Couldn't post", description: errMessage(e), variant: "destructive" }),
    },
  });

  const opts = (poll ?? []).map((o) => o.trim()).filter(Boolean);
  const pollValid = poll === null || opts.length >= 2;
  const canPost = content.trim().length > 0 && pollValid && !create.isPending;

  return (
    <div className="rise rounded-[1.6rem] border bg-card p-4 sm:p-5">
      <div className="flex gap-3">
        <UserAvatar id={me.id} name={me.name} src={me.avatarUrl} size="md" />
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={5000} rows={3}
          placeholder={poll ? "Ask a question…" : "What's happening on your street?"} aria-label="Post content"
          className="min-h-[72px] resize-none border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0" data-testid="input-post-content" />
      </div>
      {poll ? (
        <div className="rise mt-3 space-y-2 pl-14">
          {poll.map((o, i) => (
            <div key={i} className="flex gap-2">
              <Input value={o} maxLength={120} onChange={(e) => setPoll((p) => p!.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} aria-label={`Poll option ${i + 1}`} className="rounded-xl" data-testid={`input-poll-option-${i}`} />
              {poll.length > 2 ? <Button size="icon" variant="ghost" onClick={() => setPoll((p) => p!.filter((_, j) => j !== i))} aria-label="Remove option"><X className="h-4 w-4" /></Button> : null}
            </div>
          ))}
          {poll.length < 6 ? <Button size="sm" variant="ghost" onClick={() => setPoll((p) => [...p!, ""])}><Plus className="mr-1 h-3.5 w-3.5" /> Add option</Button> : null}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
        <Button size="sm" variant={poll ? "secondary" : "ghost"} className="rounded-full" onClick={() => setPoll((p) => (p ? null : ["", ""]))} data-testid="button-toggle-poll">
          <BarChart3 className="mr-1 h-4 w-4" /> {poll ? "Remove poll" : "Poll"}
        </Button>
        <Button size="sm" variant="ghost" className="rounded-full" disabled title="Photo posts are coming soon"><ImageOff className="mr-1 h-4 w-4" /> Photos soon</Button>
        <label className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
          <input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} aria-label="Post anonymously" data-testid="toggle-anonymous-post" />
          <span>Post anonymously</span>
        </label>
        <Select value={community} onValueChange={setCommunity}>
          <SelectTrigger className="h-8 w-auto min-w-[150px] rounded-full text-xs" aria-label="Post to" data-testid="select-post-community"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Everyone who follows you</SelectItem>
            {mine.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button className="ml-auto rounded-full px-5" disabled={!canPost}
          onClick={() => create.mutate({ data: { content: content.trim(), communityId: community === "none" ? null : community, pollOptions: poll ? opts : undefined, isAnonymous: anonymous } })} data-testid="button-publish-post">
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Post
        </Button>
      </div>
    </div>
  );
}
