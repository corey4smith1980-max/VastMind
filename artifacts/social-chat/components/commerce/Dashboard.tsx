import React, { useMemo, useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import { useCommerceGetDashboard, type CommerceDashboard, type CommerceShop } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { Btn, Card, Chip, Empty, ErrorRetry, Field, Kicker, Notice, Skeleton, errText, money, s } from './kit';

/** UTC calendar day, YYYY-MM-DD (backend treats from/to as inclusive UTC days). */
const day = (d: Date) => d.toISOString().slice(0, 10);
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const PRESETS = [[7, '7 days'], [30, '30 days'], [90, '90 days']] as const;

function toCsv(shop: CommerceShop, d: CommerceDashboard) {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows: (string | number)[][] = [
    ['VastMind shop report', shop.name], ['From', d.from], ['To', d.to], [],
    ['Metric', 'Value'], ['Views', d.views], ['Product clicks', d.clicks], ['Add to cart', d.carts], ['Orders', d.conversions],
    ['Pending orders', d.pendingOrders], ['Followers', d.followerCount], ['Products', d.productCount], ['Low stock', d.lowStockCount], [],
    ['Currency', 'Gross order value', 'Completed value', 'Manually confirmed paid', 'Processor paid', 'Orders'],
    ...d.currencies.map(c => [c.currency, money(c.grossOrderValueMinor, c.currency), money(c.completedValueMinor, c.currency), money(c.manualConfirmedValueMinor, c.currency), money(c.processorPaidValueMinor, c.currency), c.orderCount]),
    [], ['Product', 'Units', 'Order value'], ...d.topProducts.map(p => [p.title, p.units, money(p.orderValueMinor, p.currency)]),
    [], ['Campaign', 'Clicks', 'Carts', 'Orders'], ...d.campaigns.map(c => [c.name, c.clicks ?? '', c.carts ?? '', c.orders ?? '']),
  ];
  return rows.map(r => r.map(q).join(',')).join('\n');
}

export function Dashboard({ shop }: { shop: CommerceShop }) {
  const c = useColors();
  const [preset, setPreset] = useState<number | 'custom'>(30);
  const [from, setFrom] = useState(day(new Date(Date.now() - 29 * 864e5)));
  const [to, setTo] = useState(day(new Date()));
  const range = useMemo(() => {
    if (preset === 'custom') return { from, to };
    return { from: day(new Date(Date.now() - (preset - 1) * 864e5)), to: day(new Date()) };
  }, [preset, from, to]);
  const validCustom = preset !== 'custom' || (isDay(from) && isDay(to) && from <= to);
  const dash = useCommerceGetDashboard(shop.id, validCustom ? range : undefined);
  const d = dash.data;
  const funnel = d ? [['Views', d.views], ['Clicks', d.clicks], ['Carts', d.carts], ['Orders', d.conversions]] as const : [];
  const top = Math.max(1, ...funnel.map(f => f[1]));
  return <View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
      {PRESETS.map(([n, l]) => <Chip key={n} label={l} active={preset === n} onPress={() => setPreset(n)} />)}
      <Chip label="Custom" icon="calendar" active={preset === 'custom'} onPress={() => setPreset('custom')} />
    </View>
    {preset === 'custom' ? <View style={{ flexDirection: 'row', gap: 8 }}>
      <Field label="From" style={{ flex: 1 }} value={from} onChangeText={setFrom} maxLength={10} placeholder="YYYY-MM-DD" />
      <Field label="To" style={{ flex: 1 }} value={to} onChangeText={setTo} maxLength={10} placeholder="YYYY-MM-DD" />
    </View> : null}
    {!validCustom ? <Notice tone="warn" text="Use YYYY-MM-DD dates with From on or before To." /> : null}
    {dash.isLoading ? <Skeleton rows={3} /> : null}
    {dash.isError ? <ErrorRetry message={errText(dash.error)} onRetry={() => void dash.refetch()} /> : null}
    {d ? <>
      <Text style={{ color: c.mutedForeground, fontSize: 12, marginBottom: 10 }}>{d.from.slice(0, 10)} to {d.to.slice(0, 10)} (UTC) · first-party VastMind activity only</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {([['Pending', d.pendingOrders, c.coral], ['Followers', d.followerCount, c.lime], ['Products', d.productCount, c.blue], ['Low stock', d.lowStockCount, c.destructive]] as const).map(([k, v, tint]) =>
          <View key={k} style={{ width: '48.5%', borderRadius: 18, padding: 14, backgroundColor: c.forest }}>
            <Text style={{ color: tint, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>{k}</Text>
            <Text style={{ color: c.cream, fontSize: 26, fontWeight: '900', marginTop: 4 }}>{v}</Text>
          </View>)}
      </View>
      <Card>
        <Kicker>Funnel</Kicker>
        {funnel.map(([k, v], i) => <View key={k} style={{ marginTop: 10 }}>
          <View style={s.between}><Text style={{ color: c.foreground, fontWeight: '600' }}>{k}</Text><Text style={{ color: c.foreground, fontWeight: '800' }}>{v}{i > 0 && funnel[i - 1][1] ? `  ·  ${((v / funnel[i - 1][1]) * 100).toFixed(1)}%` : ''}</Text></View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: c.muted, marginTop: 5, overflow: 'hidden' }}><View style={{ height: 8, width: `${(v / top) * 100}%`, backgroundColor: [c.blue, c.lime, c.gold, c.coral][i], borderRadius: 4 }} /></View>
        </View>)}
      </Card>
      <Text style={{ color: c.forest, fontSize: 17, fontWeight: '800', marginVertical: 8 }}>Order value by currency</Text>
      {!d.currencies.length ? <Empty icon="bar-chart-2" title="No orders in this range" /> : d.currencies.map(cu => <Card key={cu.currency} accent={c.primary}>
        <View style={s.between}><Kicker>{cu.currency}</Kicker><Text style={{ color: c.mutedForeground, fontSize: 12 }}>{cu.orderCount} orders</Text></View>
        <Text style={{ color: c.foreground, fontSize: 24, fontWeight: '900', marginTop: 4 }}>{money(cu.grossOrderValueMinor, cu.currency)}</Text>
        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>gross order value</Text>
        <View style={[s.between, { marginTop: 8 }]}><Text style={{ color: c.mutedForeground, fontSize: 12 }}>Completed</Text><Text style={{ color: c.foreground }}>{money(cu.completedValueMinor, cu.currency)}</Text></View>
        <View style={s.between}><Text style={{ color: c.mutedForeground, fontSize: 12 }}>Recorded as paid manually</Text><Text style={{ color: c.foreground }}>{money(cu.manualConfirmedValueMinor, cu.currency)}</Text></View>
        {cu.processorPaidValueMinor ? <View style={s.between}><Text style={{ color: c.mutedForeground, fontSize: 12 }}>Processor paid</Text><Text style={{ color: c.foreground }}>{money(cu.processorPaidValueMinor, cu.currency)}</Text></View> : null}
      </Card>)}
      {d.currencies.length > 1 ? <Text style={{ color: c.mutedForeground, fontSize: 11, marginBottom: 8 }}>Currencies are reported separately and never converted or summed.</Text> : null}
      <Text style={{ color: c.forest, fontSize: 17, fontWeight: '800', marginVertical: 8 }}>Top products</Text>
      {!d.topProducts.length ? <Text style={{ color: c.mutedForeground, marginBottom: 8 }}>No product sales yet in this range.</Text> : d.topProducts.map((p, i) => <View key={p.productId + p.currency} style={[s.between, { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }]}>
        <Text style={{ color: c.gold, fontWeight: '900', width: 22 }}>{i + 1}</Text>
        <Text style={{ color: c.foreground, flex: 1 }} numberOfLines={1}>{p.title}</Text>
        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{p.units} units</Text>
        <Text style={{ color: c.foreground, fontWeight: '700' }}>{money(p.orderValueMinor, p.currency)}</Text>
      </View>)}
      {d.campaigns.length ? <><Text style={{ color: c.forest, fontSize: 17, fontWeight: '800', marginVertical: 8 }}>Campaigns</Text>
        {d.campaigns.map(cp => <View key={cp.id} style={[s.between, { paddingVertical: 6 }]}><Text style={{ color: c.foreground, flex: 1 }} numberOfLines={1}>{cp.name}</Text><Text style={{ color: c.mutedForeground, fontSize: 12 }}>{cp.clicks ?? 0} clicks · {cp.carts ?? 0} carts · {cp.orders ?? 0} orders</Text></View>)}</> : null}
      <View style={{ marginTop: 14 }}>
        <Btn variant="soft" icon="share" label="Share CSV report" onPress={() => void Share.share({ title: `${shop.name} report`, message: toCsv(shop, d) }).catch(e => Alert.alert("Couldn't share", errText(e)))} />
      </View>
    </> : null}
  </View>;
}
