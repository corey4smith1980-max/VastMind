import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useCommerceListShops, type CommerceShop, type CommerceShopRole } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { Catalog } from './Catalog';
import { Dashboard } from './Dashboard';
import { Campaigns, Coupons } from './Marketing';
import { OrdersList } from './Orders';
import { Customers, Team } from './People';
import { ShopForm } from './ShopForm';
import { Btn, Chip, Empty, ErrorRetry, Kicker, Skeleton, Tag, errText } from './kit';

type Pane = 'overview' | 'catalog' | 'orders' | 'coupons' | 'campaigns' | 'customers' | 'team' | 'storefront';
const PANES: [Pane, string, React.ComponentProps<typeof Feather>['name'], CommerceShopRole[]][] = [
  ['overview', 'Dashboard', 'bar-chart-2', ['owner', 'manager', 'marketer']],
  ['orders', 'Orders', 'package', ['owner', 'manager', 'fulfillment']],
  ['catalog', 'Catalog', 'grid', ['owner', 'manager']],
  ['coupons', 'Coupons', 'percent', ['owner', 'manager', 'marketer']],
  ['campaigns', 'Campaigns', 'link', ['owner', 'manager', 'marketer', 'creator']],
  ['customers', 'Customers', 'users', ['owner', 'manager']],
  ['team', 'Team', 'shield', ['owner', 'manager']],
  ['storefront', 'Storefront', 'settings', ['owner', 'manager']],
];

export function SellerStudio() {
  const c = useColors();
  const shops = useCommerceListShops({ scope: 'mine' });
  const [selected, setSelected] = useState<string>();
  const [pane, setPane] = useState<Pane>('overview');
  const [creating, setCreating] = useState(false);
  const list = shops.data?.items ?? [];
  const shop: CommerceShop | undefined = list.find(x => x.id === selected) ?? list[0];
  const panes = shop ? PANES.filter(p => p[3].includes(shop.role)) : [];
  const active = panes.find(p => p[0] === pane)?.[0] ?? panes[0]?.[0];

  if (shops.isLoading) return <Skeleton rows={2} />;
  if (shops.isError) return <ErrorRetry message={errText(shops.error)} onRetry={() => void shops.refetch()} />;
  if (creating || !list.length) return <View>
    {!list.length && !creating ? <Empty icon="shopping-bag" title="Open your VastMind shop" body="Set your currency, delivery and pickup options, then add products with photos and options. Your earlier listings are kept." action={<Btn icon="plus" label="Create shop" onPress={() => setCreating(true)} />} /> : null}
    {creating ? <ShopForm onSaved={sh => { setCreating(false); setSelected(sh.id); setPane('catalog'); }} onCancel={() => setCreating(false)} /> : null}
  </View>;
  if (!shop) return null;

  return <View>
    <View style={{ backgroundColor: c.forest, borderRadius: 24, padding: 16, marginBottom: 12, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', right: -30, top: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: c.coral, opacity: 0.3 }} />
      <Kicker color={c.lime}>{shop.role} · {shop.currency}</Kicker>
      <Text style={{ color: c.cream, fontSize: 22, fontWeight: '900', marginTop: 4 }}>{shop.name}</Text>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <Tag label={shop.isPublished ? 'Published' : 'Hidden'} tone={shop.isPublished ? 'cyan' : 'magenta'} />
        <Tag label={`${shop.followerCount} followers`} tone="violet" />
      </View>
    </View>
    {list.length > 1 || shop.role === 'owner' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 10 }}>
      {list.length > 1 ? list.map(x => <Chip key={x.id} label={x.name} active={x.id === shop.id} onPress={() => setSelected(x.id)} />) : null}
      <Chip label="New shop" icon="plus" onPress={() => setCreating(true)} />
    </ScrollView> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 14 }} accessibilityRole="tablist">
      {panes.map(([k, l, icon]) => <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: active === k }} onPress={() => setPane(k)}
        style={{ alignItems: 'center', gap: 4, width: 76, paddingVertical: 10, borderRadius: 16, backgroundColor: active === k ? c.secondary : c.card, borderWidth: 1, borderColor: active === k ? c.gold : c.border }}>
        <Feather name={icon} size={17} color={active === k ? c.gold : c.mutedForeground} />
        <Text style={{ color: active === k ? c.foreground : c.mutedForeground, fontSize: 11, fontWeight: '700' }}>{l}</Text>
      </Pressable>)}
    </ScrollView>
    {active === 'overview' ? <Dashboard key={shop.id} shop={shop} /> : null}
    {active === 'orders' ? <OrdersList key={shop.id} scope="seller" shopId={shop.id} /> : null}
    {active === 'catalog' ? <Catalog key={shop.id} shop={shop} /> : null}
    {active === 'coupons' ? <Coupons key={shop.id} shop={shop} /> : null}
    {active === 'campaigns' ? <Campaigns key={shop.id} shop={shop} canCreate /> : null}
    {active === 'customers' ? <Customers key={shop.id} shop={shop} /> : null}
    {active === 'team' ? <Team key={shop.id} shop={shop} /> : null}
    {active === 'storefront' ? <ShopForm key={shop.id} shop={shop} onSaved={() => setPane('overview')} /> : null}
    {active === undefined ? <Text style={{ color: c.mutedForeground }}>Your role has no studio tools for this shop.</Text> : null}
  </View>;
}
