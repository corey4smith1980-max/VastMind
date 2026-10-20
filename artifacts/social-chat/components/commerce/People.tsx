import React, { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  getSearchUsersQueryKey, useCommerceListCustomers, useCommerceListTeam, useCommerceUpdateCustomer, useCommerceUpdateTeam, useSearchUsers,
  type CommerceCustomer, type CommerceShop, type CommerceTeamInputRole,
} from '@workspace/api-client-react';
import { Avatar } from '@/components/common';
import { initials } from '@/state/AppStore';
import { useColors } from '@/hooks/useColors';
import { useContactSeller } from './ProductSheet';
import { Btn, Card, Chip, Empty, ErrorRetry, Field, Kicker, Notice, Pager, Skeleton, Tag, errText, s, useCursor, useInvalidateCommerce } from './kit';

const ROLES: readonly [CommerceTeamInputRole, string, string][] = [
  ['manager', 'Manager', 'Catalog, orders, marketing, customers'],
  ['fulfillment', 'Fulfillment', 'Orders and tracking'],
  ['marketer', 'Marketer', 'Coupons, campaigns, dashboard'],
  ['creator', 'Creator', 'Tag products in own posts, campaign links'],
];

export function Team({ shop }: { shop: CommerceShop }) {
  const c = useColors();
  const team = useCommerceListTeam(shop.id);
  const update = useCommerceUpdateTeam();
  const invalidate = useInvalidateCommerce();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<CommerceTeamInputRole>('manager');
  const term = q.trim();
  const search = useSearchUsers({ q: term }, { query: { enabled: term.length >= 2, queryKey: getSearchUsersQueryKey({ q: term }) } });
  const owner = shop.role === 'owner';
  async function change(userId: string, r: CommerceTeamInputRole, approved: boolean) {
    try { await update.mutateAsync({ shopId: shop.id, data: { userId, role: r, approved } }); await invalidate(); if (approved) setQ(''); }
    catch (e) { Alert.alert("Couldn't update team", errText(e)); }
  }
  return <View>
    {!owner ? <Notice text="Only the shop owner can change the team." /> : null}
    {team.isLoading ? <Skeleton rows={2} /> : null}
    {team.isError ? <ErrorRetry message={errText(team.error)} onRetry={() => void team.refetch()} /> : null}
    {team.data?.map(m => <Card key={m.userId}>
      <View style={s.row}>
        <Avatar initials={initials(m.name)} size={40} tone={m.role === 'owner' ? 'forest' : m.role === 'creator' ? 'coral' : 'blue'} />
        <View style={{ flex: 1 }}><Text style={{ color: c.foreground, fontWeight: '700' }}>{m.name}</Text><Text style={{ color: c.mutedForeground, fontSize: 12 }}>@{m.username}</Text></View>
        <Tag label={m.role} tone={m.role === 'owner' ? 'cyan' : 'violet'} />
      </View>
      {owner && m.role !== 'owner' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {ROLES.map(([r, l]) => <Chip key={r} label={l} active={m.role === r} onPress={() => m.role !== r && void change(m.userId, r, true)} />)}
        <Btn small variant="danger" icon="user-minus" label="Remove" onPress={() => Alert.alert(`Remove ${m.name}?`, 'They lose access to this shop immediately.', [{ text: 'Keep', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void change(m.userId, m.role as CommerceTeamInputRole, false) }])} />
      </View> : null}
    </Card>)}
    {owner ? <Card>
      <Kicker>Add a teammate</Kicker>
      <View style={{ gap: 6, marginVertical: 10 }}>
        {ROLES.map(([r, l, d]) => <Pressable key={r} accessibilityRole="radio" accessibilityState={{ checked: role === r }} onPress={() => setRole(r)} style={[s.row, { padding: 8, borderRadius: 12, backgroundColor: role === r ? c.secondary : 'transparent' }]}>
          <Feather name={role === r ? 'disc' : 'circle'} size={16} color={role === r ? c.primary : c.mutedForeground} />
          <View style={{ flex: 1 }}><Text style={{ color: c.foreground, fontWeight: '700' }}>{l}</Text><Text style={{ color: c.mutedForeground, fontSize: 11 }}>{d}</Text></View>
        </Pressable>)}
      </View>
      <TextInput accessibilityLabel="Search people" value={q} onChangeText={setQ} placeholder="Search by name or username" placeholderTextColor={c.mutedForeground} style={[s.input, { color: c.foreground, borderColor: c.border }]} />
      {search.isFetching ? <Skeleton rows={1} /> : null}
      {term.length >= 2 && search.data && !search.data.length ? <Text style={{ color: c.mutedForeground, marginTop: 8 }}>No one found.</Text> : null}
      {search.data?.slice(0, 8).map(u => <View key={u.id} style={[s.between, { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }]}>
        <View style={{ flex: 1 }}><Text style={{ color: c.foreground, fontWeight: '700' }}>{u.name}</Text><Text style={{ color: c.mutedForeground, fontSize: 12 }}>@{u.username}</Text></View>
        <Btn small icon="user-plus" label="Add" busy={update.isPending && update.variables?.data.userId === u.id} onPress={() => void change(u.id, role, true)} />
      </View>)}
    </Card> : null}
  </View>;
}

