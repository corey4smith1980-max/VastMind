"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { useListChats, getListChatsQueryKey } from "@workspace/api-client-react";
import { ChatList } from "@/components/chats/chat-list";
import { ConversationPane } from "@/components/chats/conversation";
import { NewChatDialog } from "@/components/chats/new-chat-dialog";
import { EmptyState, RowSkeleton } from "@/components/states";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------- Two-panel inbox: list left, conversation right (stacked on mobile) ----------
function ChatsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const activeId = search.get("c");
  const [newOpen, setNewOpen] = useState(false);
  const chats = useListChats(undefined, { query: { queryKey: getListChatsQueryKey() } });
  const active = chats.data?.find((c) => c.id === activeId) ?? null;
  const select = (id: string) => router.push(`/chats?c=${id}`);

  return (
    <div className="flex h-full min-h-0">
      <aside className={cn("h-full w-full shrink-0 border-r md:w-[360px] lg:w-[400px]", activeId && "hidden md:block")}>
        <ChatList activeId={activeId} onSelect={select} onNew={() => setNewOpen(true)} />
      </aside>
      <section className={cn("h-full min-w-0 flex-1", !activeId && "hidden md:block")}>
        {activeId && active ? (
          <ConversationPane key={active.id} chat={active} onBack={() => router.push("/chats")} />
        ) : activeId && chats.isLoading ? (
          <RowSkeleton count={3} />
        ) : activeId ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState icon={MessagesSquare} title="Conversation not found" body="You may have left it, or it no longer exists." action={<Button variant="outline" className="rounded-full" onClick={() => router.push("/chats")}>Back to chats</Button>} />
          </div>
        ) : (
          <div className="switchboard-bg flex h-full flex-col items-center justify-center p-10 text-center">
            <BrandMark className="h-16 w-16 opacity-90" />
            <h2 className="font-display mt-6 text-3xl font-bold">Pick up a line.</h2>
            <p className="mt-2 max-w-sm text-muted-foreground">Choose a conversation on the left, or start a new one with a friend, a group, or a customer.</p>
            <Button className="mt-6 rounded-full" onClick={() => setNewOpen(true)}>New conversation</Button>
          </div>
        )}
      </section>
      <NewChatDialog open={newOpen} onOpenChange={setNewOpen} onCreated={select} />
    </div>
  );
}

export default function ChatsPage() {
  return <Suspense fallback={<RowSkeleton />}><ChatsInner /></Suspense>;
}
