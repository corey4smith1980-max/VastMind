"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Search, Smile, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { EMOJI, EMOJI_CATEGORIES, EMOJI_STICKERS, SKIN_TONES, TONEABLE_EMOJI, type EmojiCategory } from "@/components/chats/emoji-data";

/** Optional composer tools only prepare a draft; the member confirms by sending. */
export function ComposerTools({ append, sendSticker }: { append: (text: string) => void; sendSticker?: (emoji: string) => void }) {
  const [locating, setLocating] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"emoji" | "stickers">("emoji");
  const [category, setCategory] = useState<EmojiCategory | "recent" | "favorites">("recent");
  const [search, setSearch] = useState("");
  const [tone, setTone] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem("vastmind-emoji-recent") ?? "[]").filter((v: unknown) => typeof v === "string").slice(0, 24));
      setFavorites(JSON.parse(localStorage.getItem("vastmind-emoji-favorites") ?? "[]").filter((v: unknown) => typeof v === "string").slice(0, 100));
    } catch { /* A blocked or malformed local store should not block chat. */ }
    setStorageReady(true);
  }, []);
  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem("vastmind-emoji-recent", JSON.stringify(recent));
      localStorage.setItem("vastmind-emoji-favorites", JSON.stringify(favorites));
    } catch { /* Emoji selection remains usable when storage is unavailable. */ }
  }, [favorites, recent, storageReady]);

  const filteredEmoji = useMemo(() => {
    const list = search
      ? EMOJI.map((item) => item.symbol)
      : category === "recent" ? recent
      : category === "favorites" ? favorites
      : EMOJI.filter((item) => item.category === category).map((item) => item.symbol);
    const unique = [...new Set(list)];
    return unique.map((symbol) => {
      const item = EMOJI.find((entry) => entry.symbol === symbol);
      return { symbol, label: item?.label ?? "Emoji", category: item?.category };
    }).filter((item) => !search || item.label.toLowerCase().includes(search.toLowerCase()) || item.symbol.includes(search));
  }, [category, favorites, recent, search]);

  function toned(symbol: string) {
    return tone && TONEABLE_EMOJI.has(symbol) ? `${symbol.replace(/\uFE0F$/,"")}${tone}` : symbol;
  }
  function remember(symbol: string) {
    setRecent((items) => [symbol, ...items.filter((item) => item !== symbol)].slice(0, 24));
  }
  function addEmoji(symbol: string) {
    remember(symbol);
    append(toned(symbol));
  }
  function chooseSticker(symbol: string) {
    remember(symbol);
    if (sendSticker) sendSticker(symbol);
    else append(symbol);
    setOpen(false);
  }
  function toggleFavorite(symbol: string) {
    setFavorites((items) => items.includes(symbol) ? items.filter((item) => item !== symbol) : [symbol, ...items].slice(0, 100));
  }
  function location() {
    if (!navigator.geolocation) {
      toast({ title: "Location isn't supported in this browser", variant: "destructive" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setLocating(false);
      append(`My location (not live): https://www.google.com/maps?q=${coords.latitude.toFixed(6)},${coords.longitude.toFixed(6)}`);
    }, () => {
      setLocating(false);
      toast({ title: "Location not shared", description: "Allow location access in your browser, or type an address instead.", variant: "destructive" });
    }, { timeout: 12000, maximumAge: 60000, enableHighAccuracy: false });
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button type="button" size="icon" variant="ghost" aria-label="Emoji and location"><Smile className="h-5 w-5" /></Button></PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl p-3">
        <div className="mb-2 flex gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Emoji and stickers">
          <button type="button" role="tab" aria-selected={tab === "emoji"} onClick={() => setTab("emoji")} className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "emoji" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Emoji</button>
          <button type="button" role="tab" aria-selected={tab === "stickers"} onClick={() => setTab("stickers")} className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "stickers" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Stickers</button>
        </div>
        {tab === "emoji" ? <>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search emoji" className="h-9 rounded-xl pl-9" aria-label="Search emoji" />
          </label>
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1 scrollbar-thin" aria-label="Emoji categories">
            {EMOJI_CATEGORIES.map((item) => <button key={item.id} type="button" title={item.label} aria-label={item.label} aria-pressed={category === item.id} onClick={() => setCategory(item.id)} className={`h-8 min-w-8 rounded-lg text-base ${category === item.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>{item.icon}</button>)}
          </div>
          {category === "people" || category === "recent" || category === "favorites" ? (
            <div className="my-1 flex items-center gap-1" role="group" aria-label="Skin tone">
              <span className="mr-1 text-[10px] text-muted-foreground">Tone</span>
              <button type="button" aria-label="Default skin tone" aria-pressed={!tone} onClick={() => setTone("")} className={`rounded px-1 ${!tone ? "bg-muted" : ""}`}>👋</button>
              {SKIN_TONES.map((item) => <button key={item} type="button" aria-label={`Skin tone ${item}`} aria-pressed={tone === item} onClick={() => setTone(item)} className={`rounded px-1 ${tone === item ? "bg-muted" : ""}`}>{`👋${item}`}</button>)}
            </div>
          ) : null}
          <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto py-1 scrollbar-thin" aria-label="Emoji picker">
            {filteredEmoji.map(({symbol,label}) => <div key={symbol} className="group relative flex items-center justify-center">
              <button type="button" title={label} aria-label={`Insert ${label}`} className="grid h-9 w-9 place-items-center rounded-lg text-[22px] hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary" onClick={() => addEmoji(symbol)}>{toned(symbol)}</button>
              <button type="button" title={favorites.includes(symbol) ? "Remove favorite" : "Add favorite"} aria-label={favorites.includes(symbol) ? `Remove ${label} from favorites` : `Add ${label} to favorites`} onClick={() => toggleFavorite(symbol)} className="absolute -right-0.5 -top-0.5 rounded-full bg-card p-0.5 text-primary shadow-sm opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 md:opacity-0 opacity-100"><Star className={`h-3 w-3 ${favorites.includes(symbol) ? "fill-current" : ""}`} /></button>
            </div>)}
            {!filteredEmoji.length ? <p className="col-span-8 py-6 text-center text-xs text-muted-foreground">{category === "recent" ? "Your recently used emoji will appear here." : category === "favorites" ? "Tap a star to save favorites." : "No emoji found."}</p> : null}
          </div>
        </> : <div className="max-h-64 space-y-3 overflow-y-auto scrollbar-thin">
          {EMOJI_STICKERS.map((pack) => <section key={pack.name} aria-label={`${pack.name} sticker pack`}>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{pack.name} · VastMind originals</p>
            <div className="grid grid-cols-4 gap-1">
              {pack.items.map((symbol) => <button key={`${pack.name}-${symbol}`} type="button" onClick={() => chooseSticker(symbol)} title={`Send ${symbol} sticker`} aria-label={`Send ${symbol} sticker`} className="grid h-14 place-items-center rounded-xl bg-gradient-to-br from-primary/10 via-card to-accent/20 text-3xl transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary">{symbol}</button>)}
            </div>
          </section>)}
          <p className="text-[11px] leading-relaxed text-muted-foreground">Choose a sticker to send it as its own message. Custom and animated packs can be added later.</p>
        </div>}
        <Button type="button" variant="outline" className="mt-3 w-full" disabled={locating} onClick={location}>
          {locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />} Add current location
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">Adds a map link to your draft. Your location is only shared when you send it.</p>
      </PopoverContent>
    </Popover>
  );
}
