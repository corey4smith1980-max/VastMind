"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, ShoppingBag, Tag } from "lucide-react";
import {
  useCommerceListContentProducts, getCommerceListContentProductsQueryKey, useCommerceTagContent, useCommerceRecordEvent,
  useCommerceListShops, getCommerceListShopsQueryKey, useCommerceListProducts, getCommerceListProductsQueryKey,
  type CommerceProduct, type Post,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMe } from "@/lib/me";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";
import { mediaSrc, money } from "@/lib/commerce";
import { cn } from "@/lib/utils";
import { ProductDetail } from "./product-detail";
import { Thumb, selectClass } from "./bits";

const MAX_TAGS = 5;

function TagPicker({ post, current, open, onOpenChange }: { post: Post; current: CommerceProduct[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string[]>([]);
  const [shopId, setShopId] = useState("");
  useEffect(() => { if (open) setPicked(current.map((p) => p.id)); }, [open, current]);
  const shopParams = { scope: "mine" as const };
  const shops = useCommerceListShops(shopParams, { query: { queryKey: getCommerceListShopsQueryKey(shopParams), enabled: open } });
  const taggable = (shops.data?.items ?? []).filter((s) => s.role === "owner" || s.role === "manager" || s.role === "marketer" || s.role === "creator");
  useEffect(() => { if (!shopId && taggable[0]) setShopId(taggable[0].id); }, [taggable, shopId]);
  const prodParams = shopId ? { shopId } : { scope: "mine" as const };
  const products = useCommerceListProducts(prodParams, { query: { queryKey: getCommerceListProductsQueryKey(prodParams), enabled: open } });
  const tag = useCommerceTagContent({ mutation: {
    onSuccess: (list) => { qc.setQueryData(getCommerceListContentProductsQueryKey(post.id), list); onOpenChange(false); toast({ title: list.length ? `${list.length} product${list.length > 1 ? "s" : ""} tagged` : "Product tags removed" }); },
    onError: (e) => toast({ title: "Couldn't tag products", description: errMessage(e), variant: "destructive" }),
  } });
  const toggle = (id: string) => setPicked((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_TAGS ? s : [...s, id]);
  const items = products.data?.items.filter((p) => p.isPublished) ?? [];

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Tag products</DialogTitle><DialogDescription>Shoppers can open tagged products without leaving your post. Up to {MAX_TAGS} products; you can only tag shops where you're an approved team member or creator. No payouts are attached.</DialogDescription></DialogHeader>
      {taggable.length > 1 ? <label className="block text-sm font-medium">Shop<select className={cn(selectClass, "mt-1")} value={shopId} onChange={(e) => setShopId(e.target.value)} data-testid="select-tag-shop">{taggable.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}</select></label> : null}
      <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1" role="group" aria-label="Products">
        {products.isLoading || shops.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />) : null}
        {!products.isLoading && !items.length ? <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">No published products available to tag. Publish a product in Seller Center first, or ask a shop owner to approve you as a creator.</p> : null}
        {items.map((p) => { const on = picked.includes(p.id); return <button key={p.id} type="button" aria-pressed={on} disabled={!on && picked.length >= MAX_TAGS} onClick={() => toggle(p.id)}
          className={cn("flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors disabled:opacity-40", on ? "border-primary bg-primary/5" : "hover:bg-muted")} data-testid={`button-tag-product-${p.id}`}>
          <Thumb src={mediaSrc(p.gallery[0])} alt="" className="h-10 w-10 shrink-0 rounded-lg" />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.title}</span><span className="text-xs text-muted-foreground">{money(p.priceMinor, p.currency)}</span></span>
          <span className={cn("grid h-5 w-5 place-items-center rounded-full border", on && "border-primary bg-primary text-primary-foreground")}>{on ? <Check className="h-3 w-3" /> : null}</span>
        </button>; })}
      </div>
      <DialogFooter className="items-center gap-2 sm:justify-between">
        <span className="font-mono text-xs text-muted-foreground">{picked.length}/{MAX_TAGS} selected</span>
        <div className="flex gap-2"><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={tag.isPending} onClick={() => tag.mutate({ postId: post.id, data: { productIds: picked } })} data-testid="button-save-tags">{tag.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Save tags</Button></div>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

/** Shoppable chips for a post or clip. Product detail opens in a portal dialog so video playback stays mounted. */
export function ShoppableProducts({ post, tone = "light", className }: { post: Post; tone?: "light" | "dark"; className?: string }) {
  const me = useMe();
  const router = useRouter();
  const list = useCommerceListContentProducts(post.id, { query: { queryKey: getCommerceListContentProductsQueryKey(post.id), staleTime: 60_000 } });
  const [openId, setOpenId] = useState<string | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const event = useCommerceRecordEvent();
  const eventRef = useRef(event.mutate); eventRef.current = event.mutate;
  const products = list.data ?? [];
  const isAuthor = post.author.id === me.id;
  if (!products.length && !isAuthor) return null;
  const dark = tone === "dark";

  return <div className={cn("flex flex-wrap items-center gap-2", className)} data-testid={`shoppable-${post.id}`}>
    {products.map((p, i) => <button key={p.id} type="button" onClick={(e) => { e.stopPropagation(); setOpenId(p.id); if (p.shopId) eventRef.current({ data: { kind: "product_click", shopId: p.shopId, productId: p.id } }); }}
      className={cn("rise group flex max-w-[240px] items-center gap-2 rounded-full py-1 pl-1 pr-3 text-left text-xs transition-transform hover:-translate-y-0.5 active:scale-95", dark ? "bg-white/90 text-[hsl(var(--ink))] shadow-lg backdrop-blur" : "border bg-background hover:border-primary")}
      style={{ animationDelay: `${i * 60}ms` }} aria-label={`View ${p.title}, ${money(p.priceMinor, p.currency)}`} data-testid={`chip-product-${p.id}`}>
      <Thumb src={mediaSrc(p.gallery[0])} alt="" className="h-7 w-7 shrink-0 rounded-full" />
      <span className="min-w-0"><span className="block truncate font-semibold">{p.title}</span><span className="block text-[10px] opacity-70">{money(p.priceMinor, p.currency)}</span></span>
      <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
    </button>)}
    {isAuthor ? <button type="button" onClick={(e) => { e.stopPropagation(); setTagOpen(true); }} className={cn("flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors", dark ? "border border-white/30 bg-black/25 text-white hover:bg-white/15" : "border border-dashed text-muted-foreground hover:border-primary hover:text-primary")} data-testid={`button-tag-products-${post.id}`}>
      <Tag className="h-3 w-3" />{products.length ? "Edit product tags" : "Tag products"}
    </button> : null}
    <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader className="sr-only"><DialogTitle>Product</DialogTitle><DialogDescription>Product details from this post</DialogDescription></DialogHeader>
        {openId ? <ProductDetail productId={openId} onOpenCart={() => router.push("/shop?view=cart")} onOpenShop={(id) => router.push(`/shop?shop=${encodeURIComponent(id)}`)} /> : null}
      </DialogContent>
    </Dialog>
    {isAuthor ? <TagPicker post={post} current={products} open={tagOpen} onOpenChange={setTagOpen} /> : null}
  </div>;
}
