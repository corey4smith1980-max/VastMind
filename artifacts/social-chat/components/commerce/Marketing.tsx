import React, { useState } from 'react';
import { Alert, ScrollView, Share, Text, View } from 'react-native';
import {
  getCommerceListTeamQueryKey, useCommerceCreateCampaign, useCommerceCreateCoupon, useCommerceListCampaigns, useCommerceListCoupons,
  useCommerceListProducts, useCommerceListTeam, useCommerceUpdateCampaign, useCommerceUpdateCoupon,
  type CommerceCampaign, type CommerceShop,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { Btn, Card, Chip, Empty, ErrorRetry, Field, Kicker, Notice, Segments, Skeleton, Tag, errText, money, s, shortDate, toMinor, useInvalidateCommerce } from './kit';

export const campaignUrl = (c: CommerceCampaign) => `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ''}${c.linkPath}`;

export function Coupons({ shop }: { shop: CommerceShop }) {
  const c = useColors();
  const list = useCommerceListCoupons(shop.id);
  const create = useCommerceCreateCoupon();
  const toggle = useCommerceUpdateCoupon();
  const invalidate = useInvalidateCommerce();
  const [open, setOpen] = useState(false);
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const [f, setF] = useState({ code: '', kind: 'percent' as 'percent' | 'fixed', value: '10', min: '0', max: '100', perBuyer: '1', expires: in30 });
  const set = (k: keyof typeof f, v: string) => setF(o => ({ ...o, [k]: v }));
  async function save() {
    const value = f.kind === 'percent' ? Number(f.value) : toMinor(f.value, shop.currency);
    const min = toMinor(f.min || '0', shop.currency);
    const exp = new Date(`${f.expires}T23:59:59`);
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(f.code) || !Number.isInteger(value) || value < 1 || (f.kind === 'percent' && value > 100) || !Number.isFinite(min)
      || !(Number(f.max) >= 1) || !(Number(f.perBuyer) >= 1) || Number.isNaN(exp.getTime()) || exp.getTime() < Date.now()) {
      Alert.alert('Check the coupon', 'Use a 3-40 character code (letters, numbers, - or _), a valid discount, limits of at least 1, and a future expiry date (YYYY-MM-DD).'); return;
    }
    try {
      await create.mutateAsync({ shopId: shop.id, data: { code: f.code.toUpperCase(), kind: f.kind, value, minSpendMinor: min, maxRedemptions: Math.floor(Number(f.max)), perBuyerLimit: Math.floor(Number(f.perBuyer)), expiresAt: exp.toISOString() } });
      setOpen(false); set('code', ''); await invalidate();
    } catch (e) { Alert.alert("Couldn't create coupon", errText(e)); }
  }
  return <View>
    <Btn icon={open ? 'x' : 'plus'} variant={open ? 'ghost' : 'primary'} label={open ? 'Close' : 'New coupon'} onPress={() => setOpen(o => !o)} />
    <View style={{ height: 12 }} />
    {open ? <Card>
      <Field label="Code" value={f.code} autoCapitalize="characters" maxLength={40} onChangeText={t => set('code', t)} placeholder="SPRING15" />
      <Segments value={f.kind} options={[['percent', 'Percent off'], ['fixed', `Fixed ${shop.currency}`]] as const} onChange={k => setF(o => ({ ...o, kind: k }))} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field label={f.kind === 'percent' ? 'Percent' : `Amount ${shop.currency}`} style={{ flex: 1 }} value={f.value} keyboardType="decimal-pad" onChangeText={t => set('value', t)} />
        <Field label={`Min spend ${shop.currency}`} style={{ flex: 1 }} value={f.min} keyboardType="decimal-pad" onChangeText={t => set('min', t)} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field label="Total uses" style={{ flex: 1 }} value={f.max} keyboardType="number-pad" onChangeText={t => set('max', t)} />
        <Field label="Per buyer" style={{ flex: 1 }} value={f.perBuyer} keyboardType="number-pad" onChangeText={t => set('perBuyer', t)} />
      </View>
      <Field label="Expires (YYYY-MM-DD)" value={f.expires} maxLength={10} onChangeText={t => set('expires', t)} />
      <Btn icon="check" label="Create coupon" busy={create.isPending} onPress={() => void save()} />
    </Card> : null}
    {list.isLoading ? <Skeleton rows={2} /> : null}
    {list.isError ? <ErrorRetry message={errText(list.error)} onRetry={() => void list.refetch()} /> : null}
    {list.data && !list.data.length ? <Empty icon="percent" title="No coupons yet" body="Create a code to share with followers or attach to a creator campaign." /> : null}
    {list.data?.map(cp => <Card key={cp.id} accent={cp.active ? c.lime : c.border}>
      <View style={s.between}>
        <Text style={{ color: c.foreground, fontWeight: '900', fontSize: 17, letterSpacing: 1 }}>{cp.code}</Text>
        <Btn small variant={cp.active ? 'ghost' : 'soft'} label={cp.active ? 'Pause' : 'Activate'} busy={toggle.isPending && toggle.variables?.couponId === cp.id}
          onPress={() => void toggle.mutateAsync({ couponId: cp.id, data: { active: !cp.active } }).then(() => invalidate()).catch(e => Alert.alert("Couldn't update", errText(e)))} />
      </View>
      <Text style={{ color: c.foreground, marginTop: 4 }}>{cp.kind === 'percent' ? `${cp.value}% off` : `${money(cp.value, cp.currency)} off`}{cp.minSpendMinor ? ` over ${money(cp.minSpendMinor, cp.currency)}` : ''}</Text>
      <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 4 }}>{cp.redemptions}/{cp.maxRedemptions} used · {cp.perBuyerLimit} per buyer · ends {shortDate(cp.expiresAt)}</Text>
    </Card>)}
  </View>;
}

