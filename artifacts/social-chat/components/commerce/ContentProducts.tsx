import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import {
  getCommerceListContentProductsQueryKey, useCommerceListContentProducts, useCommerceListProducts, useCommerceTagContent, type CommerceProduct,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { ProductSheet, useTrack } from './ProductSheet';
import { Btn, Empty, ErrorRetry, Kicker, Notice, Skeleton, errText, money, s } from './kit';

/**
 * Shoppable strip for posts and reels. Opening it shows a modal above the content;
 * playback is never paused or touched.
 */
export function ContentProducts({ postId, isAuthor, tone, enabled = true }: { postId: string; isAuthor: boolean; tone: 'light' | 'dark'; enabled?: boolean }) {
  const c = useColors();
  const router = useRouter();
  const track = useTrack();
  const list = useCommerceListContentProducts(postId, { query: { enabled, queryKey: getCommerceListContentProductsQueryKey(postId), staleTime: 60_000 } });
  const [sheet, setSheet] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [tagging, setTagging] = useState(false);
  const items = list.data ?? [];
  if (!items.length && !isAuthor) return null;
  const dark = tone === 'dark';
  const fg = dark ? 'rgba(246,239,228,0.95)' : c.foreground;
  const first = items[0];
  return <>
    <View style={[s.row, { marginTop: 10, flexWrap: 'wrap' }]}>
      {first ? <Pressable accessibilityRole="button" accessibilityLabel={`Shop ${items.length} product${items.length > 1 ? 's' : ''} in this post`} onPress={() => { setSheet(true); track('product_click', first.shopId, first.id); }}
        style={({ pressed }) => [s.row, { gap: 8, paddingVertical: 7, paddingLeft: 7, paddingRight: 12, borderRadius: 999, backgroundColor: dark ? 'rgba(10,12,40,0.62)' : c.secondary, borderWidth: 1, borderColor: dark ? 'rgba(0,214,240,0.55)' : c.border, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.lime, alignItems: 'center', justifyContent: 'center' }}><Feather name="shopping-bag" size={13} color={c.forest} /></View>
        <Text numberOfLines={1} style={{ color: fg, fontWeight: '800', fontSize: 12, maxWidth: 170 }}>{items.length > 1 ? `${items.length} products` : first.title}</Text>
        <Text style={{ color: dark ? c.lime : c.primary, fontWeight: '900', fontSize: 12 }}>{money(first.priceMinor, first.currency)}</Text>
      </Pressable> : null}
      {isAuthor ? <Pressable accessibilityRole="button" accessibilityLabel="Tag products in this post" onPress={() => setTagging(true)} style={[s.row, { gap: 5, paddingVertical: 7, paddingHorizontal: 10 }]}>
        <Feather name="tag" size={13} color={dark ? c.lime : c.gold} /><Text style={{ color: dark ? c.lime : c.gold, fontWeight: '800', fontSize: 12 }}>{items.length ? 'Edit tags' : 'Tag products'}</Text>
      </Pressable> : null}
    </View>
    {sheet ? <Sheet title="Shop this post" onClose={() => setSheet(false)}>
      {items.map(p => <ProductRow key={p.id} p={p} onPress={() => { track('product_click', p.shopId, p.id); setDetail(p.id); }} />)}
    </Sheet> : null}
    {detail ? <ProductSheet productId={detail} onClose={() => setDetail(null)} onOpenShop={id => { setSheet(false); router.push({ pathname: '/shop', params: { shop: id } }); }} /> : null}
    {tagging ? <TagSheet postId={postId} current={items} onClose={() => setTagging(false)} /> : null}
  </>;
}

function ProductRow({ p, onPress, selected }: { p: CommerceProduct; onPress: () => void; selected?: boolean }) {
  const c = useColors();
  return <Pressable accessibilityRole={selected === undefined ? 'button' : 'checkbox'} accessibilityState={selected === undefined ? undefined : { checked: selected }} onPress={onPress}
    style={({ pressed }) => [s.row, { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.7 : 1 }]}>
    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c.forest, alignItems: 'center', justifyContent: 'center' }}><Feather name="package" size={18} color={c.lime} /></View>
    <View style={{ flex: 1 }}>
      <Text style={{ color: c.foreground, fontWeight: '700' }} numberOfLines={1}>{p.title}</Text>
      <Text style={{ color: c.mutedForeground, fontSize: 12 }} numberOfLines={1}>{p.shopName ?? p.sellerName} · {money(p.priceMinor, p.currency)}</Text>
    </View>
    {selected === undefined ? <Feather name="chevron-right" size={18} color={c.mutedForeground} /> : <Feather name={selected ? 'check-square' : 'square'} size={20} color={selected ? c.primary : c.mutedForeground} />}
  </Pressable>;
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}>
    <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(6,8,30,0.45)' }} />
    <View style={{ backgroundColor: c.background, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, paddingBottom: insets.bottom + 14, maxHeight: '80%' }}>
      <View style={[s.between, { marginBottom: 8 }]}><Text style={{ color: c.foreground, fontSize: 19, fontWeight: '800' }}>{title}</Text><Pressable accessibilityLabel="Close" onPress={onClose} style={{ padding: 6 }}><Feather name="x" size={22} color={c.foreground} /></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
    </View>
  </Modal>;
}

