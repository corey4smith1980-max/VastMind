import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  getCommerceGetShopQueryKey, useCommerceFollowShop, useCommerceGetShop, useCommerceListProducts, useCommerceListShops, useCommerceReport,
  type CommerceListProductsSort, type CommerceProduct, type CommerceShop,
} from '@workspace/api-client-react';
import { MobileMediaPreview } from '@/components/Media';
import { useColors } from '@/hooks/useColors';
import { Stars, useContactSeller } from './ProductSheet';
import { Btn, Card, Chip, Empty, ErrorRetry, Field, Kicker, Notice, Pager, Segments, Skeleton, Tag, Toggle, errText, money, s, toMinor, useCursor, useInvalidateCommerce } from './kit';

export function ProductTile({ product: p, onOpen }: { product: CommerceProduct; onOpen: () => void }) {
  const c = useColors();
  const sold = p.inventory < 1 && !p.variants.some(v => v.inventory > 0);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${p.title}, ${money(p.priceMinor, p.currency)}`} onPress={onOpen}
    style={({ pressed }) => [{ width: '48.5%', marginBottom: 12, borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, overflow: 'hidden', transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
    <View style={{ height: 130, backgroundColor: c.forest, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {p.gallery[0] ? <View pointerEvents="none" style={{ transform: [{ scale: 0.75 }] }}><MobileMediaPreview media={p.gallery[0]} /></View> : <Feather name="package" size={28} color={c.lime} />}
      {sold ? <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: c.destructive, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: c.destructiveForeground, fontSize: 10, fontWeight: '800' }}>SOLD OUT</Text></View> : null}
      {p.saved ? <View style={{ position: 'absolute', top: 8, right: 8 }}><Feather name="bookmark" size={16} color={c.coral} /></View> : null}
    </View>
    <View style={{ padding: 10, gap: 3 }}>
      <Text numberOfLines={1} style={{ color: c.gold, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>{p.category}</Text>
      <Text numberOfLines={2} style={{ color: c.foreground, fontWeight: '700', minHeight: 36 }}>{p.title}</Text>
      <Text style={{ color: c.foreground, fontWeight: '900' }}>{p.variants.length > 1 ? 'From ' : ''}{money(Math.min(p.priceMinor, ...p.variants.map(v => v.priceMinor)), p.currency)}</Text>
      <View style={s.row}>{p.reviewCount ? <Stars value={p.rating} size={10} /> : null}<Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 11, flex: 1 }}>{p.shopName ?? p.sellerName}</Text></View>
    </View>
  </Pressable>;
}

export function ProductGrid({ items, onOpen }: { items: CommerceProduct[]; onOpen: (p: CommerceProduct) => void }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>{items.map(p => <ProductTile key={p.id} product={p} onOpen={() => onOpen(p)} />)}</View>;
}

const SORTS = [['newest', 'Newest'], ['price_low', 'Price low'], ['price_high', 'Price high']] as const;

export function DiscoverProducts({ onOpen, saved }: { onOpen: (p: CommerceProduct) => void; saved?: boolean }) {
  const c = useColors();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState(false);
  const [category, setCategory] = useState('');
  const [currency, setCurrency] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [sort, setSort] = useState<CommerceListProductsSort>('newest');
  const cur = useCursor();
  const code = currency.trim().toUpperCase();
  const minM = min.trim() ? toMinor(min, code || 'USD') : undefined;
  const maxM = max.trim() ? toMinor(max, code || 'USD') : undefined;
  const params = {
    scope: saved ? 'saved' as const : 'discover' as const, sort,
    ...(q.trim() ? { q: q.trim() } : {}), ...(category.trim() ? { category: category.trim() } : {}),
    ...(code.length === 3 ? { currency: code } : {}),
    ...(minM !== undefined && Number.isFinite(minM) ? { minPrice: minM } : {}), ...(maxM !== undefined && Number.isFinite(maxM) ? { maxPrice: maxM } : {}),
    ...(cur.cursor ? { cursor: cur.cursor } : {}),
  };
  const list = useCommerceListProducts(params);
  const active = [category, code, min, max].filter(Boolean).length;
  return <View>
    <View style={[s.row, { marginBottom: 10 }]}>
      <View style={[s.row, { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingHorizontal: 12, backgroundColor: c.card }]}>
        <Feather name="search" size={16} color={c.mutedForeground} />
        <TextInput accessibilityLabel="Search products" placeholder={saved ? 'Search saved' : 'Search products and shops'} placeholderTextColor={c.mutedForeground} value={q} maxLength={100}
          onChangeText={t => { setQ(t); cur.reset(); }} style={{ flex: 1, minHeight: 46, color: c.foreground }} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Filters${active ? `, ${active} active` : ''}`} onPress={() => setFilters(f => !f)}
        style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: filters || active ? c.forest : c.card, borderWidth: 1, borderColor: c.border }}>
        <Feather name="sliders" size={17} color={filters || active ? c.lime : c.foreground} />
      </Pressable>
    </View>
    {filters ? <Card>
      <Field label="Category" value={category} onChangeText={t => { setCategory(t); cur.reset(); }} placeholder="Any category" maxLength={80} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field label="Currency" style={{ flex: 1 }} value={currency} autoCapitalize="characters" maxLength={3} onChangeText={t => { setCurrency(t); cur.reset(); }} placeholder="Any" />
        <Field label="Min" style={{ flex: 1 }} value={min} keyboardType="decimal-pad" onChangeText={t => { setMin(t); cur.reset(); }} placeholder="0" />
        <Field label="Max" style={{ flex: 1 }} value={max} keyboardType="decimal-pad" onChangeText={t => { setMax(t); cur.reset(); }} placeholder="Any" />
      </View>
      {(min || max) && code.length !== 3 ? <Text style={{ color: c.mutedForeground, fontSize: 11, marginBottom: 8 }}>Set a currency for exact price ranges across currencies.</Text> : null}
      <Btn small variant="ghost" icon="x" label="Clear filters" onPress={() => { setCategory(''); setCurrency(''); setMin(''); setMax(''); cur.reset(); }} />
    </Card> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
      {SORTS.map(([k, l]) => <Chip key={k} label={l} active={sort === k} onPress={() => { setSort(k); cur.reset(); }} />)}
    </ScrollView>
    {list.isLoading ? <Skeleton rows={3} /> : null}
    {list.isError ? <ErrorRetry message={errText(list.error)} onRetry={() => void list.refetch()} /> : null}
    {list.data && !list.data.items.length ? <Empty icon={saved ? 'bookmark' : 'search'} title={saved ? 'Nothing saved yet' : 'No products match'} body={saved ? 'Tap the bookmark on any product to keep it here.' : 'Try a broader search or clear your filters.'} /> : null}
    {list.data ? <ProductGrid items={list.data.items} onOpen={onOpen} /> : null}
    <Pager hasPrev={cur.hasPrev} next={list.data?.nextCursor} onPrev={cur.prev} onNext={() => cur.next(list.data?.nextCursor)} />
  </View>;
}

