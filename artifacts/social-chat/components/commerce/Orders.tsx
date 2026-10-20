import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  useCommerceListOrders, useCommerceUpdateOrder,
  type CommerceListOrdersStatus, type CommerceOrder, type CommerceOrderActionInput, type CommerceOrderActionInputAction,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useContactSeller } from './ProductSheet';
import { Btn, Card, Chip, Empty, ErrorRetry, Field, Kicker, Notice, Pager, Skeleton, Tag, Toggle, errText, money, s, shortDate, useCursor, useInvalidateCommerce } from './kit';

const STATUSES: readonly (CommerceListOrdersStatus | 'all')[] = ['all', 'pending', 'confirmed', 'preparing', 'completed', 'cancelled', 'returned'];
const STEPS = ['pending', 'confirmed', 'preparing', 'completed'] as const;
const LABELS: Record<string, string> = {
  confirm: 'Confirm order', prepare: 'Mark preparing', complete: 'Mark complete', manual_paid: 'Record manual payment', cancel: 'Cancel order',
  request_cancel: 'Request cancellation', request_return: 'Request return', approve_request: 'Approve request', reject_request: 'Reject request', tracking: 'Add tracking',
};

export function OrdersList({ scope, shopId }: { scope: 'buyer' | 'seller'; shopId?: string }) {
  const [status, setStatus] = useState<CommerceListOrdersStatus | 'all'>('all');
  const cur = useCursor();
  const list = useCommerceListOrders({ scope, ...(shopId ? { shopId } : {}), ...(status !== 'all' ? { status } : {}), ...(cur.cursor ? { cursor: cur.cursor } : {}) });
  return <View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 12 }}>
      {STATUSES.map(st => <Chip key={st} label={st === 'all' ? 'All' : st[0].toUpperCase() + st.slice(1)} active={status === st} onPress={() => { setStatus(st); cur.reset(); }} />)}
    </ScrollView>
    {list.isLoading ? <Skeleton rows={2} /> : null}
    {list.isError ? <ErrorRetry message={errText(list.error)} onRetry={() => void list.refetch()} /> : null}
    {list.data && !list.data.items.length ? <Empty icon="inbox" title={scope === 'buyer' ? 'No purchases yet' : 'No orders yet'} body={scope === 'buyer' ? 'Orders you place show up here with their full history.' : 'New orders appear here the moment buyers check out.'} /> : null}
    {list.data?.items.map(o => <OrderCard key={o.id} order={o} seller={scope === 'seller'} />)}
    <Pager hasPrev={cur.hasPrev} next={list.data?.nextCursor} onPrev={cur.prev} onNext={() => cur.next(list.data?.nextCursor)} />
  </View>;
}

function Progress({ status }: { status: CommerceOrder['status'] }) {
  const c = useColors();
  const idx = STEPS.indexOf(status as typeof STEPS[number]);
  if (idx < 0) return <Tag label={status} tone="danger" />;
  return <View style={{ flexDirection: 'row', gap: 4, marginTop: 10 }} accessibilityLabel={`Status ${status}, step ${idx + 1} of 4`}>
    {STEPS.map((st, i) => <View key={st} style={{ flex: 1 }}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= idx ? (i === 3 ? c.lime : c.primary) : c.border }} />
      <Text style={{ color: i <= idx ? c.foreground : c.mutedForeground, fontSize: 10, marginTop: 4, fontWeight: i === idx ? '800' : '500', textTransform: 'capitalize' }}>{st}</Text>
    </View>)}
  </View>;
}

