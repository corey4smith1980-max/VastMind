"use client";

import { useState } from "react";
import { Loader2, MapPin, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

const emoji = [
  ["😊", "Smile"], ["❤️", "Heart"], ["👍", "Thumbs up"], ["😂", "Laugh"],
  ["🎉", "Celebrate"], ["🙏", "Thank you"], ["👋", "Wave"], ["✅", "Done"],
  ["🤔", "Thinking"], ["👏", "Applause"], ["☕", "Coffee"], ["✨", "Sparkles"],
];

/** Optional composer tools only prepare a draft; the member confirms by sending. */
export function ComposerTools({ append }: { append: (text: string) => void }) {
  const [locating, setLocating] = useState(false);
  const { toast } = useToast();
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
    <Popover>
      <PopoverTrigger asChild><Button type="button" size="icon" variant="ghost" aria-label="Emoji and location"><Smile className="h-5 w-5" /></Button></PopoverTrigger>
      <PopoverContent align="start" className="w-64 rounded-2xl">
        <div className="grid grid-cols-4 gap-1" aria-label="Emoji picker">
          {emoji.map(([symbol, name]) => <Button key={name} type="button" variant="ghost" aria-label={name} className="text-xl" onClick={() => append(symbol)}>{symbol}</Button>)}
        </div>
        <Button type="button" variant="outline" className="mt-3 w-full" disabled={locating} onClick={location}>
          {locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />} Add current location
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">Adds a map link to your draft. Your location is only shared when you send it.</p>
      </PopoverContent>
    </Popover>
  );
}
