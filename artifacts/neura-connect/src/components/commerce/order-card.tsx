"use client";
import { useState } from "react";
import { ChevronDown, CircleAlert, Loader2, MapPin, Package, Truck } from "lucide-react";
import { useCommerceUpdateOrder, type CommerceOrder, type CommerceOrderActionInputAction } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useInvalidate } from "@/lib/realtime";
import { errMessage } from "@/lib/format";
import { humanAction, money, shortId } from "@/lib/commerce";
import { cn } from "@/lib/utils";
import { StatusPill } from "./bits";

const COPY: Record<CommerceOrderActionInputAction, { title: string; body: string; cta: string; reason?: "required" | "optional"; danger?: boolean }> = {
  confirm: { title: "Confirm order", body: "Tell the buyer you accept this order and will arrange manual payment.", cta: "Confirm" },
  prepare: { title: "Mark as preparing", body: "The order is being packed or made.", cta: "Mark preparing" },
  complete: { title: "Complete order", body: "Delivered or picked up. The buyer can then review and request a return.", cta: "Complete" },
  manual_paid: { title: "Record manual payment", body: "Confirm you received payment outside VastMind. This is a record, not a charge.", cta: "Record payment" },
  cancel: { title: "Cancel order", body: "Inventory is restored. VastMind does not issue refunds automatically.", cta: "Cancel order", reason: "optional", danger: true },
  request_cancel: { title: "Request cancellation", body: "The seller reviews your request. If you already paid, they arrange any refund with you directly.", cta: "Send request", reason: "required" },
  request_return: { title: "Request a return", body: "Explain the issue. The seller decides and arranges return logistics with you.", cta: "Send request", reason: "required" },
  approve_request: { title: "Approve buyer request", body: "The order will be cancelled or returned.", cta: "Approve", reason: "optional" },
  reject_request: { title: "Decline buyer request", body: "Let the buyer know why.", cta: "Decline", reason: "optional", danger: true },
  tracking: { title: "Add tracking", body: "Share the carrier and tracking number with the buyer.", cta: "Save tracking" },
};

