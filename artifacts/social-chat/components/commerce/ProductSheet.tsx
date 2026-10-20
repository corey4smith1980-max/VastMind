import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getCommerceGetProductQueryKey, useCommerceGetProduct, useCommerceRecordEvent, useCommerceReport, useCommerceReviewProduct,
  useCommerceSaveProduct, useCreateChat, type CommerceEventInputKind, type CommerceProduct,
} from '@workspace/api-client-react';
import { MobileMediaPreview } from '@/components/Media';
import { useColors } from '@/hooks/useColors';
import { useCart } from './cart';
import { Btn, Chip, ErrorRetry, Field, Kicker, Notice, Skeleton, Stepper, Tag, errText, money, s, shortDate, useInvalidateCommerce } from './kit';

/** Fire-and-forget first-party analytics; backend dedupes daily. */
export function useTrack() {
  const rec = useCommerceRecordEvent();
  const ref = useRef(rec.mutate); ref.current = rec.mutate;
  return (kind: CommerceEventInputKind, shopId?: string, productId?: string, campaignId?: string) => {
    if (!shopId) return;
    ref.current({ data: { kind, shopId, ...(productId ? { productId } : {}), ...(campaignId ? { campaignId } : {}) } });
  };
}

export function useContactSeller() {
  const router = useRouter();
  const create = useCreateChat();
  return {
    busy: create.isPending,
    open: async (userId: string) => {
      try { const chat = await create.mutateAsync({ data: { type: 'private', memberIds: [userId] } }); router.push(`/chat/${chat.id}`); }
      catch (e) { Alert.alert("Couldn't open chat", errText(e)); }
    },
  };
}

export function Stars({ value, size = 13, onPick }: { value: number; size?: number; onPick?: (n: number) => void }) {
  const c = useColors();
  return <View style={{ flexDirection: 'row', gap: onPick ? 8 : 2 }} accessibilityLabel={`${value.toFixed(1)} out of 5`}>
    {[1, 2, 3, 4, 5].map(n => <Pressable key={n} disabled={!onPick} accessibilityLabel={onPick ? `Rate ${n}` : undefined} onPress={() => onPick?.(n)} hitSlop={6}>
      <Feather name="star" size={size} color={n <= Math.round(value) ? c.gold : c.border} />
    </Pressable>)}
  </View>;
}

export function ProductSheet({ productId, campaignId, onClose, onOpenShop }: { productId: string; campaignId?: string; onClose: () => void; onOpenShop?: (shopId: string) => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const q = useCommerceGetProduct(productId, { query: { queryKey: getCommerceGetProductQueryKey(productId) } });
  const p = q.data;
  return <Modal visible animationType="slide" transparent onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: 'rgba(6,8,30,0.55)', justifyContent: 'flex-end' }}>
      <View style={{ backgroundColor: c.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '94%', paddingBottom: insets.bottom + 8 }}>
        <View style={[s.between, { padding: 16, paddingBottom: 6 }]}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, position: 'absolute', top: 8, left: '50%', marginLeft: -20 }} />
          <Kicker>{p?.shopName ?? p?.sellerName ?? 'Product'}</Kicker>
          <Pressable accessibilityLabel="Close product" onPress={onClose} style={{ padding: 8 }}><Feather name="x" size={22} color={c.foreground} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4 }} keyboardShouldPersistTaps="handled">
          {q.isLoading ? <Skeleton rows={2} /> : null}
          {q.isError ? <ErrorRetry message={errText(q.error)} onRetry={() => void q.refetch()} /> : null}
          {p ? <ProductBody product={p} campaignId={campaignId} onClose={onClose} onOpenShop={onOpenShop} /> : null}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