function TagSheet({ postId, current, onClose }: { postId: string; current: CommerceProduct[]; onClose: () => void }) {
  const c = useColors();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>(current.map(p => p.id));
  const [known, setKnown] = useState<Record<string, CommerceProduct>>(Object.fromEntries(current.map(p => [p.id, p])));
  const mine = useCommerceListProducts({ scope: 'mine', ...(q.trim() ? { q: q.trim() } : {}) });
  const tag = useCommerceTagContent();
  const options = [...current, ...(mine.data?.items ?? []).filter(p => p.isPublished && !current.some(x => x.id === p.id))];
  function toggle(p: CommerceProduct) {
    setKnown(k => ({ ...k, [p.id]: p }));
    setPicked(ids => ids.includes(p.id) ? ids.filter(i => i !== p.id) : ids.length >= 5 ? (Alert.alert('Limit reached', 'Tag up to 5 products per post.'), ids) : [...ids, p.id]);
  }
  async function save() {
    try {
      const res = await tag.mutateAsync({ postId, data: { productIds: picked } });
      qc.setQueryData(getCommerceListContentProductsQueryKey(postId), res);
      onClose();
    } catch (e) { Alert.alert("Couldn't tag products", errText(e)); }
  }
  return <Sheet title="Tag products" onClose={onClose}>
    <Notice text="Tag products from shops where you are an approved creator or team member. Creator campaigns track clicks and orders; VastMind does not pay commissions." />
    <Kicker color={c.gold}>{picked.length} of 5 selected</Kicker>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 }}>
      {picked.map(id => <Pressable key={id} accessibilityLabel={`Remove ${known[id]?.title ?? 'product'}`} onPress={() => setPicked(ids => ids.filter(i => i !== id))} style={[s.chip, { borderColor: c.primary, backgroundColor: c.secondary }]}>
        <Text style={{ color: c.foreground, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{known[id]?.title ?? 'Product'}</Text><Feather name="x" size={12} color={c.foreground} />
      </Pressable>)}
    </View>
    <TextInput accessibilityLabel="Search your products" placeholder="Search your shop products" placeholderTextColor={c.mutedForeground} value={q} onChangeText={setQ}
      style={[s.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.card, marginBottom: 6 }]} />
    {mine.isLoading ? <Skeleton rows={1} /> : null}
    {mine.isError ? <ErrorRetry onRetry={() => void mine.refetch()} /> : null}
    {!mine.isLoading && !options.length ? <Empty icon="tag" title="No products to tag" body="Join a shop as a creator or publish products first." /> : null}
    {options.map(p => <ProductRow key={p.id} p={p} selected={picked.includes(p.id)} onPress={() => toggle(p)} />)}
    <View style={{ marginTop: 14 }}><Btn icon="check" label="Save tags" busy={tag.isPending} onPress={() => void save()} /></View>
  </Sheet>;
}
