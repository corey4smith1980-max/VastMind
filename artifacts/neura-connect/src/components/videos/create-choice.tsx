"use client";
import { Clapperboard, MessageSquareText } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Composer } from "@/components/feed/composer";

export type CreateMode = "choose" | "post" | null;

export function CreateChoiceDialog({ mode, onMode, onClip, onPublished }: { mode: CreateMode; onMode: (m: CreateMode) => void; onClip: () => void; onPublished: () => void }) {
  return <Dialog open={mode !== null} onOpenChange={(o) => { if (!o) onMode(null); }}>
    <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto rounded-[1.6rem]">
      {mode === "post" ? <>
        <DialogHeader><DialogTitle className="font-display text-2xl">Post, photo or poll</DialogTitle><DialogDescription>Add a photo, a poll, or both. Shows up in Videos between clips for the people who can see it.</DialogDescription></DialogHeader>
        <Composer onPublished={() => { onMode(null); onPublished(); }} />
      </> : <>
        <DialogHeader><DialogTitle className="font-display text-2xl">What are you sharing?</DialogTitle><DialogDescription>Both land in the same stream.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr]">
          <button onClick={() => onMode("post")} className="group rounded-2xl border bg-card p-5 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="button-create-post">
            <MessageSquareText className="h-6 w-6 text-primary" /><p className="mt-3 font-semibold">Post, photo or poll</p><p className="mt-1 text-sm text-muted-foreground">Words, a photo, a question, anonymous if you like.</p>
          </button>
          <button onClick={() => { onMode(null); onClip(); }} className="rounded-2xl border bg-[hsl(192_49%_12%)] p-5 text-left text-white transition-colors hover:border-[hsl(12_82%_52%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="button-create-clip-choice">
            <Clapperboard className="h-6 w-6 text-[hsl(42_90%_65%)]" /><p className="mt-3 font-semibold">Clip</p><p className="mt-1 text-sm text-white/65">Record or upload, add a look and captions.</p>
          </button>
        </div>
      </>}
    </DialogContent>
  </Dialog>;
}
