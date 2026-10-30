import { useMemo, useState } from "react";
import {
  ArrowDown,
  BarChart3,
  Clapperboard,
  FileText,
  Heart,
  Image as ImageIcon,
  Info,
  MessageCircle,
  Music2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import "./_group.css";

type FeedId = "for-you" | "following" | "latest";
type StaticPost = {
  id: string;
  author: string;
  username: string;
  initials: string;
  age: string;
  content: string;
  kind: "video" | "photo" | "text" | "poll";
  mediaDescription?: string;
  reactions: number;
  comments: number;
  following: boolean;
};

const FEEDS: { id: FeedId; label: string; why: string; empty: string }[] = [
  { id: "for-you", label: "For You", why: "Recommendations use follows and public viewing activity, never private chats.", empty: "Nothing to suggest yet. Follow a few people or watch some clips to shape your feed." },
  { id: "following", label: "Following", why: "Clips from people you follow, newest first.", empty: "People you follow haven't shared clips yet." },
  { id: "latest", label: "Latest", why: "Clips you're allowed to see, newest first. No ranking.", empty: "No clips have been shared yet." },
];

const POSTS: StaticPost[] = [
  {
    id: "clip-maya",
    author: "Maya Chen",
    username: "mayamakes",
    initials: "MC",
    age: "2h",
    content: "A slow morning on the coast. The kind of quiet I want to bottle up and keep for a rainy day. 🌊",
    kind: "video",
    mediaDescription: "A golden sunset over a quiet coastal path",
    reactions: 284,
    comments: 18,
    following: false,
  },
  {
    id: "post-jules",
    author: "Jules Rivera",
    username: "julesinbloom",
    initials: "JR",
    age: "4h",
    content: "Found the little Saturday market tucked behind the old bookshop. Fresh tulips, warm bread, and people who remember your name. This is my favorite kind of neighborhood morning. 🌷",
    kind: "photo",
    mediaDescription: "Fresh flowers and market finds",
    reactions: 126,
    comments: 9,
    following: true,
  },
  {
    id: "post-noah",
    author: "Noah Williams",
    username: "noahoutside",
    initials: "NW",
    age: "6h",
    content: "Which trail should we take for the first hike of spring?",
    kind: "poll",
    reactions: 72,
    comments: 14,
    following: false,
  },
  {
    id: "post-amara",
    author: "Amara Okafor",
    username: "amaracooks",
    initials: "AO",
    age: "8h",
    content: "A reminder from my kitchen today: good food doesn't need a special occasion. Make the soup. Invite a friend. Set the table anyway.",
    kind: "text",
    reactions: 193,
    comments: 21,
    following: true,
  },
];

const INITIALS_COLORS = [
  "hsl(12 80% 88%)",
  "hsl(168 40% 82%)",
  "hsl(192 40% 84%)",
  "hsl(340 55% 88%)",
];

function Avatar({ post, index }: { post: StaticPost; index: number }) {
  return (
    <span
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold text-[hsl(234_64%_8%)]"
      style={{ background: INITIALS_COLORS[index % INITIALS_COLORS.length] }}
      aria-label={post.author}
    >
      {post.initials}
    </span>
  );
}

function StaticVideoCard({
  post,
  index,
  liked,
  onLike,
  following,
  onFollow,
  onComments,
}: {
  post: StaticPost;
  index: number;
  liked: boolean;
  onLike: () => void;
  following: boolean;
  onFollow: () => void;
  onComments: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <article
      className="relative flex h-full min-h-0 snap-start items-center justify-center overflow-hidden bg-[hsl(192_52%_9%)]"
      data-testid={`reel-${post.id}`}
      data-reel-id={post.id}
    >
      <div className="mock-clip-scene absolute inset-y-0 left-1/2 aspect-[9/15] h-full max-h-full -translate-x-1/2 overflow-hidden">
        <div className="absolute inset-0 opacity-80" style={{ background: "linear-gradient(142deg, transparent 46%, rgba(9,27,28,.35) 47% 55%, transparent 56%), linear-gradient(24deg, transparent 54%, rgba(243,201,153,.18) 55% 57%, transparent 58%)" }} />
        <div className="absolute bottom-[19%] left-[14%] h-[24%] w-[72%] rounded-[50%] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,.06),rgba(7,26,31,.42))] shadow-[0_0_60px_rgba(247,179,105,.15)]" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[hsl(192_55%_5%/.94)] via-transparent to-[hsl(192_55%_5%/.13)]" />
      {!playing ? (
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-[2] grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur">
          <Play className="ml-1 h-6 w-6 fill-current" />
        </span>
      ) : null}
      <button
        className="absolute inset-0 z-[1] cursor-pointer"
        onClick={() => setPlaying((value) => !value)}
        aria-label={`${playing ? "Pause" : "Play"} video`}
      />
      <div className="absolute bottom-0 left-0 right-16 z-[3] p-5 pb-7 text-white sm:left-5 sm:max-w-[min(78%,540px)] sm:p-7">
        <div className="flex items-center gap-2.5">
          <Avatar post={post} index={index} />
          <div className="min-w-0">
            <span className="block truncate text-sm font-bold">{post.author}</span>
            <span className="block text-xs text-white/70">@{post.username}</span>
          </div>
          {!following ? (
            <Button size="sm" variant="outline" className="h-8 rounded-full border-white/50 bg-white/10 text-white hover:bg-white/20" onClick={onFollow}>Follow</Button>
          ) : (
            <button onClick={onFollow} className="rounded-full border border-white/25 px-3 py-1 text-[11px] text-white/70 hover:bg-white/10">Following</button>
          )}
        </div>
        <p className="mt-4 line-clamp-4 max-w-xl whitespace-pre-wrap break-words text-[15px] font-medium leading-relaxed text-white [text-shadow:0_1px_8px_rgba(0,0,0,.7)]">{post.content}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-white/80">
          <span className="rounded-full border border-white/30 bg-black/20 px-2.5 py-1">Original look</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-black/20 px-2.5 py-1"><Music2 className="h-3 w-3" />Original sound</span>
        </div>
      </div>
      <div className="absolute bottom-7 right-3 z-[4] flex flex-col items-center gap-3.5 text-white sm:right-5">
        <button onClick={() => setPlaying((value) => !value)} className="grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur" aria-label={playing ? "Pause clip" : "Play clip"}>
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <button className="grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur" aria-label="Turn sound on"><VolumeX className="h-5 w-5" /></button>
        <button onClick={onLike} className="flex flex-col items-center gap-1" aria-label={`${liked ? "Unlike" : "Like"} clip, ${post.reactions + (liked ? 1 : 0)} likes`} aria-pressed={liked}>
          <span className={`grid h-12 w-12 place-items-center rounded-full bg-black/35 backdrop-blur transition-transform ${liked ? "scale-105 text-[hsl(347_96%_61%)]" : ""}`}><Heart className={`h-6 w-6 ${liked ? "fill-current" : ""}`} /></span>
          <span className="text-xs font-semibold">{post.reactions + (liked ? 1 : 0)}</span>
        </button>
        <button onClick={onComments} className="flex flex-col items-center gap-1" aria-label={`View ${post.comments} comments`}>
          <span className="grid h-12 w-12 place-items-center rounded-full bg-black/35 backdrop-blur"><MessageCircle className="h-6 w-6" /></span>
          <span className="text-xs font-semibold">{post.comments}</span>
        </button>
        <button className="grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur" aria-label="Share creator link"><Share2 className="h-5 w-5" /></button>
        <span className="font-mono text-[10px] text-white/65">{index + 1}</span>
      </div>
    </article>
  );
}

function StaticPostCard({
  post,
  index,
  liked,
  onLike,
  onComments,
  onVote,
  vote,
}: {
  post: StaticPost;
  index: number;
  liked: boolean;
  onLike: () => void;
  onComments: () => void;
  onVote: (option: string) => void;
  vote: string | null;
}) {
  const kind = post.kind === "poll" ? { icon: BarChart3, label: "Poll" } : post.kind === "photo" ? { icon: ImageIcon, label: "Photo post" } : { icon: FileText, label: "Post" };
  const KindIcon = kind.icon;
  const polls = [
    { label: "River loop · 4 miles", votes: 18 },
    { label: "Pine ridge · 6 miles", votes: 12 },
    { label: "Creekside walk · 2 miles", votes: 9 },
  ];
  return (
    <section className="relative flex h-full min-h-0 snap-start flex-col items-center overflow-hidden bg-[hsl(192_52%_9%)] px-3 py-4 sm:px-6">
      <p className="mb-3 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[.06] px-3 py-1 font-mono text-[10px] uppercase tracking-[.2em] text-[hsl(42_90%_65%)]">
        <KindIcon className="h-3 w-3" />{kind.label}
      </p>
      <div className="reel-post-scroll min-h-0 w-full max-w-[560px] flex-1 overflow-y-auto rounded-[1.8rem] text-foreground">
        <article className="rise rounded-[1.6rem] border bg-card p-4 shadow-2xl sm:p-5" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
          <header className="flex items-center gap-3">
            <Avatar post={post} index={index} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{post.author} <span className="font-normal text-muted-foreground">@{post.username}</span></p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{post.age}</span></div>
            </div>
          </header>
          <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{post.content}</p>
          {post.kind === "photo" ? (
            <div className="mt-4 flex aspect-[4/3] items-end overflow-hidden rounded-2xl border bg-[radial-gradient(ellipse_at_48%_31%,#f7d7a7_0_7%,transparent_8%),linear-gradient(145deg,#d9b99a,#718d74_48%,#354d47)] p-5">
              <span className="rounded-full bg-black/30 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">{post.mediaDescription}</span>
            </div>
          ) : null}
          {post.kind === "poll" ? (
            <div className="mt-4 space-y-2.5" role="group" aria-label="Poll results">
              {polls.map((option) => (
                <button key={option.label} onClick={() => onVote(option.label)} aria-pressed={vote === option.label} className={`w-full rounded-xl border px-3.5 py-3 text-left transition-colors hover:border-primary ${vote === option.label ? "border-primary bg-primary/[.04]" : "border-border bg-background/40"}`}>
                  <span className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">{option.label}</span><span className="font-mono text-xs tabular-nums text-muted-foreground">{option.votes + (vote === option.label ? 1 : 0)} votes</span></span>
                  <span className="mt-2 block h-2 overflow-hidden rounded-full bg-muted/80"><span className="block h-full rounded-full bg-gradient-to-r from-primary via-[hsl(214_90%_58%)] to-[hsl(272_82%_66%)]" style={{ width: `${Math.round(option.votes / 39 * 100)}%` }} /></span>
                </button>
              ))}
              <p className="pt-0.5 text-[11px] text-muted-foreground">{vote ? "Your vote is in · tap a different option to change it" : "Tap an option to vote"} · 39 votes</p>
            </div>
          ) : null}
          <footer className="mt-4 flex items-center gap-1">
            <Button variant="ghost" size="sm" className={`rounded-full ${liked ? "text-primary" : ""}`} onClick={onLike}><Heart className={`mr-1 h-4 w-4 ${liked ? "fill-current" : ""}`} />{post.reactions + (liked ? 1 : 0)}</Button>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={onComments}><MessageCircle className="mr-1 h-4 w-4" />{post.comments}</Button>
            <Button variant="ghost" size="sm" className="ml-auto rounded-full" aria-label="Share post"><Share2 className="h-4 w-4" /></Button>
          </footer>
        </article>
      </div>
    </section>
  );
}

export function Current() {
  const [feed, setFeed] = useState<FeedId>("for-you");
  const [query, setQuery] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [votes, setVotes] = useState<Record<string, string | null>>({});
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const meta = FEEDS.find((item) => item.id === feed)!;
  const filtered = useMemo(() => POSTS.filter((post) => {
    const matchesQuery = `${post.author} ${post.username} ${post.content}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesFeed = feed !== "following" || post.following;
    return matchesQuery && matchesFeed;
  }), [feed, query]);

  return (
    <main className="vm-feed-current grain relative flex h-screen min-h-screen flex-col overflow-hidden bg-[hsl(192_45%_12%)] text-white" data-testid="page-videos">
      <header className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[hsl(192_49%_12%)] px-4 py-2.5 sm:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[hsl(12_82%_52%)] text-white"><Clapperboard className="h-[18px] w-[18px]" /></span>
          <p className="hidden font-display text-lg leading-tight md:block">Feed · everyday, in motion</p>
        </div>
        <div role="tablist" aria-label="Choose a clip feed" className="order-3 flex w-full rounded-full bg-white/[.07] p-1 sm:order-none sm:w-auto">
          {FEEDS.map((item) => (
            <button key={item.id} role="tab" aria-selected={feed === item.id} onClick={() => setFeed(item.id)} className={`flex-1 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors sm:flex-none ${feed === item.id ? "bg-[hsl(40_50%_96%)] text-[hsl(192_52%_12%)]" : "text-white/70 hover:text-white"}`} data-testid={`tab-feed-${item.id}`}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Button onClick={() => setInfoOpen((open) => !open)} variant="ghost" size="icon" aria-label="Why am I seeing these clips?" aria-expanded={infoOpen} className="rounded-full text-white/75 hover:bg-white/10 hover:text-white"><Info className="h-4 w-4" /></Button>
          <Button onClick={() => setGeneration((value) => value + 1)} variant="ghost" size="icon" aria-label="Refresh clips" className="rounded-full text-white/75 hover:bg-white/10 hover:text-white"><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={() => setComposerOpen(true)} size="sm" className="rounded-full px-4"><Plus className="mr-1.5 h-4 w-4" />Create clip</Button>
        </div>
      </header>
      <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-[hsl(192_49%_12%)] px-4 pb-2.5 sm:px-7">
        <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/50" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clips" aria-label="Search clips" className="h-8 rounded-full border-white/10 bg-white/[.07] pl-8 text-xs text-white placeholder:text-white/45" data-testid="input-search-feed" />
        </div>
      </div>
      {infoOpen ? (
        <section className="absolute right-3 top-[70px] z-30 w-[min(360px,calc(100%-1.5rem))] rounded-2xl border border-white/10 bg-[hsl(192_46%_10%/.97)] p-5 text-white shadow-2xl backdrop-blur" aria-label="How this feed works">
          <div className="flex items-start justify-between gap-3"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[hsl(42_90%_65%)]">Why these clips</p><button onClick={() => { setInfoOpen(false); setConfirmReset(false); }} aria-label="Close" className="rounded-full p-1 text-white/60 hover:bg-white/10"><X className="h-4 w-4" /></button></div>
          <p className="mt-2 text-sm leading-relaxed text-white/85"><span className="font-semibold">{meta.label}.</span> {meta.why}</p>
          <div className="mt-4 border-t border-white/10 pt-4">
            {!confirmReset ? <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setConfirmReset(true)}><RotateCcw className="mr-2 h-3.5 w-3.5" />Reset viewing history</Button> : <div role="alertdialog" aria-label="Confirm reset"><p className="text-sm text-white/80">Clear what you've watched? For You will stop using it. This can't be undone.</p><div className="mt-3 flex gap-2"><Button size="sm" variant="destructive" className="rounded-full" onClick={() => { setConfirmReset(false); setInfoOpen(false); setGeneration((value) => value + 1); }}>Clear history</Button><Button size="sm" variant="ghost" className="rounded-full text-white hover:bg-white/10" onClick={() => setConfirmReset(false)}>Keep it</Button></div></div>}
          </div>
        </section>
      ) : null}
      <div className="relative flex min-h-0 flex-1">
        <div key={`${feed}-${generation}-${query}`} className="reel-scroll min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain focus-visible:outline-none" role="feed" aria-label="Clips. Scroll to move between videos.">
          {filtered.map((post, index) => post.kind === "video" ? (
            <StaticVideoCard
              key={post.id}
              post={post}
              index={index}
              liked={!!liked[post.id]}
              onLike={() => setLiked((state) => ({ ...state, [post.id]: !state[post.id] }))}
              following={followed[post.id] ?? post.following}
              onFollow={() => setFollowed((state) => ({ ...state, [post.id]: !(state[post.id] ?? post.following) }))}
              onComments={() => setCommentsFor(post.id)}
            />
          ) : (
            <StaticPostCard
              key={post.id}
              post={post}
              index={index}
              liked={!!liked[post.id]}
              onLike={() => setLiked((state) => ({ ...state, [post.id]: !state[post.id] }))}
              onComments={() => setCommentsFor(post.id)}
              onVote={(option) => setVotes((state) => ({ ...state, [post.id]: option }))}
              vote={votes[post.id] ?? null}
            />
          ))}
          {filtered.length === 0 ? (
            <section className="grid h-full min-h-[400px] place-content-center px-6 text-center">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-[1.4rem] border border-white/10 bg-white/[.06]"><Sparkles className="h-7 w-7 text-[hsl(42_90%_65%)]" /></span>
              <p className="mt-5 font-mono text-[10px] uppercase tracking-[.24em] text-white/50">{meta.label}</p>
              <h1 className="mt-2 font-display text-3xl">{query ? "Nothing matches." : "Your circle, in motion."}</h1>
              <p className="mx-auto mt-3 max-w-[290px] text-sm leading-relaxed text-white/65">{query ? `No clips mention “${query}”.` : meta.empty}</p>
              <Button onClick={() => setComposerOpen(true)} className="mx-auto mt-6 rounded-full px-5"><Plus className="mr-2 h-4 w-4" />Create a clip</Button>
            </section>
          ) : (
            <div className="flex min-h-24 snap-start items-center justify-center text-xs text-white/55"><button onClick={() => setGeneration((value) => value + 1)} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 hover:bg-white/15"><ArrowDown className="h-4 w-4" />Keep watching</button></div>
          )}
        </div>
        <div className="pointer-events-none absolute bottom-4 left-4 z-[5] hidden items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[10px] text-white/60 backdrop-blur sm:flex"><span className="grid h-5 w-5 place-items-center rounded-full bg-white/10"><ArrowDown className="h-3 w-3" /></span>Scroll to move through clips</div>
      </div>
      {commentsFor ? <div className="absolute inset-0 z-40 grid place-items-center bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Comments"><div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[hsl(192_46%_10%)] p-5"><div className="flex items-center justify-between"><h2 className="font-display text-xl">The conversation</h2><button onClick={() => setCommentsFor(null)} aria-label="Close comments" className="rounded-full p-1 text-white/60 hover:bg-white/10"><X className="h-4 w-4" /></button></div><p className="mt-3 text-sm leading-relaxed text-white/75">“This is exactly the little reset I needed today.”</p><p className="mt-2 text-sm leading-relaxed text-white/75">“Adding this spot to my weekend list 🌅”</p><Input className="mt-4 rounded-full border-white/15 bg-white/10 text-white placeholder:text-white/45" placeholder="Add to the conversation" aria-label="Write a comment" /></div></div> : null}
      {composerOpen ? <div className="absolute inset-0 z-40 grid place-items-center bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Create a clip"><div className="w-full max-w-md rounded-2xl border border-white/10 bg-[hsl(192_46%_10%)] p-5"><div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[.2em] text-white/55">Make a clip</span><button onClick={() => setComposerOpen(false)} aria-label="Close creator" className="rounded-full p-1 text-white/60 hover:bg-white/10"><X className="h-4 w-4" /></button></div><h2 className="mt-3 font-display text-2xl">Create a moment</h2><p className="mt-2 text-sm text-white/65">Share a short video or a little piece of your day.</p><Button className="mt-5 w-full rounded-full" onClick={() => setComposerOpen(false)}><Plus className="mr-2 h-4 w-4" />Choose a video</Button></div></div> : null}
    </main>
  );
}
