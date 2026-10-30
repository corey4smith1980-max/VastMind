"use client";
import Link from "next/link";
import { ArrowUpRight, BarChart3, FileText, ImageIcon } from "lucide-react";
import type { Post } from "@workspace/api-client-react";
import { PostCard } from "@/components/feed/post-card";
import { useMe } from "@/lib/me";

/** A text / photo / poll post living inside the snap reel. Never touches the video player or watch tracking. */
export function PostEntry({ post, index }: { post: Post; index: number }) {
  const me = useMe();
  const isOwner = post.author.id === me.id;
  const photo = !!post.media?.contentType.startsWith("image/");
  const kind = post.pollOptions.length && photo ? { icon: BarChart3, label: "Photo poll" } : post.pollOptions.length ? { icon: BarChart3, label: "Poll" } : post.media?.contentType.startsWith("image/") ? { icon: ImageIcon, label: "Photo post" } : { icon: FileText, label: "Post" };
  return <section className="relative flex h-full min-h-0 snap-start flex-col items-center overflow-hidden bg-black px-3 py-4 sm:px-6" data-reel-id={post.id} data-testid={`reel-post-${post.id}`} aria-label={`${kind.label} ${index + 1}`}>
    <div className="mb-3 flex w-full max-w-[560px] shrink-0 items-center justify-between gap-3">
      <p className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[.06] px-3 py-1 font-mono text-[10px] uppercase tracking-[.2em] text-[hsl(42_90%_65%)]"><kind.icon className="h-3 w-3" />{kind.label}</p>
      {isOwner ? <Link href={`/business/growth?targetType=post&targetId=${encodeURIComponent(post.id)}&name=${encodeURIComponent(post.content.slice(0, 70) || "Feed post")}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/[.07] px-3 py-1.5 text-[11px] font-medium text-white/75 transition-colors hover:bg-white/15 hover:text-white" aria-label="Save a promotion draft for this Feed post"><ArrowUpRight className="h-3.5 w-3.5" />Promote</Link> : null}
    </div>
    <div className="reel-post-scroll min-h-0 w-full max-w-[560px] flex-1 overflow-y-auto rounded-[1.8rem] text-foreground [&>article]:min-h-full [&>article]:shadow-2xl" tabIndex={0} aria-label="Post content, scroll for more">
      <PostCard post={post} index={0} />
    </div>
  </section>;
}
