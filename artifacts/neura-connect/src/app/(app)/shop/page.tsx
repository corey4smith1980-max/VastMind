"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Check, ChevronDown, CircleAlert, Minus, Package, Plus, Search, ShoppingBag, ShoppingCart, Store, Trash2 } from "lucide-react";
import {
  getListShopOrdersQueryKey, getListShopProductsQueryKey, useCreateShopProduct, useListShopOrders, useListShopProducts, usePlaceShopOrder,
  useUpdateShopOrder, useUpdateShopProduct, type MediaAttachment, type ShopOrder, type ShopOrderUpdate, type ShopProduct,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { PageScroll } from "@/components/page-scroll";
import { EmptyState, ErrorState } from "@/components/states";
import { MediaPicker } from "@/components/media-attachment";
import { useMe } from "@/lib/me";
import { useToast } from "@/hooks/use-toast";
import { useInvalidate, usePollInterval } from "@/lib/realtime";
import { errMessage } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "discover" | "my-shop" | "orders";
type CartLine = { product: ShopProduct; quantity: number };
type ProductDraft = { title: string; description: string; category: string; price: string; currency: string; inventory: string; isPublished: boolean };
const blankDraft: ProductDraft = { title: "", description: "", category: "General", price: "", currency: "USD", inventory: "1", isPublished: true };

function exponent(currency: string) {
  try { return new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2; }
  catch { return 2; }
}
function money(minor: number, currency: string) {
  try {
    const digits = exponent(currency);
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(minor / 10 ** digits);
  } catch { return `${currency} ${(minor / 100).toFixed(2)}`; }
}
function toMinor(value: string, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 10 ** exponent(currency));
}
function statusLabel(status: ShopOrder["status"]) {
  return ({ pending: "Awaiting seller", confirmed: "Confirmed", preparing: "Preparing", completed: "Completed", cancelled: "Cancelled" })[status];
}

