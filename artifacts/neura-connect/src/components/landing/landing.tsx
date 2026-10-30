"use client";
import Link from "next/link";
import {
  ArrowRight, BellRing, Briefcase, CheckCheck, CircleDashed, Lock, MessagesSquare, Newspaper, Radio, ShieldCheck, ShoppingBag, Video, Zap,
} from "lucide-react";
import { BrandMark, Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { basePath } from "@/lib/base";

// ---------- Small abstract UI fragments (no invented people or messages) ----------
function Bar({ w, tone = "muted" }: { w: string; tone?: "muted" | "ink" | "primary" | "accent" }) {
  const c = { muted: "bg-foreground/10", ink: "bg-[hsl(var(--ink))]", primary: "bg-primary", accent: "bg-accent" }[tone];
  return <span className={`block h-2.5 rounded-full ${c}`} style={{ width: w }} />;
}

function ChatSketch() {
  return (
    <div className="space-y-3 rounded-[1.6rem] border bg-card p-5 shadow-[0_30px_60px_-35px_hsl(var(--ink)/.5)]">
      <div className="flex items-center gap-3 border-b pb-3">
        <span className="relative h-9 w-9 rounded-full bg-accent/60"><span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-online" /></span>
        <div className="flex-1 space-y-1.5"><Bar w="40%" tone="ink" /><Bar w="22%" /></div>
      </div>
      <div className="max-w-[70%] space-y-1.5 rounded-2xl rounded-bl-md bg-muted p-3"><Bar w="100%" /><Bar w="70%" /></div>
      <div className="ml-auto max-w-[70%] space-y-1.5 rounded-2xl rounded-br-md bg-[hsl(var(--bubble-mine))] p-3">
        <span className="block h-2.5 w-full rounded-full bg-white/30" /><span className="block h-2.5 w-1/2 rounded-full bg-white/30" />
        <CheckCheck className="ml-auto h-3.5 w-3.5 text-accent" />
      </div>
      <div className="flex gap-1 rounded-2xl bg-muted px-3 py-2.5 w-14">
        {[0, 1, 2].map((i) => <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-foreground/50" style={{ animationDelay: `${i * 0.15}s` }} />)}
      </div>
    </div>
  );
}

const LINES = [
  { icon: MessagesSquare, title: "Chats & groups", body: "Private conversations, group chats, voice notes, media sharing and the people you choose to connect with.", span: "md:col-span-2 md:row-span-2", tone: "bg-[hsl(var(--ink))] text-[#f4ece0]" },
  { icon: Video, title: "Feed", body: "Watch short videos and catch up on posts, polls and conversations in one scroll.", span: "", tone: "bg-card" },
  { icon: ShoppingBag, title: "Shop", body: "Discover products, follow shops and manage orders in the same place you connect.", span: "", tone: "bg-accent/40" },
  { icon: Newspaper, title: "Home posts", body: "Share updates, photos and polls with the people you follow.", span: "", tone: "bg-card" },
  { icon: Radio, title: "Channels & status", body: "Follow updates from channels and share personal stories that expire after 24 hours.", span: "", tone: "bg-primary/15" },
];

export function Landing() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-30 border-b border-transparent bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" aria-label="VastMind home" className="flex shrink-0 items-center gap-2.5">
            <BrandMark className="h-12 w-12 sm:h-14 sm:w-14" />
            <Wordmark className="hidden h-8 w-[190px] sm:inline sm:h-9 sm:w-[190px]" />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#lines" className="hover:text-foreground">What's inside</a>
            <a href="#business" className="hover:text-foreground">For shops</a>
            <a href="#privacy" className="hover:text-foreground">Privacy</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="rounded-full"><Link href="/sign-in" data-testid="link-sign-in">Sign in</Link></Button>
            <Button asChild className="rounded-full"><Link href="/sign-up" data-testid="link-sign-up">Get started</Link></Button>
          </div>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 md:grid-cols-[1.15fr_1fr] md:pt-16">
        <div className="rise">
            <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
             <span className="h-1.5 w-1.5 rounded-full bg-online" /> One place to connect and grow
          </p>
          <h1 className="font-display mt-6 text-[clamp(2.8rem,7.5vw,6rem)] font-extrabold leading-[0.92]">
            Your people.<br /><span className="brand-gradient-text">Your next move.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground">
            Chat with friends, share posts, watch the Feed and discover independent shops—all from one VastMind ID.
          </p>
          <p className="mt-4 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Chat <span className="text-[#08cfe9]">•</span> Connect <span className="text-[#3568ff]">•</span> Manage <span className="text-[#823cff]">•</span> Grow
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-12 rounded-full px-7 text-base"><Link href="/sign-up">Create your VastMind ID <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
            <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-7 text-base"><Link href="/sign-in">Sign in</Link></Button>
          </div>
        </div>
        <div className="rise relative" style={{ animationDelay: "120ms" }}>
          <div className="overflow-hidden rounded-[2.2rem] border shadow-[0_40px_90px_-40px_hsl(var(--ink)/.6)]">
            <img src={`${basePath}/hero-switchboard.jpg`} alt="Illustrated neighbourhood at dusk with glowing lines connecting the windows" className="aspect-[4/5] w-full object-cover" />
          </div>
          <div className="absolute -bottom-8 -left-4 w-64 sm:-left-10"><ChatSketch /></div>
        </div>
      </section>

      {/* ---------- Marquee ---------- */}
      <div className="overflow-hidden border-y bg-[hsl(var(--ink))] py-4 text-[#f4ece0]">
        <div className="flex w-max animate-[marquee_28s_linear_infinite] gap-10 font-display text-2xl font-semibold">
          {Array.from({ length: 2 }).flatMap((_, k) =>
            ["Private chats", "Short videos", "Home posts", "Creator shops", "Polls", "Stories", "Orders", "Channels"].map((t) => (
              <span key={`${k}-${t}`} className="flex items-center gap-10">{t}<span className="h-2 w-2 rounded-full bg-primary" /></span>
            )),
          )}
        </div>
      </div>
      <style>{`@keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } } @media (prefers-reduced-motion: reduce){ .animate-\\[marquee_28s_linear_infinite\\]{animation:none} }`}</style>

      {/* ---------- Five lines bento ---------- */}
      <section id="lines" className="mx-auto max-w-6xl px-5 py-24">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">A little more connected</p>
        <h2 className="font-display mt-3 max-w-2xl text-4xl font-bold sm:text-5xl">The parts of everyday life, together.</h2>
        <div className="mt-12 grid auto-rows-[minmax(190px,auto)] gap-4 md:grid-cols-4">
          {LINES.map((l, i) => (
            <article key={l.title} className={`rise flex flex-col justify-between rounded-[1.8rem] border p-6 ${l.span} ${l.tone}`} style={{ animationDelay: `${i * 70}ms` }}>
              <l.icon className="h-6 w-6" />
              <div>
                <h3 className="font-display mt-6 text-2xl font-semibold">{l.title}</h3>
                <p className="mt-2 text-sm opacity-80">{l.body}</p>
                {i === 0 ? <div className="mt-6 max-w-sm text-foreground"><ChatSketch /></div> : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- Business ---------- */}
      <section id="business" className="bg-card/60 py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 md:grid-cols-2">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">For makers, shops and creators</p>
            <h2 className="font-display mt-3 text-4xl font-bold sm:text-5xl">Build your shop where your customers already are.</h2>
            <p className="mt-4 max-w-xl text-muted-foreground">Show what you make, share it in your Feed, and keep customer conversations and orders organized in one place.</p>
            <ul className="mt-8 space-y-4 text-muted-foreground">
              <li className="flex gap-3"><Briefcase className="h-5 w-5 shrink-0 text-primary" /> Add products, manage inventory and keep your storefront up to date.</li>
              <li className="flex gap-3"><Zap className="h-5 w-5 shrink-0 text-primary" /> Organize incoming orders and customer conversations in your business tools.</li>
              <li className="flex gap-3"><BellRing className="h-5 w-5 shrink-0 text-primary" /> Share trackable links and review activity from your shop.</li>
            </ul>
          </div>
          <div className="rounded-[2rem] border bg-background p-6">
            <div className="flex items-center justify-between rounded-2xl bg-card p-4">
              <span className="font-display text-lg font-semibold">Your shop, at a glance</span>
              <span className="flex h-7 w-12 items-center rounded-full bg-online p-1"><span className="ml-auto h-5 w-5 rounded-full bg-white" /></span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {["Products", "Orders", "Activity"].map((k) => (
                <div key={k} className="rounded-2xl bg-card p-4"><p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{k}</p><span className="mt-3 block h-6 w-10 rounded-md bg-foreground/10" /></div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Catalog", "Inventory", "Campaigns", "Customers"].map((q) => <span key={q} className="rounded-full border bg-accent/30 px-3 py-1.5 text-sm font-medium">{q}</span>)}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Payment is arranged directly with the seller. VastMind does not collect card details or process payments here.</p>
          </div>
        </div>
      </section>

      {/* ---------- Privacy ---------- */}
      <section id="privacy" className="mx-auto max-w-6xl px-5 py-24">
        <div className="grid gap-10 md:grid-cols-[1fr_1.2fr]">
          <div>
            <ShieldCheck className="h-8 w-8 text-primary" />
            <h2 className="font-display mt-4 text-4xl font-bold">Your connections, on your terms.</h2>
            <p className="mt-4 text-muted-foreground">Choose how people reach you, manage who can see your profile and end sign-ins you no longer use.</p>
          </div>
          <div className="divide-y rounded-[1.8rem] border bg-card">
            {[
              ["Find people", "Search by username"],
              ["Status visibility", "Mutual contacts"],
              ["Signed-in devices", "Review and revoke sessions"],
              ["Passkeys", "Available for VastMind IDs"],
              ["Block & report", "Tools for safer conversations"],
            ].map(([a, b]) => (
              <div key={a} className="flex items-center justify-between gap-4 p-5"><span className="flex items-center gap-3 font-medium"><Lock className="h-4 w-4 text-muted-foreground" />{a}</span><span className="text-right text-sm text-muted-foreground">{b}</span></div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Social posts and marketplace ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="overflow-hidden rounded-[2rem] bg-[hsl(var(--ink))] p-8 text-[#f4ece0] sm:p-12">
          <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">Your network</p>
              <h3 className="font-display mt-3 max-w-2xl text-3xl font-bold sm:text-4xl">Share a moment. Find your next favorite shop.</h3>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70">Post updates, photos and polls for people you follow, then explore products from independent sellers.</p>
            </div>
            <Button asChild size="lg" className="h-12 rounded-full px-7 text-base"><Link href="/sign-up">Join VastMind <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
          </div>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="bg-[hsl(var(--ink))] px-5 py-24 text-center text-[#f4ece0]">
        <h2 className="font-display mx-auto max-w-3xl text-5xl font-extrabold leading-[0.95] sm:text-7xl">All your socials.<br /><span className="brand-gradient-text">One VastMind.</span></h2>
        <Button asChild size="lg" className="mt-10 h-12 rounded-full px-8 text-base"><Link href="/sign-up">Create your VastMind ID</Link></Button>
      </section>
      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row">
        <span className="flex items-center gap-2"><BrandMark className="h-6 w-6" /> VastMind</span>
        <span>Made for real friends, real neighbourhoods and real shops.</span>
      </footer>
    </div>
  );
}
