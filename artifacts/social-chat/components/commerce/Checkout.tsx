import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  getCommerceGetShopQueryKey, useCommerceGetShop, useCommercePlaceOrder, useCommerceQuote,
  type CommerceCheckoutInput, type CommerceQuote,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useCart } from './cart';
import { Btn, Card, Empty, Field, Kicker, Notice, Segments, Stepper, Tag, Toggle, errText, money, newKey, s, useInvalidateCommerce } from './kit';

export function CheckoutPanel({ onPlaced, onBrowse }: { onPlaced: () => void; onBrowse: () => void }) {
  const c = useColors();
  const { cart, count, subtotal, setQty, remove, clear, setCoupon, attribution, beginAttempt, endAttempt } = useCart();
  const shop = useCommerceGetShop(cart.shopId ?? '', { query: { enabled: !!cart.shopId, queryKey: getCommerceGetShopQueryKey(cart.shopId ?? '') } });
  // Legacy listings (no shop) support seller-arranged pickup only.
  const canDeliver = !cart.shopId ? false : shop.data ? shop.data.deliveryEnabled : true;
  const canPickup = !cart.shopId ? true : shop.data ? shop.data.pickupEnabled : true;
  const [mode, setMode] = useState<'delivery' | 'pickup'>('delivery');
  const fulfillment = mode === 'delivery' && !canDeliver && canPickup ? 'pickup' : mode === 'pickup' && !canPickup && canDeliver ? 'delivery' : mode;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [coupon, setCouponText] = useState(cart.couponCode ?? '');
  const [ack, setAck] = useState(false);
  const [quote, setQuote] = useState<{ sig: string; q: CommerceQuote } | null>(null);
  const quoteM = useCommerceQuote();
  const place = useCommercePlaceOrder();
  const invalidate = useInvalidateCommerce();

  const input: CommerceCheckoutInput = useMemo(() => ({
    items: cart.lines.map(l => ({ productId: l.productId, quantity: l.quantity, ...(l.variantId ? { variantId: l.variantId } : {}) })),
    fulfillment,
    ...(name.trim() ? { recipientName: name.trim() } : {}),
    ...(phone.trim() ? { phone: phone.trim() } : {}),
    ...(fulfillment === 'delivery' && address.trim() ? { address: address.trim() } : {}),
    ...(note.trim() ? { buyerNote: note.trim() } : {}),
    ...(coupon.trim() ? { couponCode: coupon.trim() } : {}),
    ...(cart.campaignId ? { campaignId: cart.campaignId } : {}),
  }), [cart.lines, cart.campaignId, fulfillment, name, phone, address, note, coupon]);
  const sig = JSON.stringify(input);
  const fresh = quote?.sig === sig ? quote.q : null;

  if (!cart.lines.length) return <Empty icon="shopping-bag" title="Your cart is empty" body="Items you add stay here on this account until you check out." action={<Btn icon="compass" label="Browse products" onPress={onBrowse} />} />;
  const cur = cart.currency ?? 'USD';

  function validate() {
    if (!canDeliver && !canPickup && cart.shopId) return 'This shop is not accepting orders right now.';
    if (!name.trim() || !phone.trim()) return 'Add a recipient name and phone number.';
    if (fulfillment === 'delivery' && address.trim().length < 5) return 'Add a full delivery address.';
    return null;
  }
  async function getQuote() {
    const err = validate(); if (err) { Alert.alert('Almost there', err); return; }
    try { const q = await quoteM.mutateAsync({ data: input }); setQuote({ sig, q }); }
    catch (e) { setQuote(null); Alert.alert('Quote failed', errText(e)); }
  }
  async function send(body: CommerceCheckoutInput & { idempotencyKey: string }) {
    try {
      const order = await place.mutateAsync({ data: body });
      setQuote(null); clear(); setAck(false); setNote('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await invalidate();
      Alert.alert('Order placed', `Order ${order.id.slice(0, 8).toUpperCase()} is with ${order.sellerName}. Arrange payment with the seller; nothing has been charged.`);
      onPlaced();
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (status === 409) {
        endAttempt(); setQuote(null); setAck(false);
        try { const q = await quoteM.mutateAsync({ data: input }); setQuote({ sig, q }); } catch { /* quote button remains */ }
        Alert.alert('Total changed', 'Prices, stock, delivery or a coupon changed since your quote. Review the updated total and confirm again. Nothing was ordered.');
        return;
      }
      if (status && status >= 400 && status < 500) { endAttempt(); Alert.alert('Order not placed', `${errText(e)}\n\nNothing was ordered. Fix the details and try again.`); return; }
      // Network failure or 5xx: outcome unknown. Keep the exact body + key so a retry is deduplicated.
      Alert.alert('Order status unknown', `${errText(e)}\n\nYour order may or may not have gone through. Retry sends the same order attempt, so it cannot be placed twice.`);
    }
  }
  function submit() {
    if (place.isPending) return;
    if (cart.attempt) { void send(cart.attempt.body); return; }
    if (!fresh) return;
    if (!ack) { Alert.alert('Confirm manual payment', 'Please confirm you will arrange payment directly with the seller.'); return; }
    // Key is minted once per attempt and persisted with the exact body before the request leaves the device.
    void send(beginAttempt({ ...input, idempotencyKey: newKey(), expectedTotalMinor: fresh.totalMinor }));
  }

  if (cart.attempt) {
    const body = cart.attempt.body;
    return <Card style={{ borderColor: c.coral }}>
      <Kicker color={c.coral}>Order attempt pending</Kicker>
      <Text style={{ color: c.foreground, fontWeight: '800', fontSize: 17, marginTop: 4 }}>{cart.shopName ?? cart.sellerName}</Text>
      <Text style={{ color: c.foreground, marginTop: 4 }}>{body.items.reduce((n, l) => n + l.quantity, 0)} items · {body.fulfillment}{body.expectedTotalMinor !== undefined ? ` · ${money(body.expectedTotalMinor, cur)}` : ''}</Text>
      <Notice tone="warn" text="We could not confirm your last order. Retrying sends the exact same attempt, so it can never create a second order. Your cart is locked until this resolves." />
      <Btn icon="refresh-cw" label="Retry same order" busy={place.isPending} onPress={submit} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <Btn flex small variant="soft" icon="package" label="Check my orders" disabled={place.isPending} onPress={onPlaced} />
        <Btn flex small variant="danger" label="Discard attempt" disabled={place.isPending} onPress={() => Alert.alert('Discard this attempt?', 'Only do this after checking Orders and confirming the order is not there. Otherwise you may order twice.', [{ text: 'Keep', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: endAttempt }])} />
      </View>
    </Card>;
  }
  const locked = place.isPending;

  return <View pointerEvents={locked ? 'none' : 'auto'} accessibilityState={{ busy: locked }} style={{ opacity: locked ? 0.85 : 1 }}>
    <Card>
      <View style={s.between}>
        <View style={{ flex: 1 }}><Kicker>One shop per order</Kicker><Text style={{ color: c.foreground, fontWeight: '800', fontSize: 18, marginTop: 3 }}>{cart.shopName ?? cart.sellerName}</Text></View>
        <Btn small variant="ghost" icon="trash-2" a11y="Clear cart" onPress={() => Alert.alert('Clear cart?', 'This removes every item.', [{ text: 'Keep', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: clear }])} />
      </View>
      {cart.lines.map((l, i) => <View key={l.productId + (l.variantId ?? '')} style={[s.between, { borderTopWidth: 1, borderTopColor: c.border, paddingVertical: 10, marginTop: i ? 0 : 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontWeight: '700' }} numberOfLines={2}>{l.title}</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{l.variantLabel ? `${l.variantLabel} · ` : ''}{money(l.unitMinor, cur)}</Text>
        </View>
        <Stepper label={`${l.title} quantity`} value={l.quantity} max={l.maxQty} onChange={n => setQty(i, n)} />
        <Pressable accessibilityLabel={`Remove ${l.title}`} onPress={() => remove(i)} style={{ padding: 8 }}><Feather name="x" size={16} color={c.mutedForeground} /></Pressable>
      </View>)}
      <View style={[s.between, { marginTop: 6 }]}><Text style={{ color: c.mutedForeground }}>{count} items · estimate</Text><Text style={{ color: c.foreground, fontWeight: '800' }}>{money(subtotal, cur)}</Text></View>
      {cart.campaignId ? <View style={[s.row, { marginTop: 8 }]}><Tag label="Creator campaign applied" tone="violet" /><Pressable accessibilityLabel="Remove campaign attribution" onPress={() => attribution(undefined)}><Feather name="x-circle" size={15} color={c.mutedForeground} /></Pressable></View> : null}
    </Card>

    <Text style={{ color: c.forest, fontWeight: '800', fontSize: 18, marginVertical: 8 }}>How will you receive it?</Text>
    {canDeliver && canPickup ? <Segments value={fulfillment} options={[['delivery', 'Delivery'], ['pickup', 'Pickup']] as const} onChange={setMode} />
      : <Notice text={canDeliver ? 'This shop offers delivery only.' : canPickup ? (cart.shopId ? 'This shop offers pickup only.' : 'Legacy listing: pickup arranged directly with the seller.') : 'This shop is not taking delivery or pickup orders.'} />}
    {fulfillment === 'pickup' && shop.data?.pickupDetails ? <Notice icon="map-pin" text={shop.data.pickupDetails} /> : null}
    <Field label="Recipient name" value={name} onChangeText={setName} maxLength={150} autoComplete="name" />
    <Field label="Phone" value={phone} onChangeText={setPhone} maxLength={80} keyboardType="phone-pad" autoComplete="tel" />
    {fulfillment === 'delivery' ? <Field label="Delivery address" value={address} onChangeText={setAddress} maxLength={1000} multiline autoComplete="street-address" /> : null}
    <Field label="Note for seller" value={note} onChangeText={setNote} maxLength={2000} multiline placeholder="Optional" />
    <Field label="Coupon code" value={coupon} autoCapitalize="characters" maxLength={40} onChangeText={t => { setCouponText(t); setCoupon(t.trim() || undefined); }} placeholder="Optional" />

    {!fresh ? <Btn icon="file-text" label={quote ? 'Details changed: refresh quote' : 'Review total'} busy={quoteM.isPending} onPress={() => void getQuote()} /> : <Card style={{ borderColor: c.primary }}>
      <Kicker>Confirmed quote</Kicker>
      {fresh.items.map(it => <View key={it.productId + (it.variantId ?? '')} style={[s.between, { marginTop: 6 }]}><Text style={{ color: c.foreground, flex: 1 }} numberOfLines={1}>{it.quantity} x {it.title}{it.variantLabel ? ` (${it.variantLabel})` : ''}</Text><Text style={{ color: c.foreground }}>{money(it.lineTotalMinor, fresh.currency)}</Text></View>)}
      <View style={{ borderTopWidth: 1, borderTopColor: c.border, marginTop: 10, paddingTop: 8, gap: 4 }}>
        <Row k="Subtotal" v={money(fresh.subtotalMinor, fresh.currency)} />
        {fresh.discountMinor ? <Row k="Discount" v={`- ${money(fresh.discountMinor, fresh.currency)}`} accent={c.lime} /> : null}
        <Row k={fresh.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'} v={fresh.shippingMinor ? money(fresh.shippingMinor, fresh.currency) : 'Free'} />
        <View style={[s.between, { marginTop: 4 }]}><Text style={{ color: c.foreground, fontWeight: '900', fontSize: 18 }}>Total</Text><Text style={{ color: c.foreground, fontWeight: '900', fontSize: 20 }}>{money(fresh.totalMinor, fresh.currency)}</Text></View>
      </View>
      {coupon.trim() && !fresh.couponId ? <Text style={{ color: c.coral, fontSize: 12, marginTop: 6 }}>Coupon was not applied to this order.</Text> : null}
      <View style={{ marginTop: 12 }}>
        <Toggle label="I will pay the seller directly" detail="Manual payment. VastMind does not charge you, store card details, or issue refunds; the seller records payment once received." value={ack} onChange={setAck} />
      </View>
      <Btn icon="check-circle" label={`Place order · ${money(fresh.totalMinor, fresh.currency)}`} busy={place.isPending} disabled={!ack || locked} onPress={submit} />
    </Card>}
  </View>;
}

function Row({ k, v, accent }: { k: string; v: string; accent?: string }) {
  const c = useColors();
  return <View style={s.between}><Text style={{ color: c.mutedForeground }}>{k}</Text><Text style={{ color: accent ?? c.foreground, fontWeight: '600' }}>{v}</Text></View>;
}