function ProductEditor({ product, onClose, onSaved }: { product?: ShopProduct; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const create = useCreateShopProduct();
  const update = useUpdateShopProduct();
  const [draft, setDraft] = useState<ProductDraft>(product ? {
    title: product.title, description: product.description, category: product.category,
    price: String(product.priceMinor / 10 ** exponent(product.currency)), currency: product.currency,
    inventory: String(product.inventory), isPublished: product.isPublished,
  } : blankDraft);
  const [image, setImage] = useState<MediaAttachment>();
  const busy = create.isPending || update.isPending;

  function save() {
    const currency = draft.currency.trim().toUpperCase();
    const priceMinor = toMinor(draft.price, currency);
    const inventory = Number(draft.inventory);
    if (!draft.title.trim() || !priceMinor || !/^[A-Z]{3}$/.test(currency) || !Number.isInteger(inventory) || inventory < 0) {
      toast({ title: "Check the product details", description: "Add a title, valid price, three-letter currency, and whole-unit stock count.", variant: "destructive" });
      return;
    }
    try { new Intl.NumberFormat("en", { style: "currency", currency }).format(0); }
    catch { toast({ title: "Choose a supported currency code", variant: "destructive" }); return; }
    const common = {
      title: draft.title.trim(), description: draft.description.trim(), category: draft.category.trim() || "General",
      priceMinor, currency, inventory, isPublished: draft.isPublished,
    };
    if (product) {
      update.mutate({ productId: product.id, data: { ...common, ...(image ? { imageMediaId: image.id } : {}) } }, {
        onSuccess: () => { invalidate("/api/shop/products"); toast({ title: "Listing updated" }); onSaved(); },
        onError: (error) => toast({ title: "Couldn't update the listing", description: errMessage(error), variant: "destructive" }),
      });
    } else {
      create.mutate({ data: { ...common, ...(image ? { imageMediaId: image.id } : {}) } }, {
        onSuccess: () => { invalidate("/api/shop/products"); toast({ title: "Product added to your shop" }); onSaved(); },
        onError: (error) => toast({ title: "Couldn't save the listing", description: errMessage(error), variant: "destructive" }),
      });
    }
  }

  return <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-6" aria-labelledby="product-editor-title">
    <div className="mb-4 flex items-start justify-between gap-3">
      <div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">Seller studio</p><h2 id="product-editor-title" className="mt-1 font-display text-2xl font-semibold">{product ? "Edit listing" : "Add a product"}</h2></div>
      <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-3">
        <div><Label htmlFor="shop-title">Product name</Label><Input id="shop-title" maxLength={120} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Handmade ceramic mug" /></div>
        <div><Label htmlFor="shop-description">Description</Label><Textarea id="shop-description" rows={4} maxLength={2000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="What makes this product useful or special?" /></div>
        <div><Label htmlFor="shop-category">Category</Label><Input id="shop-category" maxLength={60} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="Home, fashion, food…" /></div>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div><Label htmlFor="shop-price">Price</Label><Input id="shop-price" type="number" min="0.01" step="any" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder="0.00" /></div>
          <div><Label htmlFor="shop-currency">Currency</Label><Input id="shop-currency" maxLength={3} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} aria-describedby="currency-hint" /><p id="currency-hint" className="mt-1 text-[10px] text-muted-foreground">Three-letter code, e.g. NGN or USD</p></div>
        </div>
        <div><Label htmlFor="shop-stock">Available stock</Label><Input id="shop-stock" type="number" min="0" max="1000000" step="1" value={draft.inventory} onChange={(e) => setDraft({ ...draft, inventory: e.target.value })} /></div>
        <div>
          <Label>Product photo</Label>
          <div className="mt-1 flex min-h-20 items-center gap-3 rounded-2xl border border-dashed p-3">
            {image?.url || product?.imageMedia?.url ? <img src={image?.url ?? product?.imageMedia?.url} alt="Product preview" className="h-16 w-16 rounded-xl object-cover" /> : <span className="grid h-16 w-16 place-items-center rounded-xl bg-muted text-muted-foreground"><Package className="h-6 w-6" /></span>}
            <div><MediaPicker purpose="product" value={image} onChange={setImage} /><p className="mt-1 text-[10px] text-muted-foreground">JPG, PNG, WebP or GIF · max 25 MB</p></div>
          </div>
        </div>
        <label className="flex items-center gap-2 rounded-xl bg-muted/70 p-3 text-sm"><input type="checkbox" checked={draft.isPublished} onChange={(e) => setDraft({ ...draft, isPublished: e.target.checked })} /> Publish this listing in the shop</label>
      </div>
    </div>
    <div className="mt-5 flex justify-end"><Button type="button" onClick={save} disabled={busy} className="rounded-full">{busy ? "Saving…" : product ? "Save changes" : "Publish product"}</Button></div>
  </section>;
}

function OrderCard({ order, seller, onUpdate, busy }: { order: ShopOrder; seller: boolean; onUpdate: (orderId: string, data: ShopOrderUpdate) => void; busy: boolean }) {
  const next = order.status === "pending" ? "confirmed" : order.status === "confirmed" ? "preparing" : order.status === "preparing" ? "completed" : null;
  return <article className="rounded-3xl border bg-card p-4 sm:p-5" data-testid={`shop-order-${order.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Order · {order.id.slice(0, 8).toUpperCase()}</p><h3 className="mt-1 font-semibold">{seller ? `From ${order.buyerName}` : `Sold by ${order.sellerName}`}</h3><p className="mt-1 text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleString()}</p></div>
      <div className="text-right"><p className="font-display text-xl font-semibold">{money(order.totalMinor,order.currency)}</p><span className={cn("mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-medium",order.status==="completed"?"bg-emerald-500/10 text-emerald-700 dark:text-emerald-300":order.status==="cancelled"?"bg-destructive/10 text-destructive":"bg-primary/10 text-primary")}>{statusLabel(order.status)}</span></div>
    </div>
    <div className="mt-4 divide-y rounded-2xl border px-3">
      {order.items.map((item)=><div key={`${order.id}-${item.productId}`} className="flex justify-between gap-3 py-2 text-sm"><span>{item.quantity} × {item.title}</span><span className="shrink-0">{money(item.unitPriceMinor*item.quantity,order.currency)}</span></div>)}
    </div>
    {order.buyerNote ? <p className="mt-3 rounded-xl bg-muted p-3 text-sm"><span className="font-medium">Buyer note: </span>{order.buyerNote}</p> : null}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-500/10 p-3 text-xs">
      <span className="flex items-center gap-2"><CircleAlert className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />{order.paymentStatus==="manual_confirmed"?"Seller confirmed payment manually.":"Payment is not processed in VastMind; arrange it directly with the seller."}</span>
      {seller&&order.paymentStatus==="awaiting_manual"&&order.status!=="cancelled"?<Button size="sm" variant="outline" disabled={busy} onClick={()=>onUpdate(order.id,{paymentStatus:"manual_confirmed"})}>Record received</Button>:null}
    </div>
    {seller&&order.status!=="completed"&&order.status!=="cancelled"?<div className="mt-3 flex flex-wrap justify-end gap-2">
      {order.paymentStatus==="awaiting_manual"&&order.status==="pending"?<Button size="sm" variant="ghost" disabled={busy} onClick={()=>onUpdate(order.id,{status:"cancelled"})}>Cancel order</Button>:null}
      {next?<Button size="sm" className="rounded-full" disabled={busy} onClick={()=>onUpdate(order.id,{status:next})}>{next==="confirmed"?"Confirm order":next==="preparing"?"Mark preparing":"Mark complete"}<ChevronDown className="ml-1 h-3.5 w-3.5" /></Button>:null}
    </div>:null}
  </article>;
}

export default function ShopPage() {
  const me=useMe();
  const {toast}=useToast();
  const invalidate=useInvalidate();
  const poll=usePollInterval(20_000);
  const [tab,setTab]=useState<Tab>("discover");
  const [search,setSearch]=useState("");
  const [debouncedSearch,setDebouncedSearch]=useState("");
  const [scope,setScope]=useState<"buyer"|"seller">("buyer");
  const [cart,setCart]=useState<CartLine[]>([]);
  const [cartReady,setCartReady]=useState(false);
  const [note,setNote]=useState("");
  const [editing,setEditing]=useState<ShopProduct|null>(null);
  const [editorOpen,setEditorOpen]=useState(false);
  const productParams={scope:tab==="my-shop"?"mine" as const:"discover" as const,q:debouncedSearch||undefined};
  const orderParams={scope};
  const products=useListShopProducts(productParams,{query:{queryKey:getListShopProductsQueryKey(productParams),refetchInterval:poll}});
  const orders=useListShopOrders(orderParams,{query:{queryKey:getListShopOrdersQueryKey(orderParams),enabled:tab==="orders",refetchInterval:poll}});
  const placeOrder=usePlaceShopOrder({
    mutation:{
      onSuccess:(order)=>{setCart([]);setNote("");setTab("orders");setScope("buyer");invalidate("/api/shop/orders","/api/shop/products");toast({title:"Order placed",description:`${money(order.totalMinor,order.currency)} · arrange payment directly with the seller.`});},
      onError:(error)=>toast({title:"Couldn't place order",description:errMessage(error),variant:"destructive"}),
    },
  });
  const updateOrder=useUpdateShopOrder({
    mutation:{
      onSuccess:()=>invalidate("/api/shop/orders","/api/shop/products"),
      onError:(error)=>toast({title:"Couldn't update the order",description:errMessage(error),variant:"destructive"}),
    },
  });
  const updateProduct=useUpdateShopProduct({
    mutation:{
      onSuccess:()=>invalidate("/api/shop/products"),
      onError:(error)=>toast({title:"Couldn't update the listing",description:errMessage(error),variant:"destructive"}),
    },
  });
  useEffect(()=>{const timer=window.setTimeout(()=>setDebouncedSearch(search.trim()),250);return()=>window.clearTimeout(timer);},[search]);
  useEffect(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem("vastmind-shop-cart")??"[]");
      if(Array.isArray(saved))setCart(saved.filter((line):line is CartLine=>!!line&&typeof line==="object"&&line.product?.id&&Number.isInteger(line.quantity)&&line.quantity>0));
    }catch{/* Ignore unavailable or invalid local cart data. */}
    setCartReady(true);
  },[]);
  useEffect(()=>{if(cartReady)try{localStorage.setItem("vastmind-shop-cart",JSON.stringify(cart));}catch{/* Cart stays usable if local storage is unavailable. */}},[cart,cartReady]);
  const cartTotal=useMemo(()=>cart.reduce((sum,line)=>sum+line.product.priceMinor*line.quantity,0),[cart]);
  const cartCurrency=cart[0]?.product.currency??"USD";

  function add(product:ShopProduct){
    if(product.sellerId===me.id){toast({title:"This is your own listing"});return;}
    if(product.inventory<1){toast({title:"Out of stock"});return;}
    if(cart.length&&cart[0].product.sellerId!==product.sellerId){toast({title:"One seller per order",description:"Finish or clear your current cart before ordering from another shop.",variant:"destructive"});return;}
    setCart((items)=>{const found=items.find((line)=>line.product.id===product.id);return found?items.map((line)=>line.product.id===product.id?{...line,product,quantity:Math.min(product.inventory,line.quantity+1)}:line):[...items,{product,quantity:1}];});
    toast({title:"Added to cart",description:product.title});
  }
  function quantity(productId:string,amount:number){
    setCart((items)=>items.flatMap((line)=>line.product.id!==productId?[line]:amount<1?[]:[{...line,quantity:Math.min(line.product.inventory,amount)}]));
  }
  function checkout(){
    if(!cart.length||placeOrder.isPending)return;
    placeOrder.mutate({data:{items:cart.map((line)=>({productId:line.product.id,quantity:line.quantity})),...(note.trim()?{buyerNote:note.trim()}: {})}});
  }

  return <PageScroll className="max-w-6xl">
    <PageHeader kicker="VastMind marketplace" title="Shop" sub="Discover products from people and businesses in your community. Orders are placed here; payment is arranged directly with the seller until a processor is connected." />
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex rounded-full border bg-card p-1" role="tablist" aria-label="Shop sections">
        {([["discover","Discover"],["my-shop","My shop"],["orders","Orders"]] as const).map(([key,label])=><button key={key} type="button" role="tab" aria-selected={tab===key} onClick={()=>{setTab(key);setEditorOpen(false);}} className={cn("rounded-full px-4 py-2 text-sm font-medium transition-colors",tab===key?"bg-primary text-primary-foreground":"text-muted-foreground hover:text-foreground")}>{label}</button>)}
      </div>
      <Button type="button" variant="outline" className="rounded-full" onClick={()=>setTab("orders")}><ShoppingCart className="mr-2 h-4 w-4" />Cart · {cart.reduce((sum,line)=>sum+line.quantity,0)}</Button>
    </div>

    {tab==="discover"?<section className="mt-5">
      <label className="relative mb-4 block max-w-lg"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search products, categories, or sellers" className="h-11 rounded-full pl-10" aria-label="Search shop" /></label>
      {products.isError?<ErrorState error={products.error} onRetry={()=>products.refetch()}/>:null}
      {products.isLoading?<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0,1,2,3,4,5].map((i)=><Skeleton key={i} className="h-72 rounded-3xl"/>)}</div>:null}
      {!products.isLoading&&!products.isError&&!products.data?.length?<EmptyState icon={ShoppingBag} title="No listings yet" body={debouncedSearch?"Try another product or seller search.":"Be the first seller to put something in the VastMind shop."} action={<Button onClick={()=>{setTab("my-shop");setEditorOpen(true);}}>Create a listing</Button>}/>:null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.data?.map((product)=><article key={product.id} className="overflow-hidden rounded-3xl border bg-card shadow-sm transition-transform hover:-translate-y-0.5" data-testid={`shop-product-${product.id}`}>
          <div className="relative aspect-[4/3] bg-gradient-to-br from-primary/10 via-muted to-accent/20">
            {product.imageMedia?<img src={product.imageMedia.url} alt={product.title} loading="lazy" className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-primary/60"><Store className="h-12 w-12"/></div>}
            {product.inventory===0?<span className="absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold">Sold out</span>:null}
          </div>
          <div className="p-4">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wider text-primary">{product.category}</p><h2 className="mt-1 line-clamp-1 font-display text-xl font-semibold">{product.title}</h2></div><p className="shrink-0 font-display text-lg font-bold">{money(product.priceMinor,product.currency)}</p></div>
            <p className="mt-2 line-clamp-2 min-h-10 text-sm text-muted-foreground">{product.description||"A new product from this VastMind shop."}</p>
            <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
              <button type="button" onClick={()=>{setSearch(product.sellerName);setTab("discover");}} className="truncate text-xs text-muted-foreground hover:text-primary">by {product.sellerName}</button>
              <Button size="sm" className="rounded-full" disabled={product.inventory===0||product.sellerId===me.id} onClick={()=>add(product)}>{product.sellerId===me.id?"Your listing":product.inventory===0?"Unavailable":"Add to cart"}</Button>
            </div>
          </div>
        </article>)}
      </div>
      {cart.length?<section className="mt-6 rounded-3xl border bg-primary/5 p-4 sm:p-5" aria-labelledby="cart-title">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-widest text-primary">Ready when you are</p><h2 id="cart-title" className="font-display text-2xl font-semibold">Your cart</h2></div><p className="text-lg font-semibold">{money(cartTotal,cartCurrency)}</p></div>
        <div className="mt-3 space-y-2">{cart.map((line)=><div key={line.product.id} className="flex items-center justify-between gap-3 rounded-2xl bg-card p-3">
          <div className="min-w-0"><p className="truncate font-medium">{line.product.title}</p><p className="text-xs text-muted-foreground">{money(line.product.priceMinor,line.product.currency)} each</p></div>
          <div className="flex items-center gap-1"><Button size="icon" variant="ghost" aria-label={`Remove one ${line.product.title}`} onClick={()=>quantity(line.product.id,line.quantity-1)}><Minus className="h-4 w-4"/></Button><span className="w-6 text-center tabular-nums">{line.quantity}</span><Button size="icon" variant="ghost" aria-label={`Add one ${line.product.title}`} onClick={()=>quantity(line.product.id,line.quantity+1)}><Plus className="h-4 w-4"/></Button><Button size="icon" variant="ghost" aria-label={`Remove ${line.product.title} from cart`} onClick={()=>quantity(line.product.id,0)}><Trash2 className="h-4 w-4"/></Button></div>
        </div>)}</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]"><div><Label htmlFor="shop-note">Note for the seller (optional)</Label><Input id="shop-note" maxLength={500} value={note} onChange={(e)=>setNote(e.target.value)} placeholder="Delivery preference or question"/></div><Button className="self-end rounded-full" disabled={!cart.length||placeOrder.isPending} onClick={checkout}>{placeOrder.isPending?"Placing order…":"Place order"}</Button></div>
        <p className="mt-2 text-[11px] text-muted-foreground">Stock and prices are checked again when you place the order. VastMind does not collect card or bank details.</p>
      </section>:null}
    </section>:null}

    {tab==="my-shop"?<section className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border bg-card p-4 sm:p-5"><div><p className="font-mono text-[10px] uppercase tracking-widest text-primary">Seller studio</p><h2 className="font-display text-2xl font-semibold">Your shop</h2><p className="mt-1 text-sm text-muted-foreground">Create products, manage stock, and control what customers can discover.</p></div><Button className="rounded-full" onClick={()=>{setEditing(null);setEditorOpen((open)=>!open);}}><Plus className="mr-2 h-4 w-4"/>{editorOpen?"Close editor":"Add product"}</Button></div>
      {editorOpen?<ProductEditor product={editing??undefined} onClose={()=>setEditorOpen(false)} onSaved={()=>{setEditorOpen(false);setEditing(null);void products.refetch();}}/>:null}
      {products.isError?<ErrorState error={products.error} onRetry={()=>products.refetch()}/>:null}
      {products.isLoading?<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0,1,2].map((i)=><Skeleton key={i} className="h-64 rounded-3xl"/>)}</div>:null}
      {!products.isLoading&&!products.isError&&!products.data?.length?<EmptyState icon={Store} title="Your shop is ready" body="Add your first product. You can publish it now or keep it as a draft." action={<Button onClick={()=>setEditorOpen(true)}>Add a product</Button>}/>:null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{products.data?.map((product)=><article key={product.id} className="overflow-hidden rounded-3xl border bg-card" data-testid={`my-product-${product.id}`}>
        <div className="flex gap-3 p-4">
          {product.imageMedia?<img src={product.imageMedia.url} alt="" loading="lazy" className="h-20 w-20 rounded-2xl object-cover"/>:<div className="grid h-20 w-20 place-items-center rounded-2xl bg-muted text-muted-foreground"><Package className="h-7 w-7"/></div>}
          <div className="min-w-0 flex-1"><p className="truncate font-semibold">{product.title}</p><p className="mt-1 text-sm font-medium">{money(product.priceMinor,product.currency)}</p><p className="mt-1 text-xs text-muted-foreground">{product.inventory} in stock · {product.category}</p><span className={cn("mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",product.isPublished?"bg-emerald-500/10 text-emerald-700 dark:text-emerald-300":"bg-muted text-muted-foreground")}>{product.isPublished?"Published":"Draft"}</span></div>
        </div>
        <div className="flex justify-end gap-2 border-t p-3"><Button size="sm" variant="ghost" onClick={()=>{setEditing(product);setEditorOpen(true);}}>Edit</Button><Button size="sm" variant="outline" disabled={updateProduct.isPending} onClick={()=>updateProduct.mutate({productId:product.id,data:{isPublished:!product.isPublished}})}>{product.isPublished?"Unpublish":"Publish"}</Button></div>
      </article>)}</div>
    </section>:null}

    {tab==="orders"?<section className="mt-5 space-y-4">
      {cart.length?<div className="rounded-3xl border bg-card p-4"><div className="flex items-center justify-between gap-3"><div><h2 className="font-display text-xl font-semibold">Cart · {cart.reduce((sum,line)=>sum+line.quantity,0)} items</h2><p className="text-xs text-muted-foreground">One seller per order · {cart.length?cart[0].product.sellerName:""}</p></div><p className="font-semibold">{money(cartTotal,cartCurrency)}</p></div><div className="mt-3 space-y-2">{cart.map((line)=><div key={line.product.id} className="flex items-center justify-between gap-2 border-t pt-2 text-sm"><span>{line.quantity} × {line.product.title}</span><span>{money(line.product.priceMinor*line.quantity,line.product.currency)}</span></div>)}</div><div className="mt-3 flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={()=>setCart([])}>Clear cart</Button><Button className="rounded-full" disabled={placeOrder.isPending} onClick={checkout}>{placeOrder.isPending?"Placing…":"Place order"}</Button></div><p className="mt-2 text-[11px] text-muted-foreground">Payment is arranged directly with the seller; no card details are collected by VastMind.</p></div>:null}
      <div className="flex gap-2" role="group" aria-label="Order view"><Button size="sm" variant={scope==="buyer"?"default":"outline"} className="rounded-full" onClick={()=>setScope("buyer")}>My purchases</Button><Button size="sm" variant={scope==="seller"?"default":"outline"} className="rounded-full" onClick={()=>setScope("seller")}>Sales</Button></div>
      {orders.isError?<ErrorState error={orders.error} onRetry={()=>orders.refetch()}/>:null}
      {orders.isLoading?<div className="space-y-3">{[0,1,2].map((i)=><Skeleton key={i} className="h-44 rounded-3xl"/>)}</div>:null}
      {!orders.isLoading&&!orders.isError&&!orders.data?.length?<EmptyState icon={scope==="buyer"?ShoppingBag:BadgeCheck} title={scope==="buyer"?"No purchases yet":"No orders yet"} body={scope==="buyer"?"Orders you place from the shop will appear here.":"Customer orders for your listings will appear here."}/>:null}
      <div className="space-y-3">{orders.data?.map((order)=><OrderCard key={order.id} order={order} seller={scope==="seller"} busy={updateOrder.isPending} onUpdate={(orderId,data)=>updateOrder.mutate({orderId,data})}/>)}</div>
    </section>:null}
    <div className="mt-6 rounded-2xl border border-dashed p-4 text-xs leading-relaxed text-muted-foreground"><Check className="mr-1 inline h-3.5 w-3.5 text-primary"/>VastMind listings, carts, inventory, and orders are stored in the app. Card processing, refunds, tax calculation, shipping labels, and seller payouts are not active until a payment/commerce provider is connected.</div>
  </PageScroll>;
}
