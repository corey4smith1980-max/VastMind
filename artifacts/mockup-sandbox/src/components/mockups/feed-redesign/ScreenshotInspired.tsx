import { type FormEvent, useMemo, useState } from "react";
import {
  ArrowDown,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Compass,
  Heart,
  Home,
  Info,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import "./_group.css";

type FeedId = "for-you" | "following" | "latest";

const FEEDS: { id: FeedId; label: string }[] = [
  { id: "for-you", label: "For You" },
  { id: "following", label: "Following" },
  { id: "latest", label: "Latest" },
];

const CLIP = {
  author: "Maya Chen",
  username: "mayamakes",
  initials: "MC",
  caption: "A slow morning on the coast. The kind of quiet I want to bottle up and keep for a rainy day.",
  likes: 284,
  comments: 18,
};

const COMMENTS = [
  { initials: "JR", name: "Jules Rivera", text: "That light is unreal. Saving this spot for a weekend reset." },
  { initials: "AO", name: "Amara Okafor", text: "The sound of the water is such a good way to start the day." },
  { initials: "NW", name: "Noah Williams", text: "Where on the coast is this?" },
];

export function ScreenshotInspired() {
  const [feed, setFeed] = useState<FeedId>("for-you");
  const [query, setQuery] = useState("");
  const [liked, setLiked] = useState(false);
  const [following, setFollowing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [saved, setSaved] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [localComments, setLocalComments] = useState(COMMENTS);

  const isMatch = useMemo(
    () => `${CLIP.author} ${CLIP.username} ${CLIP.caption}`.toLowerCase().includes(query.trim().toLowerCase()),
    [query],
  );
  const hasClip = feed !== "following" && isMatch;

  const shareClip = async () => {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText("VastMind · Maya Chen's coast clip");
      setNotice("Clip link copied");
    } catch {
      setNotice("Ready to share");
    }
    window.setTimeout(() => setNotice(""), 2200);
  };

  const submitComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = commentDraft.trim();
    if (!text) return;
    setLocalComments((items) => [{ initials: "YO", name: "You", text }, ...items]);
    setCommentDraft("");
  };

  return (
    <main className="vm-feed-current vm-screenshot-feed relative flex min-h-[100dvh] flex-col overflow-hidden bg-[#f3f5f8] text-[#18233a] lg:h-[100dvh] lg:flex-row" data-testid="page-videos">
      <aside className="relative z-10 flex shrink-0 items-center justify-between border-b border-[#e2e7ef] bg-[#fbfcfe] px-4 py-3 lg:w-[228px] lg:flex-col lg:items-stretch lg:border-b-0 lg:border-r lg:px-4 lg:py-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[13px] bg-[linear-gradient(135deg,#14c9e8,#405df4_57%,#8b4bea)] text-white shadow-[0_6px_16px_rgba(56,103,224,.22)]">
            <span className="font-display text-[18px] font-bold tracking-[-.1em]">V</span>
          </span>
          <span className="font-display text-[19px] font-bold tracking-[-.045em] text-[#16213a]">VastMind</span>
          <span className="hidden rounded-md bg-[#eef2f8] px-1.5 py-1 font-mono text-[9px] uppercase tracking-[.12em] text-[#64718a] lg:inline">Clips</span>
        </div>

        <label className="relative hidden lg:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8792a7]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search clips"
            aria-label="Search clips"
            className="h-10 w-full rounded-xl border border-[#e4e9f0] bg-[#f5f7fa] pl-9 pr-3 text-[12px] outline-none transition focus:border-[#8da9ef] focus:bg-white"
          />
        </label>

        <nav className="hidden space-y-1 lg:block" aria-label="VastMind navigation">
          <p className="mb-2 px-3 font-mono text-[9px] uppercase tracking-[.18em] text-[#9aa4b5]">Your feed</p>
          {FEEDS.map((item, index) => {
            const Icon = index === 0 ? Home : index === 1 ? Compass : ArrowDown;
            return (
              <button
                key={item.id}
                onClick={() => setFeed(item.id)}
                aria-current={feed === item.id ? "page" : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition ${feed === item.id ? "bg-[#edf2ff] text-[#315ed9]" : "text-[#67738a] hover:bg-[#f2f4f8] hover:text-[#25324d]"}`}
              >
                <Icon className="h-[17px] w-[17px]" strokeWidth={2} />
                {item.label}
                {feed === item.id ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#4270e8]" /> : null}
              </button>
            );
          })}
        </nav>

        <div className="hidden rounded-2xl border border-[#e8ecf2] bg-white p-3.5 lg:block">
          <div className="flex items-center gap-2 text-[11px] font-bold text-[#34425d]">
            <ShieldCheck className="h-4 w-4 text-[#3975dc]" />
            Your feed, your choice
          </div>
          <p className="mt-2 text-[10px] leading-[1.6] text-[#8290a5]">Recommendations use public viewing activity, never private chats.</p>
          <button onClick={() => setInfoOpen(true)} className="mt-2 text-[10px] font-bold text-[#386bdc] hover:underline">How it works</button>
        </div>

        <div className="hidden items-center gap-2 border-t border-[#e8ecf2] pt-4 lg:mt-auto lg:flex">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#f4e4d8] text-[10px] font-bold text-[#573a33]">MC</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-bold">Maya Chen</span>
            <span className="block text-[10px] text-[#8c97a9]">Personal account</span>
          </span>
          <button aria-label="More account options" onClick={() => setNotice("Account options are preview-only")} className="rounded-lg p-1.5 text-[#7e899a] hover:bg-[#f2f4f8]"><MoreHorizontal className="h-4 w-4" /></button>
        </div>

        <div className="flex items-center gap-1 rounded-full bg-[#f0f3f8] p-1 lg:hidden" role="tablist" aria-label="Choose a clip feed">
          {FEEDS.map((item) => (
            <button key={item.id} role="tab" aria-selected={feed === item.id} onClick={() => setFeed(item.id)} className={`rounded-full px-2.5 py-1.5 text-[10px] font-semibold ${feed === item.id ? "bg-white text-[#315ed9] shadow-sm" : "text-[#758198]"}`}>
              {item.label}
            </button>
          ))}
        </div>
      </aside>

      <section className="relative flex min-h-0 flex-1 flex-col">
        <header className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-[#e2e7ef] bg-[#fbfcfe]/95 px-4 py-3 backdrop-blur lg:px-7">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Clapperboard className="h-4 w-4 text-[#4a6ddd]" />
              <h1 className="font-display text-[15px] font-bold tracking-[-.025em]">Short videos</h1>
              <span className="hidden rounded-full border border-[#dde4ee] bg-white px-2 py-0.5 text-[9px] font-semibold text-[#7b879b] sm:inline">Community posts stay separate</span>
            </div>
            <p className="mt-0.5 hidden text-[10px] text-[#8b96a9] sm:block">A quick window into your circle.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative lg:hidden">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8994a7]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search clips" className="h-8 w-[min(34vw,180px)] rounded-full border border-[#e3e8ef] bg-white pl-8 pr-3 text-[11px] outline-none focus:border-[#8da9ef]" />
            </label>
            <button onClick={() => setInfoOpen((open) => !open)} aria-label="Why am I seeing this clip?" aria-expanded={infoOpen} className="grid h-8 w-8 place-items-center rounded-full border border-[#e5e9f0] bg-white text-[#69768b] transition hover:text-[#315ed9]"><Info className="h-4 w-4" /></button>
            <button onClick={() => { setFeed("for-you"); setQuery(""); }} aria-label="Refresh clips" className="hidden h-8 items-center gap-1.5 rounded-full border border-[#e5e9f0] bg-white px-3 text-[10px] font-semibold text-[#69768b] hover:border-[#cbd6eb] sm:flex"><RefreshCw className="h-3 w-3" /> Refresh</button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_50%_38%,#e5eaf3_0%,#f3f5f8_53%,#f5f7fa_100%)] px-3 py-3 sm:px-6 sm:py-5">
          {hasClip ? (
            <div className="relative flex h-full min-h-[480px] max-h-[790px] w-full max-w-[860px] items-center justify-center gap-3 lg:gap-5">
              <div className="relative h-full min-h-0 w-full max-w-[420px] overflow-hidden rounded-[22px] bg-[#1b333b] shadow-[0_18px_55px_rgba(34,49,74,.19)] sm:rounded-[26px]">
                <div className="vm-coast-scene absolute inset-0">
                  <div className="vm-coast-haze absolute inset-0" />
                  <div className="absolute left-[-18%] top-[8%] h-[76%] w-[63%] rounded-[50%] bg-[#355c5c]/55 blur-[2px]" />
                  <div className="absolute right-[-14%] top-[24%] h-[66%] w-[66%] rounded-[50%] bg-[#1c4549]/70" />
                  <div className="absolute bottom-[17%] left-[-12%] h-[43%] w-[124%] rotate-[-8deg] rounded-[50%] bg-[#d09a71]/38 blur-[1px]" />
                  <div className="absolute bottom-[-18%] left-[-6%] h-[47%] w-[114%] rotate-[7deg] rounded-[50%] bg-[#132f38]/75" />
                  <div className="absolute left-[18%] top-[43%] h-[17%] w-[17%] rounded-full bg-[#f3c69a]/80 blur-[30px]" />
                  <span className="absolute left-[8%] top-[11%] rounded-full border border-white/30 bg-[#172a32]/20 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[.16em] text-white/85 backdrop-blur">Pacific coast · 06:18</span>
                  <div className="absolute bottom-[26%] left-[17%] h-[1px] w-[56%] rotate-[-7deg] bg-white/20" />
                  <div className="absolute bottom-[25%] left-[22%] h-[1px] w-[45%] rotate-[-7deg] bg-white/15" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#09151d]/90 via-transparent to-[#10212b]/10" />
                <div className="absolute left-4 right-4 top-4 flex items-center justify-between sm:left-5 sm:right-5 sm:top-5">
                  <span className="rounded-full border border-white/20 bg-[#07141c]/35 px-3 py-1.5 text-[9px] font-semibold text-white/90 backdrop-blur">For You</span>
                  <button onClick={() => setSaved((value) => !value)} aria-label={saved ? "Remove from saved clips" : "Save clip"} aria-pressed={saved} className="grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-[#07141c]/30 text-white backdrop-blur transition hover:bg-white/20">
                    <Bookmark className={`h-4 w-4 ${saved ? "fill-current text-[#f8d37b]" : ""}`} />
                  </button>
                </div>

                {!playing ? <span className="pointer-events-none absolute left-1/2 top-1/2 z-[2] grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-[#091720]/35 text-white shadow-lg backdrop-blur-md"><Play className="ml-1 h-5 w-5 fill-current" /></span> : null}
                <button onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause clip" : "Play clip"} className="absolute inset-0 z-[1] cursor-pointer" />

                <div className="absolute bottom-0 left-0 right-0 z-[3] p-4 pb-5 text-white sm:p-6 sm:pb-6">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/60 bg-[#f2d7bd] text-[11px] font-bold text-[#473528] shadow-md">MC</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-bold">{CLIP.author}</span>
                      <span className="block text-[10px] text-white/70">@{CLIP.username} <span className="px-1">·</span> 2h ago</span>
                    </span>
                    <button onClick={() => setFollowing((value) => !value)} className={`ml-1 rounded-full border px-3 py-1.5 text-[10px] font-bold transition ${following ? "border-white/35 bg-white/15 text-white" : "border-white bg-white text-[#203a54] hover:bg-white/90"}`}>
                      {following ? "Following" : "Follow"}
                    </button>
                  </div>
                  <p className="mt-3 max-w-[340px] text-[13px] font-medium leading-[1.55] text-white [text-shadow:0_1px_12px_rgba(0,0,0,.4)] sm:text-[14px]">{CLIP.caption}</p>
                  <div className="mt-3 flex items-center gap-2 text-[9px] font-semibold text-white/80">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-white/15"><Volume2 className="h-3 w-3" /></span>
                    <span>Original sound · Maya Chen</span>
                  </div>
                  <div className="mt-4 h-[3px] overflow-hidden rounded-full bg-white/30">
                    <div className="h-full w-[31%] rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,.7)]" />
                  </div>
                </div>
              </div>

              <div className="absolute bottom-8 right-1 z-[4] flex flex-col items-center gap-3 text-[#28354c] sm:right-2 lg:static lg:bottom-auto lg:right-auto lg:translate-y-[116px]">
                <button onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause clip" : "Play clip"} className="hidden h-10 w-10 place-items-center rounded-full border border-[#e2e7ef] bg-white/90 shadow-sm transition hover:-translate-y-0.5 lg:grid">{playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}</button>
                <button onClick={() => setMuted((value) => !value)} aria-label={muted ? "Turn sound on" : "Mute clip"} className="hidden h-10 w-10 place-items-center rounded-full border border-[#e2e7ef] bg-white/90 shadow-sm transition hover:-translate-y-0.5 lg:grid">{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
                <button onClick={() => setLiked((value) => !value)} aria-pressed={liked} aria-label={`${liked ? "Unlike" : "Like"} clip`} className="flex flex-col items-center gap-1">
                  <span className={`grid h-11 w-11 place-items-center rounded-full border border-[#e1e6ef] bg-white/95 shadow-sm transition hover:-translate-y-0.5 ${liked ? "text-[#e04f77]" : "text-[#34425a]"}`}><Heart className={`h-[19px] w-[19px] ${liked ? "fill-current" : ""}`} /></span>
                  <span className="text-[9px] font-bold tabular-nums">{(CLIP.likes + (liked ? 1 : 0)).toLocaleString()}</span>
                </button>
                <button onClick={() => setCommentsOpen(true)} aria-label={`View ${CLIP.comments} comments`} className="flex flex-col items-center gap-1">
                  <span className="grid h-11 w-11 place-items-center rounded-full border border-[#e1e6ef] bg-white/95 shadow-sm transition hover:-translate-y-0.5"><MessageCircle className="h-[19px] w-[19px]" /></span>
                  <span className="text-[9px] font-bold">{CLIP.comments + localComments.length - COMMENTS.length}</span>
                </button>
                <button onClick={shareClip} aria-label="Share clip" className="grid h-10 w-10 place-items-center rounded-full border border-[#e1e6ef] bg-white/95 shadow-sm transition hover:-translate-y-0.5"><Share2 className="h-[17px] w-[17px]" /></button>
              </div>

              <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 flex-col gap-2 xl:flex">
                <button onClick={() => setNotice("You are at the first clip")} aria-label="Previous clip" className="grid h-9 w-9 place-items-center rounded-full border border-[#e3e8ef] bg-white/85 text-[#586780] shadow-sm hover:bg-white"><ChevronUp className="h-4 w-4" /></button>
                <button onClick={() => setNotice("You're all caught up")} aria-label="Next clip" className="grid h-9 w-9 place-items-center rounded-full border border-[#e3e8ef] bg-white/85 text-[#586780] shadow-sm hover:bg-white"><ChevronDown className="h-4 w-4" /></button>
              </div>
            </div>
          ) : (
            <div className="grid max-w-sm place-items-center px-6 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-[#e0e6f0] bg-white text-[#5474cb] shadow-sm"><Clapperboard className="h-6 w-6" /></span>
              <p className="mt-4 font-mono text-[9px] uppercase tracking-[.2em] text-[#8793a7]">{feed === "following" ? "Following" : "Search"}</p>
              <h2 className="mt-1 font-display text-[24px] font-bold tracking-[-.04em] text-[#24324d]">{feed === "following" ? "No clips from your circle yet." : "No clips found."}</h2>
              <p className="mt-2 text-[12px] leading-relaxed text-[#7d899e]">{feed === "following" ? "When people you follow share a short video, it will show up here." : `Nothing in this feed matches “${query}”. Try another name or phrase.`}</p>
              <button onClick={() => { setFeed("for-you"); setQuery(""); }} className="mt-5 rounded-full bg-[#315ed9] px-4 py-2 text-[11px] font-bold text-white shadow-[0_5px_14px_rgba(49,94,217,.2)] hover:bg-[#274fc1]">Back to For You</button>
            </div>
          )}
          <span className="pointer-events-none absolute bottom-3 left-5 hidden items-center gap-2 text-[9px] font-medium text-[#8a96a9] sm:flex"><span className="grid h-5 w-5 place-items-center rounded-full border border-[#e2e7ef] bg-white"><ArrowDown className="h-3 w-3" /></span>Scroll to move through clips</span>
        </div>
      </section>

      {infoOpen ? (
        <div className="absolute right-3 top-[66px] z-30 w-[min(330px,calc(100%-1.5rem))] rounded-2xl border border-[#e0e6ef] bg-white p-4 text-[#24324a] shadow-[0_20px_55px_rgba(30,49,82,.16)] lg:left-[236px] lg:right-auto lg:top-[85px]" role="dialog" aria-label="How this feed works">
          <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2 text-[12px] font-bold"><ShieldCheck className="h-4 w-4 text-[#3b72dc]" />A feed you can trust</div><button onClick={() => setInfoOpen(false)} aria-label="Close" className="rounded-full p-1 text-[#7e899b] hover:bg-[#f1f4f8]"><X className="h-4 w-4" /></button></div>
          <p className="mt-2 text-[11px] leading-relaxed text-[#718097]"><strong className="text-[#3c4b65]">{FEEDS.find((item) => item.id === feed)?.label}.</strong> Recommendations use follows and public viewing activity, never private chats. Community posts are kept in their own feed.</p>
          <div className="mt-3 flex items-center gap-2 border-t border-[#edf0f4] pt-3 text-[10px] font-semibold text-[#4c658a]"><Check className="h-3.5 w-3.5 text-[#3a9b77]" />No private messages used for recommendations</div>
        </div>
      ) : null}

      {notice ? <div role="status" className="absolute bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#1f2b43] px-4 py-2 text-[11px] font-semibold text-white shadow-lg">{notice}</div> : null}

      {commentsOpen ? (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[#152039]/35 p-3 backdrop-blur-[3px]" role="dialog" aria-modal="true" aria-label="Comments">
          <section className="flex max-h-[min(650px,92dvh)] w-full max-w-[430px] flex-col overflow-hidden rounded-[24px] border border-white/80 bg-[#fbfcfe] shadow-[0_24px_80px_rgba(20,35,62,.28)]">
            <header className="flex items-center justify-between border-b border-[#e8edf3] px-5 py-4"><div><h2 className="font-display text-[18px] font-bold tracking-[-.03em]">The conversation</h2><p className="mt-0.5 text-[10px] text-[#8994a6]">{localComments.length} thoughtful replies</p></div><button onClick={() => setCommentsOpen(false)} aria-label="Close comments" className="grid h-8 w-8 place-items-center rounded-full text-[#7b8799] hover:bg-[#edf1f6]"><X className="h-4 w-4" /></button></header>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {localComments.map((comment, index) => <article key={`${comment.name}-${index}`} className="flex gap-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[9px] font-bold ${index % 2 ? "bg-[#e2e8f8] text-[#3f5b9a]" : "bg-[#f3e5d9] text-[#71513e]"}`}>{comment.initials}</span><div className="min-w-0"><p className="text-[11px] font-bold text-[#34425a]">{comment.name} <span className="ml-1 font-normal text-[#9ba5b4]">{index === 0 && comment.name === "You" ? "now" : `${index + 1}h`}</span></p><p className="mt-1 text-[11px] leading-relaxed text-[#66758c]">{comment.text}</p></div></article>)}
            </div>
            <form onSubmit={submitComment} className="flex items-center gap-2 border-t border-[#e8edf3] bg-white px-4 py-3">
              <input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} aria-label="Write a comment" placeholder="Add to the conversation" className="h-10 min-w-0 flex-1 rounded-full border border-[#e3e8ef] bg-[#f7f9fb] px-4 text-[11px] outline-none focus:border-[#9bb0e8]" />
              <button type="submit" disabled={!commentDraft.trim()} className="rounded-full bg-[#315ed9] px-4 py-2.5 text-[10px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Reply</button>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
