import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getCommerceGetCampaignQueryKey, useCommerceGetCampaign, type CommerceProduct } from '@workspace/api-client-react';
import { AppHeader, PageFrame, StorageNotice } from '@/components/common';
import { useColors } from '@/hooks/useColors';
import { useCart } from '@/components/commerce/cart';
import { CheckoutPanel } from '@/components/commerce/Checkout';
import { DiscoverProducts, DiscoverShops, Storefront } from '@/components/commerce/Discover';
import { OrdersList } from '@/components/commerce/Orders';
import { ProductSheet, useTrack } from '@/components/commerce/ProductSheet';
import { Kicker, Notice } from '@/components/commerce/kit';

type Section = 'products' | 'shops' | 'saved' | 'cart' | 'orders';
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default function ShopScreen() {
  const c = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ shop?: string; product?: string; campaign?: string }>();
  const { count, attribution } = useCart();
  const track = useTrack();
  const [section, setSection] = useState<Section>('products');
  const [shopId, setShopId] = useState<string | undefined>(one(params.shop));
  const [productId, setProductId] = useState<string | undefined>(one(params.product));
  const campaignId = one(params.campaign);
  const campaign = useCommerceGetCampaign(campaignId ?? '', { query: { enabled: !!campaignId, queryKey: getCommerceGetCampaignQueryKey(campaignId ?? '') } });
  const tracked = useRef<string | null>(null);

  useEffect(() => { const s = one(params.shop); if (s) { setShopId(s); setSection('shops'); } }, [params.shop]);
  useEffect(() => { const p = one(params.product); if (p) setProductId(p); }, [params.product]);
  useEffect(() => {
    const cp = campaign.data;
    if (!cp || !cp.active || tracked.current === cp.id) return;
    tracked.current = cp.id;
    attribution(cp.id, cp.couponCode);
    track('campaign_click', cp.shopId, cp.productId, cp.id);
  }, [campaign.data, attribution, track]);

  const open = (p: CommerceProduct) => { track('product_click', p.shopId, p.id, campaign.data?.active ? campaign.data.id : undefined); setProductId(p.id); };
  const tabs: [Section, string, React.ComponentProps<typeof Feather>['name']][] = [
    ['products', 'Discover', 'compass'], ['shops', 'Shops', 'home'], ['saved', 'Saved', 'bookmark'], ['cart', count ? `Cart ${count}` : 'Cart', 'shopping-bag'], ['orders', 'Orders', 'package'],
  ];

  return <PageFrame>
    <AppHeader label="Open cart" action="shopping-bag" onAction={() => setSection('cart')} />
    <StorageNotice />
    <Kicker color={c.gold}>VastMind marketplace</Kicker>
    <Text style={{ color: c.foreground, fontSize: 32, fontWeight: '900', letterSpacing: -1, marginTop: 4 }}>Shop</Text>
    <Text style={{ color: c.mutedForeground, lineHeight: 20, marginTop: 4, marginBottom: 14 }}>Independent shops from the people you follow. Pay sellers directly, track every step here.</Text>
    {campaign.data?.active ? <Notice tone="ok" icon="zap" text={`Shopping via ${campaign.data.creatorName ? `${campaign.data.creatorName}'s` : 'a'} campaign "${campaign.data.name}"${campaign.data.couponCode ? `. Code ${campaign.data.couponCode} is saved to your cart.` : '.'}`} /> : null}
    {campaign.data && !campaign.data.active ? <Notice tone="warn" text="This campaign link has ended. You can still browse the shop." /> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 16 }} accessibilityRole="tablist">
      {tabs.map(([k, label, icon]) => {
        const on = section === k;
        return <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { setSection(k); if (k === 'shops' && on) setShopId(undefined); }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 40, borderRadius: 999, backgroundColor: on ? c.forest : c.card, borderWidth: 1, borderColor: on ? c.forest : c.border, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
          <Feather name={icon} size={14} color={on ? c.lime : c.mutedForeground} />
          <Text style={{ color: on ? c.cream : c.foreground, fontWeight: '800', fontSize: 13 }}>{label}</Text>
        </Pressable>;
      })}
    </ScrollView>

    {section === 'products' ? <DiscoverProducts onOpen={open} /> : null}
    {section === 'saved' ? <DiscoverProducts saved onOpen={open} /> : null}
    {section === 'shops' ? shopId ? <Storefront shopId={shopId} onBack={() => { setShopId(undefined); router.setParams({ shop: '' }); }} onOpen={open} /> : <DiscoverShops onOpen={setShopId} /> : null}
    {section === 'cart' ? <CheckoutPanel onPlaced={() => setSection('orders')} onBrowse={() => setSection('products')} /> : null}
    {section === 'orders' ? <OrdersList scope="buyer" /> : null}

    <Text style={{ color: c.mutedForeground, fontSize: 11, lineHeight: 17, marginVertical: 18 }}>Payments are manual and arranged directly with sellers. VastMind does not process cards, issue refunds, or pay out funds.</Text>
    {productId ? <ProductSheet productId={productId} campaignId={campaign.data?.active ? campaign.data.id : undefined} onClose={() => { setProductId(undefined); if (params.product) router.setParams({ product: '' }); }} onOpenShop={id => { setShopId(id); setSection('shops'); }} /> : null}
  </PageFrame>;
}
