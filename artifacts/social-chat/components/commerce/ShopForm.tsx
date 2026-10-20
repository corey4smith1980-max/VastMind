import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useCommerceCreateShop, useCommerceUpdateShop, type CommerceShop, type CommerceShopInput } from '@workspace/api-client-react';
import { MobileMediaPicker, MobileMediaPreview } from '@/components/Media';
import { useColors } from '@/hooks/useColors';
import { Btn, Card, Field, Kicker, Toggle, errText, fromMinor, s, toMinor, useInvalidateCommerce, validCurrency } from './kit';

type Media = { id: string; url: string; name: string; contentType: string; size: number };
const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

export function ShopForm({ shop, onSaved, onCancel }: { shop?: CommerceShop; onSaved: (s: CommerceShop) => void; onCancel?: () => void }) {
  const c = useColors();
  const create = useCommerceCreateShop();
  const update = useCommerceUpdateShop();
  const invalidate = useInvalidateCommerce();
  const [f, setF] = useState({
    name: shop?.name ?? '', slug: shop?.slug ?? '', currency: shop?.currency ?? 'USD', category: shop?.category ?? '',
    description: shop?.description ?? '', policies: shop?.policies ?? '', contact: shop?.contact ?? '', pickupDetails: shop?.pickupDetails ?? '',
    shipping: shop ? fromMinor(shop.shippingMinor, shop.currency) : '0', deliveryEnabled: shop?.deliveryEnabled ?? true, pickupEnabled: shop?.pickupEnabled ?? false,
    isPublished: shop?.isPublished ?? false,
  });
  const [slugTouched, setSlugTouched] = useState(!!shop);
  const [logo, setLogo] = useState<Media | undefined>(shop?.logo);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(o => ({ ...o, [k]: v }));
  const busy = create.isPending || update.isPending;

  async function save() {
    const currency = f.currency.trim().toUpperCase();
    const shippingMinor = toMinor(f.shipping || '0', currency);
    const problems = [
      f.name.trim().length < 2 && 'a shop name (2+ characters)',
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.slug) || f.slug.length < 3 ? 'a web address of lowercase letters, numbers, and dashes' : '',
      !validCurrency(currency) && 'a supported 3-letter currency code',
      !f.category.trim() && 'a category',
      !f.deliveryEnabled && !f.pickupEnabled && 'delivery or pickup',
      !Number.isFinite(shippingMinor) && 'a valid delivery fee',
    ].filter(Boolean);
    if (problems.length) { Alert.alert('Check your shop', `Add ${problems.join(', ')}.`); return; }
    const data: CommerceShopInput = {
      name: f.name.trim(), slug: f.slug, currency, category: f.category.trim(), description: f.description.trim(), policies: f.policies.trim(),
      contact: f.contact.trim(), pickupDetails: f.pickupDetails.trim(), shippingMinor, deliveryEnabled: f.deliveryEnabled, pickupEnabled: f.pickupEnabled,
      isPublished: f.isPublished, logoMediaId: logo?.id ?? null,
    };
    try {
      const saved = shop ? await update.mutateAsync({ shopId: shop.id, data }) : await create.mutateAsync({ data });
      await invalidate(); onSaved(saved);
    } catch (e) { Alert.alert("Couldn't save shop", errText(e)); }
  }

  return <Card>
    <Kicker>{shop ? 'Storefront settings' : 'Open your shop'}</Kicker>
    <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 4, marginBottom: 12, lineHeight: 17 }}>{shop ? 'Changes apply to new orders. Currency changes do not convert existing prices.' : 'Create a shop before adding new products. Your older listings stay available.'}</Text>
    <Field label="Shop name" value={f.name} maxLength={100} onChangeText={t => { set('name', t); if (!slugTouched) set('slug', slugify(t)); }} />
    <Field label="Web address" value={f.slug} maxLength={60} autoCapitalize="none" onChangeText={t => { setSlugTouched(true); set('slug', t.toLowerCase()); }} hint="Lowercase letters, numbers and dashes" />
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Field label="Currency" style={{ flex: 1 }} value={f.currency} maxLength={3} autoCapitalize="characters" onChangeText={t => set('currency', t)} />
      <Field label="Category" style={{ flex: 2 }} value={f.category} maxLength={80} onChangeText={t => set('category', t)} placeholder="e.g. Ceramics" />
    </View>
    <Field label="About" value={f.description} maxLength={3000} multiline onChangeText={t => set('description', t)} />
    <View style={[s.between, { borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 10, marginBottom: 10 }]}>
      <Text style={{ color: c.foreground, flex: 1 }}>{logo ? 'Shop logo' : 'Add a logo (optional)'}</Text>
      {logo ? <Btn small variant="ghost" label="Remove" onPress={() => setLogo(undefined)} /> : null}
      <MobileMediaPicker purpose="product" onChange={setLogo} disabled={busy} />
    </View>
    {logo ? <View style={{ alignItems: 'center', marginBottom: 10 }}><MobileMediaPreview media={logo} /></View> : null}
    <Toggle label="Delivery" value={f.deliveryEnabled} onChange={v => set('deliveryEnabled', v)} />
    {f.deliveryEnabled ? <Field label={`Delivery fee (${f.currency.toUpperCase() || 'currency'})`} value={f.shipping} keyboardType="decimal-pad" onChangeText={t => set('shipping', t)} /> : null}
    <Toggle label="Pickup" value={f.pickupEnabled} onChange={v => set('pickupEnabled', v)} />
    {f.pickupEnabled ? <Field label="Pickup details" value={f.pickupDetails} maxLength={1000} multiline onChangeText={t => set('pickupDetails', t)} placeholder="Where and when buyers can collect" /> : null}
    <Field label="Policies" value={f.policies} maxLength={5000} multiline onChangeText={t => set('policies', t)} placeholder="Returns, exchanges, timelines" />
    <Field label="Contact" value={f.contact} maxLength={500} onChangeText={t => set('contact', t)} placeholder="How buyers can reach you" />
    <Toggle label="Published" detail={f.isPublished ? 'Visible in discovery.' : 'Hidden while you set up.'} value={f.isPublished} onChange={v => set('isPublished', v)} />
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {onCancel ? <Btn flex variant="ghost" label="Cancel" onPress={onCancel} /> : null}
      <Btn flex icon="check" label={shop ? 'Save storefront' : 'Create shop'} busy={busy} onPress={() => void save()} />
    </View>
  </Card>;
}
