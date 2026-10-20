"use client";
import { BarChart3, FileText, ImageIcon } from "lucide-react";
import type { Post } from "@workspace/api-client-react";
import { PostCard } from "@/components/feed/post-card";

/** A text / photo / poll post living inside the snap reel. Never touches the video player or watch tracking. */
export function PostEntry({ post, index }: { post: Post; index: number }) {
  const photo = !!post.media?.contentType.startsWith("image/");
  const kind = post.pollOptions.length && photo ? { icon: BarChart3, label: "Photo poll" } : post.pollOptions.length ? { icon: BarChart3, label: "Poll" } : post.media?.contentType.startsWith("image/") ? { icon: ImageIcon, label: "Photo post" } : { icon: FileText, label: "Post" };
  return <section className="relative flex h-full min-h-0 snap-start flex-col items-center overflow-hidden bg-[hsl(192_52%_9%)] px-3 py-4 sm:px-6" data-reel-id={post.id} data-testid={`reel-post-${post.id}`} aria-label={`${kind.label} ${index + 1}`}>
    <p className="mb-3 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[.06] px-3 py-1 font-mono text-[10px] uppercase tracking-[.2em] text-[hsl(42_90%_65%)]"><kind.icon className="h-3 w-3" />{kind.label}</p>
    <div className="reel-post-scroll min-h-0 w-full max-w-[560px] flex-1 overflow-y-auto rounded-[1.8rem] text-foreground [&>article]:min-h-full [&>article]:shadow-2xl" tabIndex={0} aria-label="Post content, scroll for more">
      <PostCard post={post} index={0} />
    </div>
  </section>;
}
