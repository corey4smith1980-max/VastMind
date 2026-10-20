"use client";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Package, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import {
  useCommerceListProducts, getCommerceListProductsQueryKey, useCommerceCreateProduct, useCommerceUpdateProduct,
  type CommerceMedia, type CommerceProduct, type CommerceProductInput, type CommerceShop,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MediaPicker } from "@/components/media-attachment";
import { EmptyState, ErrorState } from "@/components/states";
import { useToast } from "@/hooks/use-toast";
import { useInvalidate } from "@/lib/realtime";
import { errMessage } from "@/lib/format";
import { fromMinor, mediaSrc, money, toMinor } from "@/lib/commerce";
import { cn } from "@/lib/utils";
import { Pager, Thumb } from "../bits";

type VRow = { id?: string; label: string; sku: string; price: string; inventory: string };

function toInput(p: CommerceProduct, shopId: string): CommerceProductInput {
  return { shopId, title: p.title, description: p.description, category: p.category, priceMinor: p.priceMinor, inventory: p.inventory, isPublished: p.isPublished, mediaIds: p.gallery.map((m) => m.id), variants: p.variants.map((v) => ({ id: v.id, label: v.label, sku: v.sku, priceMinor: v.priceMinor, inventory: v.inventory })) };
}

function ProductEditor({ shop, product, onDone }: { shop: CommerceShop; product?: CommerceProduct; onDone: () => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const cur = shop.currency;
  const [f, setF] = useState({ title: product?.title ?? "", description: product?.description ?? "", category: product?.category ?? shop.category, price: product ? fromMinor(product.priceMinor, cur) : "", inventory: String(product?.inventory ?? 1), isPublished: product?.isPublished ?? true });
  const [gallery, setGallery] = useState<CommerceMedia[]>(product?.gallery ?? []);
  const [variants, setVariants] = useState<VRow[]>(product?.variants.map((v) => ({ id: v.id, label: v.label, sku: v.sku, price: fromMinor(v.priceMinor, cur), inventory: String(v.inventory) })) ?? []);
  const [touched, setTouched] = useState(false);
  const opts = { mutation: {
    onSuccess: () => { invalidate("/api/commerce"); toast({ title: product ? "Product updated" : "Product created" }); onDone(); },
    onError: (e: unknown) => toast({ title: "Couldn't save product", description: errMessage(e), variant: "destructive" }),
  } };
  const create = useCommerceCreateProduct(opts);
  const update = useCommerceUpdateProduct(opts);
  const busy = create.isPending || update.isPending;
  const priceMinor = toMinor(f.price, cur);
  const inv = Number(f.inventory);
  const vErr = variants.map((v) => !v.label.trim() || !v.sku.trim() || !(toMinor(v.price, cur) >= 1) || !Number.isInteger(Number(v.inventory)) || Number(v.inventory) < 0);
  const errors = { title: !f.title.trim() ? "Required" : "", category: !f.category.trim() ? "Required" : "", price: !(priceMinor >= 1) ? "Enter a price above zero" : "", inventory: !Number.isInteger(inv) || inv < 0 ? "Whole number, 0 or more" : "", variants: vErr.some(Boolean) ? "Every option needs a label, SKU, price and stock" : "" };
  const err = (k: keyof typeof errors) => touched && errors[k] ? <p className="mt-1 text-[11px] text-destructive" role="alert">{errors[k]}</p> : null;

  function save() {
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    const data: CommerceProductInput = {
      shopId: shop.id, title: f.title.trim(), description: f.description.trim(), category: f.category.trim(), priceMinor, inventory: inv, isPublished: f.isPublished,
      mediaIds: gallery.map((m) => m.id),
      variants: variants.map((v) => ({ ...(v.id ? { id: v.id } : {}), label: v.label.trim(), sku: v.sku.trim(), priceMinor: toMinor(v.price, cur), inventory: Number(v.inventory) })),
    };
    if (product) update.mutate({ productId: product.id, data }); else create.mutate({ data });
  }
  const setV = (i: number, k: keyof VRow, val: string) => setVariants((vs) => vs.map((v, j) => j === i ? { ...v, [k]: val } : v));

  return <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
    {product && !product.shopId ? <p className="rounded-xl bg-[hsl(var(--brand-violet)/.08)] p-3 text-xs">This is a classic listing. Saving it here moves it into {shop.name} ({shop.currency}); only listings already priced in {shop.currency} can move.</p> : null}
    <div>
      <Label>Photos ({gallery.length}/8)</Label>
      <div className="mt-2 flex flex-wrap gap-2">
        {gallery.map((m, i) => <div key={m.id} className="group relative"><Thumb src={mediaSrc(m)} alt={m.name} className="h-20 w-20 rounded-xl border" />{i === 0 ? <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1 text-[9px] font-semibold">Cover</span> : null}<button type="button" onClick={() => setGallery((g) => g.filter((x) => x.id !== m.id))} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-foreground text-background opacity-90" aria-label={`Remove ${m.name}`}><X className="h-3 w-3" /></button></div>)}
        {gallery.length < 8 ? <div className="grid h-20 w-20 place-items-center rounded-xl border border-dashed"><MediaPicker purpose="product" value={undefined} onChange={(m) => m && setGallery((g) => g.length < 8 && !g.some((x) => x.id === m.id) ? [...g, m] : g)} /></div> : null}
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Label htmlFor="p-title">Title</Label><Input id="p-title" maxLength={180} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-invalid={touched && !!errors.title} data-testid="input-product-title" />{err("title")}</div>
      <div><Label htmlFor="p-cat">Category</Label><Input id="p-cat" maxLength={80} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />{err("category")}</div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor="p-price">Base price ({cur})</Label><Input id="p-price" type="number" min="0" step="any" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} aria-invalid={touched && !!errors.price} data-testid="input-product-price" />{err("price")}</div>
        <div><Label htmlFor="p-inv">Stock</Label><Input id="p-inv" type="number" min="0" step="1" value={f.inventory} disabled={variants.length > 0} onChange={(e) => setF({ ...f, inventory: e.target.value })} data-testid="input-product-stock" />{variants.length ? <p className="mt-1 text-[10px] text-muted-foreground">Tracked per option</p> : err("inventory")}</div>
      </div>
      <div className="sm:col-span-2"><Label htmlFor="p-desc">Description</Label><Textarea id="p-desc" rows={4} maxLength={10000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
    </div>
    <fieldset className="rounded-2xl border p-4">
      <legend className="px-1 text-sm font-semibold">Options and SKUs</legend>
      {variants.length === 0 ? <p className="text-xs text-muted-foreground">Add options such as sizes or colours, each with its own SKU, price and stock.</p> : null}
      <div className="space-y-2">
        {variants.map((v, i) => <div key={v.id ?? `new-${i}`} className={cn("grid grid-cols-2 gap-2 rounded-xl p-2 sm:grid-cols-[1.3fr_1fr_1fr_.8fr_auto]", touched && vErr[i] && "bg-destructive/5")}>
          <Input aria-label={`Option ${i + 1} label`} placeholder="Label, e.g. Large" maxLength={100} value={v.label} onChange={(e) => setV(i, "label", e.target.value)} />
          <Input aria-label={`Option ${i + 1} SKU`} placeholder="SKU" className="font-mono" maxLength={80} value={v.sku} onChange={(e) => setV(i, "sku", e.target.value)} />
          <Input aria-label={`Option ${i + 1} price`} placeholder="Price" type="number" min="0" step="any" value={v.price} onChange={(e) => setV(i, "price", e.target.value)} />
          <Input aria-label={`Option ${i + 1} stock`} placeholder="Stock" type="number" min="0" step="1" value={v.inventory} onChange={(e) => setV(i, "inventory", e.target.value)} />
          <Button type="button" size="icon" variant="ghost" aria-label={`Remove option ${i + 1}`} onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
        </div>)}
      </div>
      {err("variants")}
      {variants.length < 50 ? <Button type="button" size="sm" variant="outline" className="mt-3 rounded-full" onClick={() => setVariants((vs) => [...vs, { label: "", sku: "", price: f.price, inventory: "0" }])} data-testid="button-add-variant"><Plus className="mr-1 h-3.5 w-3.5" />Add option</Button> : null}
    </fieldset>
    <label className="flex items-center justify-between rounded-2xl border p-4 text-sm"><span><span className="block font-medium">Published</span><span className="text-xs text-muted-foreground">Drafts are only visible to your team.</span></span><Switch checked={f.isPublished} onCheckedChange={(v) => setF({ ...f, isPublished: v })} /></label>
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button><Button type="submit" className="rounded-full px-6" disabled={busy} data-testid="button-save-product">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{product ? "Save product" : "Create product"}</Button></div>
  </form>;
}

export function Catalog({ shop }: { shop: CommerceShop }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const [scope, setScope] = useState<"shop" | "legacy">("shop");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const t = window.setTimeout(() => setDq(q.trim()), 250); return () => window.clearTimeout(t); }, [q]);
  const [stack, setStack] = useState<string[]>([]);
  useEffect(() => setStack([]), [scope, dq, shop.id]);
  const [editing, setEditing] = useState<CommerceProduct | "new" | null>(null);
  const params = { ...(scope === "shop" ? { shopId: shop.id } : { scope: "mine" as const }), ...(dq ? { q: dq } : {}), ...(stack.length ? { cursor: stack[stack.length - 1] } : {}) };
  const list = useCommerceListProducts(params, { query: { queryKey: getCommerceListProductsQueryKey(params) } });
  const items = (list.data?.items ?? []).filter((p) => scope === "shop" || !p.shopId);
  const toggle = useCommerceUpdateProduct({ mutation: {
    onSuccess: (p) => { invalidate("/api/commerce/products"); toast({ title: p.isPublished ? "Product published" : "Moved to drafts" }); },
    onError: (e) => toast({ title: "Couldn't update product", description: errMessage(e), variant: "destructive" }),
  } });
  const stockOf = (p: CommerceProduct) => p.variants.length ? p.variants.reduce((s, v) => s + v.inventory, 0) : p.inventory;

  return <section>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex rounded-full border bg-card p-1" role="group" aria-label="Catalog">{([["shop", "This shop"], ["legacy", "Classic listings"]] as const).map(([k, l]) => <button key={k} aria-pressed={scope === k} onClick={() => setScope(k)} className={cn("rounded-full px-3.5 py-1.5 text-sm transition-colors", scope === k ? "bg-foreground text-background" : "text-muted-foreground")}>{l}</button>)}</div>
      <label className="relative min-w-48 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search catalog" className="h-9 rounded-full pl-9" aria-label="Search catalog" /></label>
      <Button className="rounded-full" onClick={() => setEditing("new")} data-testid="button-new-product"><Plus className="mr-1 h-4 w-4" />New product</Button>
    </div>
    {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : null}
    {list.isLoading ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div> : null}
    {list.data && !items.length ? <EmptyState icon={Package} title={scope === "shop" ? "No products yet" : "No classic listings"} body={scope === "shop" ? "Create your first product with photos, options and stock." : "Older listings created before shops appear here. Edit one to move it into this shop."} action={scope === "shop" ? <Button className="rounded-full" onClick={() => setEditing("new")}>Create product</Button> : undefined} /> : null}
    {items.length ? <div className="overflow-hidden rounded-[1.4rem] border bg-card">
      <div className="hidden grid-cols-[1fr_120px_90px_110px_120px] gap-3 border-b bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:grid"><span>Product</span><span>Price</span><span>Stock</span><span>Status</span><span className="text-right">Actions</span></div>
      <ul className="divide-y">{items.map((p) => { const st = stockOf(p); return <li key={p.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 md:grid-cols-[1fr_120px_90px_110px_120px]" data-testid={`row-product-${p.id}`}>
        <div className="flex min-w-0 items-center gap-3"><Thumb src={mediaSrc(p.gallery[0])} alt="" className="h-12 w-12 shrink-0 rounded-xl" /><div className="min-w-0"><p className="truncate font-medium">{p.title}</p><p className="truncate text-xs text-muted-foreground">{p.category}{p.variants.length ? ` · ${p.variants.length} options` : ""}{p.reviewCount ? ` · ${p.rating.toFixed(1)} rating` : ""}</p></div></div>
        <span className="hidden text-sm tabular-nums md:block">{money(p.priceMinor, p.currency)}</span>
        <span className={cn("hidden text-sm tabular-nums md:block", st === 0 ? "text-destructive" : st <= 5 ? "text-[hsl(var(--brand-magenta))]" : "")}>{st}</span>
        <span className="hidden md:block"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", p.isPublished ? "bg-online/12 text-online" : "bg-muted text-muted-foreground")}>{p.isPublished ? "Live" : "Draft"}</span></span>
        <div className="flex justify-end gap-1">
          {p.shopId ? <Button size="icon" variant="ghost" aria-label={p.isPublished ? `Unpublish ${p.title}` : `Publish ${p.title}`} disabled={toggle.isPending} onClick={() => toggle.mutate({ productId: p.id, data: { ...toInput(p, p.shopId!), isPublished: !p.isPublished } })}>{p.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button> : null}
          <Button size="icon" variant="ghost" aria-label={`Edit ${p.title}`} onClick={() => setEditing(p)} data-testid={`button-edit-product-${p.id}`}><Pencil className="h-4 w-4" /></Button>
        </div>
      </li>; })}</ul>
    </div> : null}
    {list.data ? <Pager stack={stack} next={list.data.nextCursor} onChange={setStack} label="Catalog" /> : null}
    <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{editing === "new" ? "New product" : "Edit product"}</DialogTitle><DialogDescription>Prices in {shop.currency}. Buyers always see the server-confirmed total at checkout.</DialogDescription></DialogHeader>
        {editing ? <ProductEditor key={editing === "new" ? "new" : editing.id} shop={shop} product={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} /> : null}
      </DialogContent>
    </Dialog>
  </section>;
}
