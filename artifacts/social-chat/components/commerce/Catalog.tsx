import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  useCommerceCreateProduct, useCommerceListProducts, useCommerceUpdateProduct,
  type CommerceProduct, type CommerceProductInput, type CommerceShop,
} from '@workspace/api-client-react';
import { MobileMediaPicker, MobileMediaPreview } from '@/components/Media';
import { useColors } from '@/hooks/useColors';
import { Btn, Card, Chip, Empty, ErrorRetry, Field, Kicker, Notice, Pager, Skeleton, Tag, errText, fromMinor, money, s, toMinor, useCursor, useInvalidateCommerce } from './kit';

type Media = { id: string; url: string; name: string; contentType: string; size: number };
type VariantDraft = { id?: string; label: string; sku: string; price: string; inventory: string };

export function Catalog({ shop }: { shop: CommerceShop }) {
  const c = useColors();
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'live' | 'draft' | 'low' | 'legacy'>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<CommerceProduct | 'new' | null>(null);
  const cur = useCursor();
  const list = useCommerceListProducts({ scope: 'mine', ...(q.trim() ? { q: q.trim() } : {}), ...(cur.cursor ? { cursor: cur.cursor } : {}) });
  const items = (list.data?.items ?? []).filter(p => !p.shopId || p.shopId === shop.id).filter(p =>
    filter === 'live' ? p.isPublished : filter === 'draft' ? !p.isPublished : filter === 'low' ? p.inventory <= 3 : filter === 'legacy' ? !p.shopId : true);
  if (editing) return <ProductEditor shop={shop} product={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />;
  return <View>
    <Btn icon="plus" label="New product" onPress={() => setEditing('new')} />
    <Field label="Search catalog" value={q} onChangeText={t => { setQ(t); cur.reset(); }} placeholder="Title or SKU" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 12 }}>
      {([['all', 'All'], ['live', 'Published'], ['draft', 'Drafts'], ['low', 'Low stock'], ['legacy', 'Legacy']] as const).map(([k, l]) => <Chip key={k} label={l} active={filter === k} onPress={() => setFilter(k)} />)}
    </ScrollView>
    {list.isLoading ? <Skeleton rows={3} /> : null}
    {list.isError ? <ErrorRetry message={errText(list.error)} onRetry={() => void list.refetch()} /> : null}
    {list.data && !items.length ? <Empty icon="package" title={filter === 'all' ? 'Your catalog is empty' : 'Nothing in this view'} body="Add photos, options and stock, then publish when ready." /> : null}
    {items.map(p => <Card key={p.id} accent={p.isPublished ? c.lime : c.gold}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${p.title}`} onPress={() => setEditing(p)}>
        <View style={s.between}>
          <Text style={{ color: c.foreground, fontWeight: '800', flex: 1 }} numberOfLines={1}>{p.title}</Text>
          <Text style={{ color: c.foreground, fontWeight: '800' }}>{money(p.priceMinor, p.currency)}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          <Tag label={p.isPublished ? 'Published' : 'Draft'} tone={p.isPublished ? 'cyan' : 'violet'} />
          <Tag label={`${p.inventory} in stock`} tone={p.inventory <= 3 ? 'danger' : 'muted'} />
          {p.variants.length ? <Tag label={`${p.variants.length} options`} tone="blue" /> : null}
          {p.gallery.length ? <Tag label={`${p.gallery.length} photos`} /> : null}
          {!p.shopId ? <Tag label="Legacy listing" tone="magenta" /> : null}
        </View>
      </Pressable>
      {p.isPublished ? <Pressable accessibilityRole="button" accessibilityLabel={`Save a promotion draft for ${p.title}`} onPress={() => router.push({ pathname: '/(tabs)/business', params: { targetType: 'product', targetId: p.id, name: p.title } } as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 11 }}>
        <Feather name="trending-up" size={15} color={c.primary} /><Text style={{ color: c.primary, fontSize: 12, fontWeight: '700' }}>Plan a promotion</Text>
      </Pressable> : null}
    </Card>)}
    <Pager hasPrev={cur.hasPrev} next={list.data?.nextCursor} onPrev={cur.prev} onNext={() => cur.next(list.data?.nextCursor)} />
  </View>;
}

function ProductEditor({ shop, product, onDone }: { shop: CommerceShop; product?: CommerceProduct; onDone: () => void }) {
  const c = useColors();
  const cur = shop.currency;
  const create = useCommerceCreateProduct();
  const update = useCommerceUpdateProduct();
  const invalidate = useInvalidateCommerce();
  const [title, setTitle] = useState(product?.title ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [category, setCategory] = useState(product?.category ?? shop.category);
  const [price, setPrice] = useState(product ? fromMinor(product.priceMinor, product.currency) : '');
  const [inventory, setInventory] = useState(String(product?.inventory ?? 1));
  const [media, setMedia] = useState<Media[]>(product?.gallery ?? []);
  const [variants, setVariants] = useState<VariantDraft[]>((product?.variants ?? []).map(v => ({ id: v.id, label: v.label, sku: v.sku, price: fromMinor(v.priceMinor, product?.currency ?? cur), inventory: String(v.inventory) })));
  const busy = create.isPending || update.isPending;
  const currencyChanged = !!product && product.currency !== cur;
  const setV = (i: number, patch: Partial<VariantDraft>) => setVariants(vs => vs.map((v, j) => j === i ? { ...v, ...patch } : v));
  const move = (i: number, d: number) => setMedia(m => { const n = [...m]; const j = i + d; if (j < 0 || j >= n.length) return m; [n[i], n[j]] = [n[j], n[i]]; return n; });

  async function save(isPublished: boolean) {
    const priceMinor = toMinor(price, cur);
    const inv = Number(inventory);
    if (!title.trim() || !category.trim() || !Number.isFinite(priceMinor) || priceMinor < 1 || !Number.isInteger(inv) || inv < 0) {
      Alert.alert('Check the listing', `Add a title, category, a price above zero in ${cur}, and a whole-number stock count.`); return;
    }
    const vs = [];
    const skus = new Set<string>();
    for (const v of variants) {
      const vp = toMinor(v.price || price, cur); const vi = Number(v.inventory);
      if (!v.label.trim() || !v.sku.trim() || !Number.isFinite(vp) || vp < 1 || !Number.isInteger(vi) || vi < 0) { Alert.alert('Check options', 'Every option needs a label, SKU, price and whole-number stock.'); return; }
      if (skus.has(v.sku.trim())) { Alert.alert('Duplicate SKU', `SKU ${v.sku} is used twice.`); return; }
      skus.add(v.sku.trim());
      vs.push({ ...(v.id ? { id: v.id } : {}), label: v.label.trim(), sku: v.sku.trim(), priceMinor: vp, inventory: vi });
    }
    const data: CommerceProductInput = {
      shopId: shop.id, title: title.trim(), description: description.trim(), category: category.trim(), priceMinor,
      inventory: vs.length ? vs.reduce((n, v) => n + v.inventory, 0) : inv, isPublished, mediaIds: media.map(m => m.id), variants: vs,
    };
    try {
      if (product) await update.mutateAsync({ productId: product.id, data }); else await create.mutateAsync({ data });
      await invalidate(); onDone();
    } catch (e) { Alert.alert("Couldn't save product", errText(e)); }
  }

  return <View>
    <Pressable accessibilityRole="button" onPress={onDone} style={[s.row, { minHeight: 40, marginBottom: 6 }]}><Feather name="arrow-left" size={18} color={c.primary} /><Text style={{ color: c.primary, fontWeight: '700' }}>Catalog</Text></Pressable>
    <Kicker>{product ? 'Edit product' : 'New product'} · {shop.name}</Kicker>
    {!product?.shopId && product ? <Notice tone="warn" text={`This legacy listing will move into ${shop.name} when you save.`} /> : null}
    {currencyChanged ? <Notice tone="warn" text={`This product was priced in ${product?.currency}. Prices below are now treated as ${cur}; review them before saving.`} /> : null}
    <View style={{ height: 10 }} />
    <Field label="Title" value={title} onChangeText={setTitle} maxLength={180} />
    <Field label="Description" value={description} onChangeText={setDescription} maxLength={10000} multiline />
    <Field label="Category" value={category} onChangeText={setCategory} maxLength={80} />
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Field label={`Price (${cur})`} style={{ flex: 1 }} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
      <Field label={variants.length ? 'Stock (from options)' : 'Stock'} style={{ flex: 1 }} value={variants.length ? String(variants.reduce((n, v) => n + (Number(v.inventory) || 0), 0)) : inventory} editable={!variants.length} onChangeText={setInventory} keyboardType="number-pad" />
    </View>

    <View style={[s.between, { marginTop: 4 }]}><Text style={{ color: c.forest, fontWeight: '800', fontSize: 16 }}>Photos {media.length}/8</Text>{media.length < 8 ? <MobileMediaPicker purpose="product" disabled={busy} onChange={m => setMedia(x => x.length >= 8 ? x : [...x, m])} /> : null}</View>
    {media.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 10 }}>
      {media.map((m, i) => <View key={m.id} style={{ borderWidth: 1, borderColor: i === 0 ? c.primary : c.border, borderRadius: 16, padding: 6, alignItems: 'center', backgroundColor: c.card }}>
        <View pointerEvents="none" style={{ width: 150, height: 120, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}><View style={{ transform: [{ scale: 0.6 }] }}><MobileMediaPreview media={m} /></View></View>
        <View style={s.row}>
          <Pressable accessibilityLabel="Move photo earlier" onPress={() => move(i, -1)} style={{ padding: 8 }}><Feather name="chevron-left" size={16} color={c.foreground} /></Pressable>
          <Text style={{ color: c.mutedForeground, fontSize: 11 }}>{i === 0 ? 'Cover' : i + 1}</Text>
          <Pressable accessibilityLabel="Move photo later" onPress={() => move(i, 1)} style={{ padding: 8 }}><Feather name="chevron-right" size={16} color={c.foreground} /></Pressable>
          <Pressable accessibilityLabel="Remove photo" onPress={() => setMedia(x => x.filter(y => y.id !== m.id))} style={{ padding: 8 }}><Feather name="trash-2" size={15} color={c.destructive} /></Pressable>
        </View>
      </View>)}
    </ScrollView> : <Text style={{ color: c.mutedForeground, fontSize: 12, marginVertical: 8 }}>Add up to 8 photos. The first is the cover.</Text>}

    <View style={[s.between, { marginTop: 10, marginBottom: 6 }]}><Text style={{ color: c.forest, fontWeight: '800', fontSize: 16 }}>Options and SKUs</Text>
      <Btn small variant="soft" icon="plus" label="Option" disabled={variants.length >= 50} onPress={() => setVariants(v => [...v, { label: '', sku: '', price, inventory: '0' }])} /></View>
    {variants.map((v, i) => <Card key={v.id ?? `n${i}`}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field label="Label" style={{ flex: 1 }} value={v.label} maxLength={100} onChangeText={t => setV(i, { label: t })} placeholder="Large / Blue" />
        <Field label="SKU" style={{ flex: 1 }} value={v.sku} maxLength={80} autoCapitalize="characters" onChangeText={t => setV(i, { sku: t })} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <Field label={`Price ${cur}`} style={{ flex: 1 }} value={v.price} keyboardType="decimal-pad" onChangeText={t => setV(i, { price: t })} />
        <Field label="Stock" style={{ flex: 1 }} value={v.inventory} keyboardType="number-pad" onChangeText={t => setV(i, { inventory: t })} />
        <Pressable accessibilityLabel={`Remove option ${v.label}`} onPress={() => setVariants(vs => vs.filter((_, j) => j !== i))} style={{ padding: 12, marginBottom: 12 }}><Feather name="trash-2" size={17} color={c.destructive} /></Pressable>
      </View>
    </Card>)}
    {!variants.length ? <Text style={{ color: c.mutedForeground, fontSize: 12, marginBottom: 8 }}>No options. Buyers order the product as listed.</Text> : null}

    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
      <Btn flex variant="ghost" icon="save" label="Save draft" busy={busy} onPress={() => void save(false)} />
      <Btn flex icon="upload" label={product?.isPublished ? 'Save & keep live' : 'Publish'} busy={busy} onPress={() => void save(true)} />
    </View>
  </View>;
}