export function Customers({ shop }: { shop: CommerceShop }) {
  const cur = useCursor();
  const list = useCommerceListCustomers(shop.id, cur.cursor ? { cursor: cur.cursor } : undefined);
  return <View>
    <Notice text="Notes and labels are private to your team. Marketing consent is set only by each buyer when they follow your shop." />
    {list.isLoading ? <Skeleton rows={3} /> : null}
    {list.isError ? <ErrorRetry message={errText(list.error)} onRetry={() => void list.refetch()} /> : null}
    {list.data && !list.data.items.length ? <Empty icon="users" title="No customers yet" body="Buyers appear here after their first order." /> : null}
    {list.data?.items.map(cu => <CustomerCard key={cu.userId} shop={shop} customer={cu} />)}
    <Pager hasPrev={cur.hasPrev} next={list.data?.nextCursor} onPrev={cur.prev} onNext={() => cur.next(list.data?.nextCursor)} />
  </View>;
}

function CustomerCard({ shop, customer: cu }: { shop: CommerceShop; customer: CommerceCustomer }) {
  const c = useColors();
  const update = useCommerceUpdateCustomer();
  const invalidate = useInvalidateCommerce();
  const contact = useContactSeller();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(cu.notes);
  const [labels, setLabels] = useState<string[]>(cu.labels);
  const [label, setLabel] = useState('');
  async function save() {
    try { await update.mutateAsync({ shopId: shop.id, userId: cu.userId, data: { notes: notes.trim(), labels } }); await invalidate(); setOpen(false); }
    catch (e) { Alert.alert("Couldn't save", errText(e)); }
  }
  function addLabel() {
    const l = label.trim().slice(0, 50);
    if (!l || labels.includes(l)) return;
    if (labels.length >= 10) { Alert.alert('Label limit', 'Up to 10 labels per customer.'); return; }
    setLabels([...labels, l]); setLabel('');
  }
  return <Card>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(o => !o)} style={s.row}>
      <Avatar initials={initials(cu.name)} size={40} tone="gold" />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.foreground, fontWeight: '700' }}>{cu.name}</Text>
        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>@{cu.username} · {cu.orderCount} order{cu.orderCount === 1 ? '' : 's'}</Text>
      </View>
      <Tag label={cu.marketingOptIn ? 'Offers on' : 'No marketing'} tone={cu.marketingOptIn ? 'cyan' : 'muted'} />
    </Pressable>
    {cu.labels.length && !open ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>{cu.labels.map(l => <Tag key={l} label={l} tone="violet" />)}</View> : null}
    {open ? <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {labels.map(l => <Pressable key={l} accessibilityLabel={`Remove label ${l}`} onPress={() => setLabels(labels.filter(x => x !== l))} style={[s.chip, { borderColor: c.gold }]}><Text style={{ color: c.foreground, fontSize: 12, fontWeight: '700' }}>{l}</Text><Feather name="x" size={11} color={c.foreground} /></Pressable>)}
      </View>
      <View style={[s.row, { alignItems: 'flex-end' }]}>
        <Field label="Add label" style={{ flex: 1 }} value={label} onChangeText={setLabel} maxLength={50} onSubmitEditing={addLabel} placeholder="VIP, wholesale" />
        <View style={{ marginBottom: 12 }}><Btn small variant="soft" icon="plus" a11y="Add label" onPress={addLabel} /></View>
      </View>
      <Field label="Private notes" value={notes} onChangeText={setNotes} maxLength={5000} multiline />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn flex variant="ghost" icon="message-circle" label="Message" busy={contact.busy} onPress={() => void contact.open(cu.userId)} />
        <Btn flex icon="check" label="Save" busy={update.isPending} onPress={() => void save()} />
      </View>
    </View> : null}
  </Card>;
}