export function Campaigns({ shop, canCreate }: { shop: CommerceShop; canCreate: boolean }) {
  const c = useColors();
  const isCreator = shop.role === 'creator';
  const list = useCommerceListCampaigns(shop.id);
  const coupons = useCommerceListCoupons(shop.id, { query: { enabled: canCreate && !isCreator, queryKey: ['/api/commerce/shops', shop.id, 'coupons-for-campaign'] } });
  const team = useCommerceListTeam(shop.id, { query: { enabled: canCreate && !isCreator, queryKey: getCommerceListTeamQueryKey(shop.id) } });
  const products = useCommerceListProducts({ shopId: shop.id, scope: 'mine' }, { query: { enabled: canCreate, queryKey: ['/api/commerce/products', { shopId: shop.id, scope: 'mine', for: 'campaign' }] } });
  const create = useCommerceCreateCampaign();
  const toggle = useCommerceUpdateCampaign();
  const invalidate = useInvalidateCommerce();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [productId, setProductId] = useState<string>();
  const [creatorId, setCreatorId] = useState<string>();
  const [couponId, setCouponId] = useState<string>();
  async function save() {
    if (!name.trim()) { Alert.alert('Name the campaign', 'Give it a name you will recognise in reports.'); return; }
    try {
      await create.mutateAsync({ shopId: shop.id, data: { name: name.trim(), ...(productId ? { productId } : {}), ...(creatorId ? { creatorId } : {}), ...(couponId ? { couponId } : {}) } });
      setOpen(false); setName(''); setProductId(undefined); setCreatorId(undefined); setCouponId(undefined); await invalidate();
    } catch (e) { Alert.alert("Couldn't create campaign", errText(e)); }
  }
  const creators = (team.data ?? []).filter(m => m.role === 'creator');
  return <View>
    <Notice text="Campaign links attribute clicks, carts and orders to a creator. There are no commissions or payouts in VastMind; settle any arrangement with creators directly." />
    {canCreate ? <><Btn icon={open ? 'x' : 'plus'} variant={open ? 'ghost' : 'primary'} label={open ? 'Close' : 'New campaign link'} onPress={() => setOpen(o => !o)} /><View style={{ height: 12 }} /></> : null}
    {open ? <Card>
      <Field label="Campaign name" value={name} onChangeText={setName} maxLength={150} />
      <Picker label="Product (optional)" value={productId} onChange={setProductId} options={(products.data?.items ?? []).map(p => [p.id, p.title])} />
      {isCreator ? <Text style={{ color: c.mutedForeground, fontSize: 12, marginBottom: 10 }}>This link is attributed to you. No commission or payout is paid through VastMind.</Text> : <>
        <Picker label="Creator (optional)" value={creatorId} onChange={setCreatorId} options={creators.map(m => [m.userId, m.name])} empty="Approve creators in Team first" />
        <Picker label="Coupon (optional)" value={couponId} onChange={setCouponId} options={(coupons.data ?? []).filter(x => x.active).map(x => [x.id, x.code])} />
      </>}
      <Btn icon="link" label="Create link" busy={create.isPending} onPress={() => void save()} />
    </Card> : null}
    {list.isLoading ? <Skeleton rows={2} /> : null}
    {list.isError ? <ErrorRetry message={errText(list.error)} onRetry={() => void list.refetch()} /> : null}
    {list.data && !list.data.length ? <Empty icon="link" title="No campaign links" body="Create a link for a creator or a launch, then share it anywhere." /> : null}
    {list.data?.map(cp => <Card key={cp.id} accent={cp.active ? c.gold : c.border}>
      <View style={s.between}><Text style={{ color: c.foreground, fontWeight: '800', flex: 1 }}>{cp.name}</Text>{cp.active ? <Tag label="Live" tone="cyan" /> : <Tag label="Paused" />}</View>
      <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 3 }}>{cp.creatorName ? `Creator ${cp.creatorName}` : 'Shop link'}{cp.couponCode ? ` · code ${cp.couponCode}` : ''}</Text>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
        {([['Clicks', cp.clicks], ['Carts', cp.carts], ['Orders', cp.orders]] as const).map(([k, v]) => <View key={k}><Text style={{ color: c.foreground, fontWeight: '900', fontSize: 18 }}>{v ?? 0}</Text><Text style={{ color: c.mutedForeground, fontSize: 11 }}>{k}</Text></View>)}
      </View>
      <Text selectable numberOfLines={1} style={{ color: c.primary, fontSize: 12, marginTop: 8 }}>{cp.linkPath}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Btn small flex variant="soft" icon="share-2" label="Share link" onPress={() => void Share.share({ message: `${cp.name}: ${campaignUrl(cp)}` }).catch(() => {})} />
        {canCreate ? <Btn small flex variant="ghost" label={cp.active ? 'Pause' : 'Resume'} busy={toggle.isPending && toggle.variables?.campaignId === cp.id}
          onPress={() => void toggle.mutateAsync({ campaignId: cp.id, data: { active: !cp.active } }).then(() => invalidate()).catch(e => Alert.alert("Couldn't update", errText(e)))} /> : null}
      </View>
    </Card>)}
  </View>;
}

function Picker({ label, value, onChange, options, empty }: { label: string; value?: string; onChange: (v?: string) => void; options: [string, string][]; empty?: string }) {
  const c = useColors();
  return <View style={{ marginBottom: 12 }}>
    <Kicker color={c.mutedForeground}>{label}</Kicker>
    {options.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 6 }}>
      <Chip label="None" active={!value} onPress={() => onChange(undefined)} />
      {options.map(([id, l]) => <Chip key={id} label={l} active={value === id} onPress={() => onChange(id)} />)}
    </ScrollView> : <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 4 }}>{empty ?? 'Nothing available yet'}</Text>}
  </View>;
}