export function OrderCard({ order, seller }: { order: CommerceOrder; seller: boolean }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<CommerceOrderActionInputAction | null>(null);
  const [reason, setReason] = useState("");
  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("");
  const [attest, setAttest] = useState(false);
  const update = useCommerceUpdateOrder({ mutation: {
    onSuccess: () => { invalidate("/api/commerce"); toast({ title: action ? `${COPY[action].title}: done` : "Order updated" }); setAction(null); },
    onError: (e) => toast({ title: "Couldn't update order", description: errMessage(e), variant: "destructive" }),
  } });

  const paid = order.paymentStatus === "manual_confirmed";
  const closed = order.status === "cancelled" || order.status === "returned";
  const pendingRequest = order.requestStatus === "pending" && !!order.requestType;
  const needsAttest = paid && (action === "cancel" || action === "approve_request");
  const start = (a: CommerceOrderActionInputAction) => { setAction(a); setReason(""); setAttest(false); setTracking(order.trackingNumber); setCarrier(order.carrier); };

  const actions: CommerceOrderActionInputAction[] = [];
  if (seller && !closed) {
    if (pendingRequest) actions.push("approve_request", "reject_request");
    if (order.status === "pending") actions.push("confirm");
    if (order.status === "confirmed") actions.push("prepare");
    if (order.status === "preparing") actions.push("complete");
    if (!paid) actions.push("manual_paid");
    if (order.fulfillment === "delivery" && order.status !== "completed") actions.push("tracking");
    if (order.status !== "completed") actions.push("cancel");
  }
  if (!seller && !closed && !pendingRequest) {
    if (order.status !== "completed") actions.push("request_cancel"); else actions.push("request_return");
  }
  const primary = new Set<CommerceOrderActionInputAction>(["confirm", "prepare", "complete", "approve_request"]);

  function submit() {
    if (!action) return;
    const c = COPY[action];
    if (c.reason === "required" && reason.trim().length < 3) return;
    if (needsAttest && !attest) return;
    update.mutate({ orderId: order.id, data: {
      action, ...(reason.trim() ? { reason: reason.trim() } : {}),
      ...(action === "tracking" ? { trackingNumber: tracking.trim(), carrier: carrier.trim() } : {}),
      ...(needsAttest ? { paymentResolvedManually: true } : {}),
    } });
  }

  return <article className="rise overflow-hidden rounded-[1.6rem] border bg-card" data-testid={`card-order-${order.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Order {shortId(order.id)} · {new Date(order.createdAt).toLocaleString()}</p>
        <h3 className="mt-1 truncate font-semibold">{seller ? order.buyerName : order.sellerName}</h3>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">{order.fulfillment === "delivery" ? <Truck className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}{order.fulfillment === "delivery" ? "Delivery" : "Pickup"} · {order.items.reduce((s, i) => s + i.quantity, 0)} items{!order.shopId ? " · classic listing" : ""}</p>
      </div>
      <div className="text-right"><p className="font-display text-2xl font-semibold tabular-nums">{money(order.totalMinor, order.currency)}</p><div className="mt-1"><StatusPill status={order.status} /></div></div>
    </div>
    <div className={cn("mx-4 mb-3 flex items-start gap-2 rounded-xl p-2.5 text-xs sm:mx-5", paid ? "bg-online/10 text-online" : "bg-[hsl(var(--brand-violet)/.08)] text-foreground/80")}>
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{paid ? "Seller recorded manual payment as received." : "Manual payment: arrange it directly with the seller. Nothing is charged in VastMind."}
    </div>
    {pendingRequest ? <div className="mx-4 mb-3 rounded-xl border border-[hsl(var(--brand-magenta)/.35)] bg-[hsl(var(--brand-magenta)/.06)] p-2.5 text-xs sm:mx-5"><span className="font-semibold">{humanAction(order.requestType)} requested.</span> {order.requestReason}</div> : null}
    {order.requestStatus && order.requestStatus !== "pending" && order.requestType ? <p className="mx-4 mb-3 text-xs text-muted-foreground sm:mx-5">{humanAction(order.requestType)} request {order.requestStatus}.</p> : null}
    {order.trackingNumber ? <p className="mx-4 mb-3 text-xs sm:mx-5"><span className="font-semibold">Tracking:</span> {order.carrier ? `${order.carrier} · ` : ""}<span className="font-mono">{order.trackingNumber}</span></p> : null}

    <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3 sm:px-5">
      <Button variant="ghost" size="sm" className="mr-auto rounded-full" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid={`button-order-details-${order.id}`}>Details <ChevronDown className={cn("ml-1 h-4 w-4 transition-transform", open && "rotate-180")} /></Button>
      {actions.map((a) => <Button key={a} size="sm" variant={primary.has(a) ? "default" : COPY[a].danger ? "ghost" : "outline"} className={cn("rounded-full", COPY[a].danger && "text-destructive hover:text-destructive")} onClick={() => start(a)} data-testid={`button-order-${a}-${order.id}`}>{COPY[a].cta}</Button>)}
    </div>

    {open ? <div className="rise grid gap-4 border-t bg-muted/30 p-4 sm:grid-cols-2 sm:p-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</p>
        <ul className="divide-y rounded-xl border bg-card px-3 text-sm">
          {order.items.map((it) => <li key={`${it.productId}-${it.variantId ?? ""}`} className="flex justify-between gap-2 py-2"><span className="min-w-0"><span className="block truncate">{it.quantity} x {it.title}</span>{it.variantLabel ? <span className="text-xs text-muted-foreground">{it.variantLabel}{it.sku ? ` · ${it.sku}` : ""}</span> : null}</span><span className="shrink-0 tabular-nums">{money(it.lineTotalMinor, order.currency)}</span></li>)}
        </ul>
        <dl className="mt-2 space-y-1 text-xs">
          <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{money(order.subtotalMinor, order.currency)}</dd></div>
          {order.discountMinor ? <div className="flex justify-between text-online"><dt>Discount</dt><dd className="tabular-nums">-{money(order.discountMinor, order.currency)}</dd></div> : null}
          <div className="flex justify-between"><dt>Shipping</dt><dd className="tabular-nums">{money(order.shippingMinor, order.currency)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(order.totalMinor, order.currency)}</dd></div>
        </dl>
        {(order.recipientName || order.address || order.phone) ? <div className="mt-3 rounded-xl border bg-card p-3 text-xs"><p className="font-semibold">{order.recipientName}</p>{order.phone ? <p>{order.phone}</p> : null}{order.address ? <p className="whitespace-pre-wrap text-muted-foreground">{order.address}</p> : null}</div> : null}
        {order.buyerNote ? <p className="mt-2 rounded-xl bg-card p-3 text-xs"><span className="font-semibold">Buyer note: </span>{order.buyerNote}</p> : null}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status history</p>
        <ol className="relative space-y-3 border-l pl-4">
          {order.history.length === 0 ? <li className="text-xs text-muted-foreground">No updates yet.</li> : null}
          {order.history.map((h, i) => <li key={`${h.createdAt}-${i}`} className="relative text-xs"><span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" aria-hidden /><p className="font-semibold">{humanAction(h.action)}</p><p className="text-muted-foreground">{h.actorName} · {new Date(h.createdAt).toLocaleString()}</p>{h.note ? <p className="mt-0.5">{h.note}</p> : null}</li>)}
        </ol>
      </div>
    </div> : null}

    <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
      {action ? <DialogContent>
        <DialogHeader><DialogTitle>{COPY[action].title}</DialogTitle><DialogDescription>{COPY[action].body}</DialogDescription></DialogHeader>
        {action === "tracking" ? <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="carrier">Carrier</Label><Input id="carrier" maxLength={150} value={carrier} onChange={(e) => setCarrier(e.target.value)} data-testid="input-carrier" /></div>
          <div><Label htmlFor="tracking">Tracking number</Label><Input id="tracking" maxLength={150} value={tracking} onChange={(e) => setTracking(e.target.value)} data-testid="input-tracking" /></div>
        </div> : null}
        {COPY[action].reason ? <div><Label htmlFor="order-reason">Reason {COPY[action].reason === "optional" ? "(optional)" : ""}</Label><Textarea id="order-reason" rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-order-reason" /></div> : null}
        {needsAttest ? <label className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={attest} onChange={(e) => setAttest(e.target.checked)} data-testid="checkbox-payment-resolved" />
          <span>This order was marked paid. I confirm I have already resolved the payment with the buyer manually. VastMind does not refund automatically.</span>
        </label> : null}
        <DialogFooter><Button variant="ghost" onClick={() => setAction(null)}>Back</Button>
          <Button variant={COPY[action].danger ? "destructive" : "default"} disabled={update.isPending || (COPY[action].reason === "required" && reason.trim().length < 3) || (needsAttest && !attest) || (action === "tracking" && !tracking.trim())} onClick={submit} data-testid="button-confirm-order-action">
            {update.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Package className="mr-1 h-4 w-4" />}{COPY[action].cta}
          </Button>
        </DialogFooter>
      </DialogContent> : null}
    </Dialog>
  </article>;
}