export function OrderCard({ order: o, seller }: { order: CommerceOrder; seller: boolean }) {
  const c = useColors();
  const update = useCommerceUpdateOrder();
  const invalidate = useInvalidateCommerce();
  const contact = useContactSeller();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<CommerceOrderActionInputAction | null>(null);
  const [reason, setReason] = useState('');
  const [carrier, setCarrier] = useState(o.carrier);
  const [tracking, setTracking] = useState(o.trackingNumber);
  const [resolved, setResolved] = useState(false);
  const closed = o.status === 'cancelled' || o.status === 'returned';
  const paid = o.paymentStatus === 'manual_confirmed';
  const requestOpen = o.requestStatus === 'pending';

  const actions: CommerceOrderActionInputAction[] = [];
  if (seller) {
    if (o.status === 'pending') actions.push('confirm');
    if (o.status === 'confirmed') actions.push('prepare');
    if (o.status === 'preparing') actions.push('complete');
    if (!paid && !closed) actions.push('manual_paid');
    if (o.fulfillment === 'delivery' && !closed && o.status !== 'pending') actions.push('tracking');
    if (requestOpen) actions.push('approve_request', 'reject_request');
    if ((o.status === 'pending' || o.status === 'confirmed') && !requestOpen) actions.push('cancel');
  } else if (!requestOpen) {
    if (o.status === 'pending' || o.status === 'confirmed' || o.status === 'preparing') actions.push('request_cancel');
    if (o.status === 'completed') actions.push('request_return');
  }
  const needsForm = (a: CommerceOrderActionInputAction) => ['cancel', 'request_cancel', 'request_return', 'reject_request', 'tracking', 'approve_request'].includes(a);

  async function act(action: CommerceOrderActionInputAction) {
    const data: CommerceOrderActionInput = { action };
    if (reason.trim()) data.reason = reason.trim();
    if (action === 'tracking') {
      if (!tracking.trim()) { Alert.alert('Tracking number needed', 'Enter the tracking number from your carrier.'); return; }
      data.trackingNumber = tracking.trim(); if (carrier.trim()) data.carrier = carrier.trim();
    }
    if ((action === 'request_cancel' || action === 'request_return') && reason.trim().length < 3) { Alert.alert('Add a reason', 'Tell the seller why.'); return; }
    if (action === 'approve_request' && paid) {
      if (!resolved) { Alert.alert('Confirm refund handled', 'This order was paid. Confirm you have resolved the payment with the buyer outside VastMind. No automatic refund is made.'); return; }
      data.paymentResolvedManually = true;
    }
    try { await update.mutateAsync({ orderId: o.id, data }); setPending(null); setReason(''); setResolved(false); await invalidate(); }
    catch (e) { Alert.alert("Couldn't update order", errText(e)); }
  }
  function tap(a: CommerceOrderActionInputAction) {
    if (needsForm(a)) { setPending(p => p === a ? null : a); return; }
    if (a === 'manual_paid') {
      Alert.alert('Record manual payment?', 'Only confirm once you have actually received the money outside VastMind.', [{ text: 'Not yet', style: 'cancel' }, { text: 'Payment received', onPress: () => void act(a) }]);
      return;
    }
    void act(a);
  }

  return <Card accent={closed ? c.destructive : o.status === 'completed' ? c.lime : requestOpen ? c.coral : c.primary}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`Order ${o.id.slice(0, 8)}, ${o.status}`} onPress={() => setOpen(v => !v)}>
      <View style={s.between}>
        <Text style={{ color: c.mutedForeground, fontSize: 10, letterSpacing: 1.4, fontWeight: '800' }}>ORDER {o.id.slice(0, 8).toUpperCase()} · {shortDate(o.createdAt)}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.mutedForeground} />
      </View>
      <View style={[s.between, { marginTop: 6 }]}>
        <Text style={{ color: c.foreground, fontWeight: '800', flex: 1 }} numberOfLines={1}>{seller ? o.buyerName : o.sellerName}</Text>
        <Text style={{ color: c.foreground, fontWeight: '900', fontSize: 16 }}>{money(o.totalMinor, o.currency)}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        <Tag label={paid ? 'Paid manually' : 'Awaiting manual payment'} tone={paid ? 'cyan' : 'magenta'} />
        <Tag label={o.fulfillment} tone="blue" />
        {requestOpen ? <Tag label={`${o.requestType.replace('_', ' ')} requested`} tone="danger" /> : o.requestStatus ? <Tag label={`${o.requestType.replace('_', ' ')} ${o.requestStatus}`} /> : null}
        {o.campaignId ? <Tag label="Campaign" tone="violet" /> : null}
      </View>
      <Progress status={o.status} />
    </Pressable>

    {open ? <View style={{ marginTop: 12, gap: 4 }}>
      {o.items.map(it => <View key={it.productId + (it.variantId ?? '')} style={s.between}>
        <Text style={{ color: c.foreground, flex: 1 }} numberOfLines={2}>{it.quantity} x {it.title}{it.variantLabel ? ` (${it.variantLabel})` : ''}{it.sku ? ` · ${it.sku}` : ''}</Text>
        <Text style={{ color: c.mutedForeground }}>{money(it.lineTotalMinor, o.currency)}</Text>
      </View>)}
      <View style={{ borderTopWidth: 1, borderTopColor: c.border, marginTop: 6, paddingTop: 6, gap: 2 }}>
        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Subtotal {money(o.subtotalMinor, o.currency)}{o.discountMinor ? ` · discount ${money(o.discountMinor, o.currency)}` : ''} · {o.fulfillment} {money(o.shippingMinor, o.currency)}</Text>
        <Text style={{ color: c.foreground, fontSize: 12 }}>{o.recipientName}{o.phone ? ` · ${o.phone}` : ''}</Text>
        {o.address ? <Text style={{ color: c.foreground, fontSize: 12 }}>{o.address}</Text> : null}
        {o.buyerNote ? <Text style={{ color: c.mutedForeground, fontSize: 12, fontStyle: 'italic' }}>Note: {o.buyerNote}</Text> : null}
        {o.trackingNumber ? <Text style={{ color: c.primary, fontSize: 12, fontWeight: '700' }}>Tracking {o.carrier ? `${o.carrier} ` : ''}{o.trackingNumber}</Text> : null}
        {o.requestReason ? <Text style={{ color: c.coral, fontSize: 12 }}>Request reason: {o.requestReason}</Text> : null}
      </View>
      {o.history.length ? <View style={{ marginTop: 8 }}>
        <Kicker color={c.gold}>History</Kicker>
        {o.history.map((h, i) => <View key={i} style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
          <View style={{ alignItems: 'center' }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === o.history.length - 1 ? c.primary : c.border, marginTop: 4 }} />{i < o.history.length - 1 ? <View style={{ width: 1, flex: 1, backgroundColor: c.border }} /> : null}</View>
          <View style={{ flex: 1, paddingBottom: 4 }}>
            <Text style={{ color: c.foreground, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' }}>{h.action.replace(/_/g, ' ')} · {h.actorName}</Text>
            {h.note ? <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{h.note}</Text> : null}
            <Text style={{ color: c.mutedForeground, fontSize: 10 }}>{new Date(h.createdAt).toLocaleString()}</Text>
          </View>
        </View>)}
      </View> : null}
      <Btn small variant="ghost" icon="message-circle" label={seller ? 'Message buyer' : 'Contact seller'} busy={contact.busy} onPress={() => void contact.open(seller ? o.buyerId : o.sellerId)} />
    </View> : null}

    {actions.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
      {actions.map(a => <Btn key={a} small variant={a === 'cancel' || a === 'reject_request' ? 'danger' : pending === a ? 'ink' : ['confirm', 'prepare', 'complete'].includes(a) ? 'primary' : 'soft'} label={LABELS[a]} busy={update.isPending && update.variables?.data.action === a} disabled={update.isPending} onPress={() => tap(a)} />)}
    </View> : null}
    {pending ? <View style={{ marginTop: 12 }}>
      {pending === 'tracking' ? <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field label="Carrier" style={{ flex: 1 }} value={carrier} onChangeText={setCarrier} maxLength={150} />
        <Field label="Tracking number" style={{ flex: 1 }} value={tracking} onChangeText={setTracking} maxLength={150} />
      </View> : <Field label={pending === 'approve_request' ? 'Note (optional)' : 'Reason'} value={reason} onChangeText={setReason} maxLength={2000} multiline />}
      {pending === 'approve_request' && paid ? <>
        <Notice tone="warn" text={`This order is recorded as paid. Approving the ${o.requestType.replace('_', ' ')} does not refund anyone automatically.`} />
        <Toggle label="I resolved the payment manually" detail="I have returned or settled the buyer's money outside VastMind." value={resolved} onChange={setResolved} />
      </> : null}
      <Btn variant={pending === 'cancel' || pending === 'reject_request' ? 'danger' : 'primary'} label={`Confirm: ${LABELS[pending].toLowerCase()}`} busy={update.isPending} disabled={pending === 'approve_request' && paid && !resolved} onPress={() => void act(pending)} />
    </View> : null}
  </Card>;
}