function ProductBody({ product: p, campaignId, onClose, onOpenShop }: { product: CommerceProduct; campaignId?: string; onClose: () => void; onOpenShop?: (id: string) => void }) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const cartApi = useCart();
  const track = useTrack();
  const invalidate = useInvalidateCommerce();
  const contact = useContactSeller();
  const [variantId, setVariantId] = useState<string | undefined>(p.variants.length === 1 ? p.variants[0].id : undefined);
  const [qty, setQty] = useState(1);
  const [slide, setSlide] = useState(0);
  const [saved, setSaved] = useState(p.saved);
  const [flash, setFlash] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const save = useCommerceSaveProduct();
  const report = useCommerceReport();
  const rev = useCommerceReviewProduct();
  const variant = p.variants.find(v => v.id === variantId);
  const stock = variant ? variant.inventory : p.inventory;
  const price = variant?.priceMinor ?? p.priceMinor;
  const mine = p.sellerId === cartApi.me;
  const viewed = useRef(false);
  useEffect(() => { if (!viewed.current) { viewed.current = true; track('view', p.shopId, p.id, campaignId); } }, [p.id, p.shopId, campaignId, track]);
  const slideW = Math.min(width, 640) - 32;

  function add() {
    const err = cartApi.add(p, variant, qty, cartApi.me);
    if (err) { Alert.alert('Not added', err); return; }
    if (campaignId) cartApi.attribution(campaignId);
    track('add_to_cart', p.shopId, p.id, campaignId ?? cartApi.cart.campaignId);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setFlash(`Added ${qty} to cart`);
    setTimeout(() => setFlash(''), 2200);
  }
  async function toggleSave() {
    const next = !saved; setSaved(next);
    try { await save.mutateAsync({ productId: p.id, data: { saved: next } }); void invalidate(); }
    catch (e) { setSaved(!next); Alert.alert("Couldn't update saved", errText(e)); }
  }
  async function sendReport() {
    if (reason.trim().length < 5) { Alert.alert('Add a reason', 'Tell us what is wrong in at least 5 characters.'); return; }
    try { await report.mutateAsync({ data: { kind: 'product', targetId: p.id, reason: reason.trim() } }); setReportOpen(false); setReason(''); Alert.alert('Report sent', 'Thanks. Our team will review this listing.'); }
    catch (e) { Alert.alert("Couldn't send report", errText(e)); }
  }
  async function sendReview() {
    if (!review.trim()) return;
    try { await rev.mutateAsync({ productId: p.id, data: { rating, content: review.trim() } }); setReview(''); void invalidate(); Alert.alert('Review posted', 'Thanks for sharing your experience.'); }
    catch (e) { Alert.alert("Couldn't post review", errText(e)); }
  }

  return <View>
    {p.gallery.length ? <View>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={e => setSlide(Math.round(e.nativeEvent.contentOffset.x / slideW))} style={{ borderRadius: 22 }}>
        {p.gallery.map(m => <View key={m.id} style={{ width: slideW, alignItems: 'center', justifyContent: 'center', backgroundColor: c.muted, borderRadius: 22, minHeight: 200, overflow: 'hidden' }}><MobileMediaPreview media={m} /></View>)}
      </ScrollView>
      {p.gallery.length > 1 ? <View style={{ flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 8 }} accessibilityLabel={`Photo ${slide + 1} of ${p.gallery.length}`}>
        {p.gallery.map((m, i) => <View key={m.id} style={{ width: i === slide ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === slide ? c.primary : c.border }} />)}
      </View> : null}
    </View> : <View style={{ height: 160, borderRadius: 22, backgroundColor: c.forest, alignItems: 'center', justifyContent: 'center' }}><Feather name="package" size={34} color={c.lime} /></View>}

    <View style={[s.between, { marginTop: 16, alignItems: 'flex-start' }]}>
      <View style={{ flex: 1 }}>
        <Kicker color={c.gold}>{p.category}</Kicker>
        <Text style={{ color: c.foreground, fontSize: 23, fontWeight: '800', marginTop: 4, letterSpacing: -0.5 }}>{p.title}</Text>
        <View style={[s.row, { marginTop: 6 }]}><Stars value={p.rating} /><Text style={{ color: c.mutedForeground, fontSize: 12 }}>{p.reviewCount ? `${p.rating.toFixed(1)} · ${p.reviewCount} reviews` : 'No reviews yet'}</Text></View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved' : 'Save product'} onPress={() => void toggleSave()} style={{ padding: 10 }}>
        <Feather name="bookmark" size={22} color={saved ? c.coral : c.mutedForeground} />
      </Pressable>
    </View>
    <Text style={{ color: c.foreground, fontSize: 26, fontWeight: '900', marginTop: 10 }}>{money(price, p.currency)}</Text>
    <Text style={{ color: stock > 0 ? c.mutedForeground : c.destructive, fontSize: 12, marginTop: 2 }}>{stock > 0 ? `${stock} available` : 'Sold out'}{variant?.sku ? ` · SKU ${variant.sku}` : ''}</Text>

    {p.variants.length ? <View style={{ marginTop: 14 }}>
      <Text style={[s.label, { color: c.mutedForeground }]}>Options</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {p.variants.map(v => <Chip key={v.id} label={`${v.label}${v.inventory < 1 ? ' · sold out' : ''}`} active={v.id === variantId} onPress={() => { setVariantId(v.id); setQty(1); }} />)}
      </View>
    </View> : null}

    {!mine ? <View style={[s.row, { marginTop: 16 }]}>
      <Stepper label="quantity" value={qty} max={Math.max(1, Math.min(stock, 99))} onChange={setQty} />
      <Btn flex icon="shopping-bag" label={stock < 1 ? 'Sold out' : 'Add to cart'} disabled={stock < 1 || (!!p.variants.length && !variant)} onPress={add} />
    </View> : <Notice text="This is your listing. Buyers see the add-to-cart controls here." />}
    {flash ? <Text accessibilityLiveRegion="polite" style={{ color: c.lime, fontWeight: '800', marginTop: 8 }}>{flash}</Text> : null}
    {!!p.variants.length && !variant && !mine ? <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 6 }}>Choose an option to add this to your cart.</Text> : null}

    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
      {p.shopId && onOpenShop ? <Btn small variant="soft" icon="home" label="Visit shop" onPress={() => { onClose(); onOpenShop(p.shopId as string); }} /> : null}
      {!mine ? <Btn small variant="ghost" icon="message-circle" label="Contact seller" busy={contact.busy} onPress={() => void contact.open(p.sellerId)} /> : null}
      {!mine ? <Btn small variant="ghost" icon="flag" label="Report" onPress={() => setReportOpen(o => !o)} /> : null}
    </View>
    {reportOpen ? <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {['Counterfeit or fake', 'Misleading description', 'Prohibited item', 'Scam or fraud', 'Offensive content'].map(r => <Chip key={r} label={r} active={reason === r} onPress={() => setReason(r)} />)}
      </View>
      <Field label="Details" value={reason} onChangeText={setReason} maxLength={2000} multiline placeholder="What should our team know?" />
      <Btn variant="danger" icon="send" label="Send report" busy={report.isPending} onPress={() => void sendReport()} />
    </View> : null}

    <Text style={{ color: c.foreground, lineHeight: 22, marginTop: 18 }}>{p.description || 'The seller has not added a description yet.'}</Text>
    <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 10 }}>Sold by {p.sellerName}{!p.shopId ? ' · legacy listing' : ''}</Text>
    <Notice text="Payment is arranged manually with the seller after you order. VastMind does not charge cards or hold funds." />

    <Text style={{ color: c.forest, fontSize: 19, fontWeight: '800', marginTop: 16, marginBottom: 8 }}>Reviews</Text>
    {p.reviewEligible ? <View style={{ marginBottom: 12 }}>
      <Stars value={rating} size={24} onPick={setRating} />
      <Field label="Your review" value={review} onChangeText={setReview} maxLength={2000} multiline placeholder="How was the product and the seller?" />
      <Btn icon="edit-3" label="Post review" disabled={!review.trim()} busy={rev.isPending} onPress={() => void sendReview()} />
    </View> : <Text style={{ color: c.mutedForeground, fontSize: 12, marginBottom: 10 }}>Reviews open after you complete an order for this product.</Text>}
    {p.reviews.length ? p.reviews.map(r => <View key={r.userId + r.createdAt} style={{ borderTopWidth: 1, borderTopColor: c.border, paddingVertical: 10 }}>
      <View style={s.between}><Text style={{ color: c.foreground, fontWeight: '700' }}>{r.name}</Text><Stars value={r.rating} size={11} /></View>
      <Text style={{ color: c.foreground, marginTop: 4, lineHeight: 20 }}>{r.content}</Text>
      <Text style={{ color: c.mutedForeground, fontSize: 11, marginTop: 3 }}>{shortDate(r.createdAt)}</Text>
    </View>) : <Tag label="Be the first verified review" tone="violet" />}
  </View>;
}
