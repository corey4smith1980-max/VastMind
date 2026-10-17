"use client";
import Link from "next/link";
import {
  ArrowRight, BellRing, Briefcase, CheckCheck, CircleDashed, Lock, MessagesSquare, Newspaper, Radio, ShieldCheck, UsersRound, Zap,
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
  { icon: MessagesSquare, title: "Chats & groups", body: "One-to-one and group conversations with read receipts, typing, member roles and invite links.", span: "md:col-span-2 md:row-span-2", tone: "bg-[hsl(var(--ink))] text-[#f4ece0]" },
  { icon: Newspaper, title: "Feed", body: "Posts and polls from your circles. React, comment, vote.", span: "", tone: "bg-card" },
  { icon: UsersRound, title: "Communities", body: "Open or request-to-join spaces, run by the people who started them.", span: "", tone: "bg-accent/40" },
  { icon: Radio, title: "Channels", body: "One voice, many listeners. Publish updates and pin what matters.", span: "", tone: "bg-card" },
  { icon: CircleDashed, title: "Status", body: "A line of text that disappears after 24 hours.", span: "", tone: "bg-primary/15" },
];

export function Landing() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-30 border-b border-transparent bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2.5"><BrandMark /><Wordmark className="hidden sm:inline" /></Link>
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
            <span className="h-1.5 w-1.5 rounded-full bg-online" /> The everyday social switchboard
          </p>
          <h1 className="font-display mt-6 text-[clamp(2.8rem,7.5vw,6rem)] font-extrabold leading-[0.92]">
            Your people,<br /><span className="text-primary">on one line.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground">
            Friends, neighbours, the running club and the shop that does your coffee — chats, communities, channels and a calm feed, without five different apps.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-12 rounded-full px-7 text-base"><Link href="/sign-up">Open your line <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
            <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-7 text-base"><Link href="/sign-in">I already have one</Link></Button>
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
            ["Direct messages", "Group chats", "Communities", "Channels", "Polls", "24h status", "Quick replies", "Read receipts"].map((t) => (
              <span key={`${k}-${t}`} className="flex items-center gap-10">{t}<span className="h-2 w-2 rounded-full bg-primary" /></span>
            )),
          )}
        </div>
      </div>
      <style>{`@keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } } @media (prefers-reduced-motion: reduce){ .animate-\\[marquee_28s_linear_infinite\\]{animation:none} }`}</style>

      {/* ---------- Five lines bento ---------- */}
      <section id="lines" className="mx-auto max-w-6xl px-5 py-24">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">Five lines, one switchboard</p>
        <h2 className="font-display mt-3 max-w-2xl text-4xl font-bold sm:text-5xl">Everything that used to live in separate apps.</h2>
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
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">For the corner shop</p>
            <h2 className="font-display mt-3 text-4xl font-bold sm:text-5xl">Run a small business from the same app you text your mum on.</h2>
            <ul className="mt-8 space-y-4 text-muted-foreground">
              <li className="flex gap-3"><Briefcase className="h-5 w-5 shrink-0 text-primary" /> Flip your shop open or closed so customers know when you'll answer.</li>
              <li className="flex gap-3"><Zap className="h-5 w-5 shrink-0 text-primary" /> Save quick replies — opening hours, directions, prices — and drop them into any chat.</li>
              <li className="flex gap-3"><BellRing className="h-5 w-5 shrink-0 text-primary" /> See real inbox numbers: unread customer chats, customers, response rate.</li>
            </ul>
          </div>
          <div className="rounded-[2rem] border bg-background p-6">
            <div className="flex items-center justify-between rounded-2xl bg-card p-4">
              <span className="font-display text-lg font-semibold">Open for messages</span>
              <span className="flex h-7 w-12 items-center rounded-full bg-online p-1"><span className="ml-auto h-5 w-5 rounded-full bg-white" /></span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {["Unread", "Customers", "Response"].map((k) => (
                <div key={k} className="rounded-2xl bg-card p-4"><p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{k}</p><span className="mt-3 block h-6 w-10 rounded-md bg-foreground/10" /></div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Hours", "Directions", "Price list", "Thanks!"].map((q) => <span key={q} className="rounded-full border bg-accent/30 px-3 py-1.5 text-sm font-medium">/{q.toLowerCase().replace(/[^a-z]/g, "")}</span>)}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Privacy ---------- */}
      <section id="privacy" className="mx-auto max-w-6xl px-5 py-24">
        <div className="grid gap-10 md:grid-cols-[1fr_1.2fr]">
          <div>
            <ShieldCheck className="h-8 w-8 text-primary" />
            <h2 className="font-display mt-4 text-4xl font-bold">You decide who gets through.</h2>
            <p className="mt-4 text-muted-foreground">Real accounts, no strangers by default. Blocking and reporting are one tap away in every conversation.</p>
          </div>
          <div className="divide-y rounded-[1.8rem] border bg-card">
            {[
              ["Who can message you", "Everyone · Contacts · Nobody"],
              ["Who can see your profile", "Everyone · Contacts · Nobody"],
              ["Show when you're online", "On or off"],
              ["Show last seen", "On or off"],
              ["Block & report", "In every chat, for every member"],
            ].map(([a, b]) => (
              <div key={a} className="flex items-center justify-between gap-4 p-5"><span className="flex items-center gap-3 font-medium"><Lock className="h-4 w-4 text-muted-foreground" />{a}</span><span className="text-right text-sm text-muted-foreground">{b}</span></div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Honesty note ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="rounded-[1.8rem] border border-dashed p-8 md:flex md:items-center md:justify-between md:gap-10">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">Coming later</p>
            <h3 className="font-display mt-2 text-2xl font-semibold">Photos, voice notes and GIFs aren't here yet.</h3>
          </div>
          <p className="mt-3 max-w-md text-sm text-muted-foreground md:mt-0">We'd rather ship words that work today than buttons that don't. Media sharing arrives in a future update.</p>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="bg-[hsl(var(--ink))] px-5 py-24 text-center text-[#f4ece0]">
        <h2 className="font-display mx-auto max-w-3xl text-5xl font-extrabold leading-[0.95] sm:text-7xl">Pick up.<br /><span className="text-primary">Someone's on the line.</span></h2>
        <Button asChild size="lg" className="mt-10 h-12 rounded-full px-8 text-base"><Link href="/sign-up">Create your account</Link></Button>
      </section>
      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row">
        <span className="flex items-center gap-2"><BrandMark className="h-6 w-6" /> I AM</span>
        <span>Made for real friends, real neighbourhoods and real shops.</span>
      </footer>
    </div>
  );
}