export function ShopCard({ shop, onOpen }: { shop: CommerceShop; onOpen: () => void }) {
  const c = useColors();
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${shop.name}`} onPress={onOpen} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
    <Card>
      <View style={s.row}>
        <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: c.forest, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <Text style={{ color: c.lime, fontWeight: '900', fontSize: 18 }}>{shop.name.slice(0, 2).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontWeight: '800', fontSize: 16 }} numberOfLines={1}>{shop.name}</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }} numberOfLines={1}>{shop.category} · {shop.currency} · {shop.followerCount} followers</Text>
        </View>
        {shop.following ? <Tag label="Following" tone="cyan" /> : <Feather name="chevron-right" size={18} color={c.mutedForeground} />}
      </View>
      {shop.description ? <Text numberOfLines={2} style={{ color: c.mutedForeground, marginTop: 8, lineHeight: 19 }}>{shop.description}</Text> : null}
    </Card>
  </Pressable>;
}

export function DiscoverShops({ onOpen }: { onOpen: (id: string) => void }) {
  const c = useColors();
  const [scope, setScope] = useState<'discover' | 'following'>('discover');
  const [q, setQ] = useState('');
  const cur = useCursor();
  const list = useCommerceListShops({ scope, ...(q.trim() ? { q: q.trim() } : {}), ...(cur.cursor ? { cursor: cur.cursor } : {}) });
  return <View>
    <Segments value={scope} options={[['discover', 'All shops'], ['following', 'Following']] as const} onChange={v => { setScope(v); cur.reset(); }} />
    <TextInput accessibilityLabel="Search shops" placeholder="Search shops" placeholderTextColor={c.mutedForeground} value={q} maxLength={100} onChangeText={t => { setQ(t); cur.reset(); }}
      style={[s.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.card, marginBottom: 12 }]} />
    {list.isLoading ? <Skeleton rows={2} /> : null}
    {list.isError ? <ErrorRetry message={errText(list.error)} onRetry={() => void list.refetch()} /> : null}
    {list.data && !list.data.items.length ? <Empty icon="home" title={scope === 'following' ? 'No followed shops' : 'No shops found'} body={scope === 'following' ? 'Follow a shop to hear about new drops.' : 'Try another search.'} /> : null}
    {list.data?.items.map(sh => <ShopCard key={sh.id} shop={sh} onOpen={() => onOpen(sh.id)} />)}
    <Pager hasPrev={cur.hasPrev} next={list.data?.nextCursor} onPrev={cur.prev} onNext={() => cur.next(list.data?.nextCursor)} />
  </View>;
}

export function Storefront({ shopId, onBack, onOpen }: { shopId: string; onBack: () => void; onOpen: (p: CommerceProduct) => void }) {
  const c = useColors();
  const shop = useCommerceGetShop(shopId, { query: { queryKey: getCommerceGetShopQueryKey(shopId) } });
  const cur = useCursor();
  const products = useCommerceListProducts({ shopId, scope: 'discover', ...(cur.cursor ? { cursor: cur.cursor } : {}) });
  const follow = useCommerceFollowShop();
  const report = useCommerceReport();
  const invalidate = useInvalidateCommerce();
  const contact = useContactSeller();
  const [info, setInfo] = useState(false);
  const [reason, setReason] = useState('');
  const [reporting, setReporting] = useState(false);
  const sh = shop.data;
  async function setFollow(following: boolean, marketingOptIn: boolean) {
    try { await follow.mutateAsync({ shopId, data: { following, marketingOptIn: following && marketingOptIn } }); await invalidate(); }
    catch (e) { Alert.alert("Couldn't update", errText(e)); }
  }
  async function sendReport() {
    if (reason.trim().length < 5) { Alert.alert('Add a reason', 'Use at least 5 characters.'); return; }
    try { await report.mutateAsync({ data: { kind: 'shop', targetId: shopId, reason: reason.trim() } }); setReporting(false); setReason(''); Alert.alert('Report sent', 'Our team will review this shop.'); }
    catch (e) { Alert.alert("Couldn't send report", errText(e)); }
  }
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to discovery" onPress={onBack} style={[s.row, { marginBottom: 12, minHeight: 40 }]}><Feather name="arrow-left" size={18} color={c.primary} /><Text style={{ color: c.primary, fontWeight: '700' }}>All shops</Text></Pressable>
    {shop.isLoading ? <Skeleton rows={1} /> : null}
    {shop.isError ? <ErrorRetry message={errText(shop.error)} onRetry={() => void shop.refetch()} /> : null}
    {sh ? <View style={{ backgroundColor: c.forest, borderRadius: 26, padding: 18, marginBottom: 14, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', right: -40, top: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: c.gold, opacity: 0.35 }} />
      <View style={{ position: 'absolute', right: 30, bottom: -50, width: 110, height: 110, borderRadius: 55, backgroundColor: c.lime, opacity: 0.25 }} />
      <Kicker color={c.lime}>{sh.category} · {sh.currency}</Kicker>
      <Text style={{ color: c.cream, fontSize: 27, fontWeight: '900', marginTop: 6, letterSpacing: -0.6 }}>{sh.name}</Text>
      <Text style={{ color: c.cream, opacity: 0.75, marginTop: 4 }}>by {sh.ownerName} · {sh.followerCount} followers</Text>
      {sh.description ? <Text style={{ color: c.cream, marginTop: 10, lineHeight: 20 }}>{sh.description}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        {sh.deliveryEnabled ? <Tag label={`Delivery${sh.shippingMinor ? ` ${money(sh.shippingMinor, sh.currency)}` : ''}`} tone="cyan" /> : null}
        {sh.pickupEnabled ? <Tag label="Pickup" tone="magenta" /> : null}
        {!sh.isPublished ? <Tag label="Unpublished" tone="danger" /> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        <Btn flex variant={sh.following ? 'soft' : 'primary'} icon={sh.following ? 'check' : 'plus'} label={sh.following ? 'Following' : 'Follow'} busy={follow.isPending} onPress={() => void setFollow(!sh.following, sh.marketingOptIn)} />
        <Btn variant="soft" icon="message-circle" a11y="Contact seller" busy={contact.busy} onPress={() => void contact.open(sh.ownerId)} />
        <Btn variant="soft" icon="info" a11y="Shop policies" onPress={() => setInfo(i => !i)} />
      </View>
    </View> : null}
    {sh?.following ? <Toggle label="Send me offers from this shop" detail="Your choice. You can turn marketing off any time; the shop cannot change it for you." value={sh.marketingOptIn} onChange={v => void setFollow(true, v)} /> : null}
    {sh && info ? <Card>
      <Kicker>Policies</Kicker><Text style={{ color: c.foreground, marginTop: 4, marginBottom: 10, lineHeight: 20 }}>{sh.policies || 'No policies published.'}</Text>
      <Kicker>Contact</Kicker><Text style={{ color: c.foreground, marginTop: 4, marginBottom: 10 }}>{sh.contact || 'Message the seller in VastMind.'}</Text>
      {sh.pickupEnabled ? <><Kicker>Pickup</Kicker><Text style={{ color: c.foreground, marginTop: 4, marginBottom: 10 }}>{sh.pickupDetails || 'Details shared after ordering.'}</Text></> : null}
      <Btn small variant="danger" icon="flag" label="Report shop" onPress={() => setReporting(r => !r)} />
      {reporting ? <View style={{ marginTop: 10 }}><Field label="Reason" value={reason} onChangeText={setReason} multiline maxLength={2000} placeholder="What is wrong with this shop?" /><Btn variant="danger" label="Send report" busy={report.isPending} onPress={() => void sendReport()} /></View> : null}
    </Card> : null}
    <Notice text="Orders here use manual payment arranged with the seller. VastMind does not process payments or payouts." />
    <Text style={{ color: c.forest, fontSize: 19, fontWeight: '800', marginVertical: 10 }}>Products</Text>
    {products.isLoading ? <Skeleton rows={2} /> : null}
    {products.isError ? <ErrorRetry onRetry={() => void products.refetch()} /> : null}
    {products.data && !products.data.items.length ? <Empty icon="package" title="No products yet" body="This shop has not published anything." /> : null}
    {products.data ? <ProductGrid items={products.data.items} onOpen={onOpen} /> : null}
    <Pager hasPrev={cur.hasPrev} next={products.data?.nextCursor} onPrev={cur.prev} onNext={() => cur.next(products.data?.nextCursor)} />
  </View>;
}
