import React from 'react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { AppHeader, Avatar, Eyebrow, PageFrame, SectionTitle, StorageNotice } from '@/components/common';
import { useColors } from '@/hooks/useColors';
import { useAppStore } from '@/state/AppStore';

const quickReplies = [
  { icon: 'clock' as const, label: 'Hours & location', message: 'We are open today from 10am to 6pm. Come by anytime!' },
  { icon: 'package' as const, label: 'Order update', message: 'Thanks for checking in! Your order is being prepared. I will send tracking details as soon as it is on the way.' },
  { icon: 'heart' as const, label: 'Thank you', message: 'Thank you so much for supporting our small business. We really appreciate you!' },
];

export default function BusinessScreen() {
  const colors = useColors();
  const router = useRouter();
  const { state, toggleBusinessOpen, sendMessage } = useAppStore();
  const customers = state.conversations.filter((conversation) => conversation.category === 'customer');

  return (
    <PageFrame>
      <AppHeader label="business" />
      <StorageNotice />
      <View style={[styles.profileCard, { backgroundColor: colors.forest }]}>
        <View style={styles.profileTop}>
          <View style={[styles.shopAvatar, { backgroundColor: colors.lime }]}><Feather name="sun" size={23} color={colors.forest} /></View>
          <View style={styles.profileText}><Text style={[styles.shopName, { color: colors.primaryForeground }]}>Luma Studio</Text><Text style={[styles.shopMeta, { color: colors.primaryForeground }]}>Ceramics · Lagos</Text></View>
          <Feather name="more-horizontal" size={21} color={colors.primaryForeground} />
        </View>
        <Text style={[styles.profileDescription, { color: colors.primaryForeground }]}>Small-batch pieces for slow, everyday rituals.</Text>
        <View style={[styles.profileDivider, { backgroundColor: colors.secondaryForeground }]} />
        <View style={styles.statusRow}>
          <View style={styles.statusCopy}><View style={[styles.statusDot, { backgroundColor: state.businessOpen ? colors.lime : colors.coral }]} /><Text style={[styles.statusText, { color: colors.primaryForeground }]}>{state.businessOpen ? 'Open for messages' : 'Away for now'}</Text></View>
          <Switch testID="business-open-switch" value={state.businessOpen} onValueChange={toggleBusinessOpen} trackColor={{ false: colors.secondaryForeground, true: colors.lime }} thumbColor={colors.primaryForeground} />
        </View>
      </View>

      <View style={styles.metricRow}>
        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.metricNumber, { color: colors.forest }]}>12</Text><Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>New today</Text><Text style={[styles.metricDelta, { color: colors.forest }]}>+4 this week</Text></View>
        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.metricNumber, { color: colors.forest }]}>98<Text style={styles.percent}>%</Text></Text><Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Response rate</Text><Text style={[styles.metricDelta, { color: colors.forest }]}>Usually replies fast</Text></View>
      </View>

      <SectionTitle title="Quick replies" action="Open inbox" onAction={() => router.push('/chats')} />
      <Text style={[styles.helper, { color: colors.mutedForeground }]}>Send a helpful reply in one tap.</Text>
      <View style={styles.quickList}>
        {quickReplies.map((reply) => (
          <Pressable key={reply.label} onPress={() => { sendMessage('luma-orders', reply.message); router.push('/chat/luma-orders'); }} style={[styles.quickReply, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.quickIcon, { backgroundColor: colors.secondary }]}><Feather name={reply.icon} size={16} color={colors.forest} /></View>
            <Text style={[styles.quickLabel, { color: colors.forest }]}>{reply.label}</Text>
            <Feather name="arrow-up-right" size={16} color={colors.mutedForeground} />
          </Pressable>
        ))}
      </View>

      <View style={styles.customerHeading}><Eyebrow>ACTIVE CUSTOMERS</Eyebrow><Pressable onPress={() => router.push('/chats')}><Text style={[styles.viewAll, { color: colors.forest }]}>View inbox</Text></Pressable></View>
      {customers.map((customer) => (
        <Pressable key={customer.id} onPress={() => router.push(`/chat/${customer.id}`)} style={[styles.customerRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Avatar initials={customer.initials} size={42} tone="lime" online={customer.online} />
          <View style={styles.customerInfo}><Text style={[styles.customerName, { color: colors.forest }]}>{customer.name}</Text><Text numberOfLines={1} style={[styles.customerMessage, { color: colors.mutedForeground }]}>{customer.lastMessage}</Text></View>
          {customer.unread > 0 ? <View style={[styles.customerBadge, { backgroundColor: colors.lime }]}><Text style={[styles.customerBadgeText, { color: colors.forest }]}>{customer.unread}</Text></View> : null}
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </Pressable>
      ))}
    </PageFrame>
  );
}

const styles = StyleSheet.create({
  profileCard: { borderRadius: 22, padding: 18, marginBottom: 14 },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shopAvatar: { width: 46, height: 46, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  profileText: { flex: 1, gap: 4 },
  shopName: { fontSize: 17, fontWeight: '700' },
  shopMeta: { fontSize: 11, opacity: 0.75 },
  profileDescription: { marginTop: 16, fontSize: 13, lineHeight: 19, opacity: 0.9 },
  profileDivider: { height: StyleSheet.hairlineWidth, opacity: 0.4, marginVertical: 15 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusCopy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { height: 8, width: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  metricRow: { flexDirection: 'row', gap: 10, marginBottom: 25 },
  metricCard: { flex: 1, borderRadius: 17, borderWidth: 1, padding: 14 },
  metricNumber: { fontSize: 25, fontWeight: '700', letterSpacing: -1 },
  percent: { fontSize: 16 },
  metricLabel: { fontSize: 11, marginTop: 5 },
  metricDelta: { fontSize: 10, marginTop: 9, fontWeight: '600' },
  helper: { fontSize: 12, marginTop: -8, marginBottom: 12 },
  quickList: { gap: 8, marginBottom: 26 },
  quickReply: { minHeight: 56, borderRadius: 15, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, gap: 11 },
  quickIcon: { width: 33, height: 33, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  customerHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 },
  viewAll: { fontSize: 12, fontWeight: '700' },
  customerRow: { minHeight: 66, borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  customerInfo: { flex: 1, gap: 4 },
  customerName: { fontSize: 13, fontWeight: '700' },
  customerMessage: { fontSize: 11 },
  customerBadge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  customerBadgeText: { fontSize: 10, fontWeight: '800' },
});
