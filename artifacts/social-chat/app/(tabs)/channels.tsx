import React, { useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, AppHeader, Eyebrow, PageFrame, StorageNotice } from '@/components/common';
import { useColors } from '@/hooks/useColors';
import { useAppStore } from '@/state/AppStore';

type ChannelFilter = 'All' | 'Following' | 'Yours';

export default function ChannelsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { state, rawChannels, profile, toggleChannelFollow } = useAppStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ChannelFilter>('All');
  const channels = useMemo(() => state.channels.filter((channel) =>
    `${channel.name} ${channel.category} ${channel.description}`.toLowerCase().includes(query.toLowerCase())
    && (filter === 'All' || (filter === 'Following' ? channel.followed : rawChannels.find((item) => item.id === channel.id)?.owner.id === profile?.id))),
  [filter, profile?.id, query, rawChannels, state.channels]);

  return (
    <PageFrame>
      <AppHeader label="channels" />
      <StorageNotice />
      <View style={styles.titleRow}>
        <View><Eyebrow>CHANNEL UPDATES</Eyebrow><Text style={[styles.title, { color: colors.forest }]}>Channels</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Create a channel" onPress={() => router.push('/new-channel')} style={styles.createButton}><Feather name="plus" size={23} color={colors.primary} /></Pressable>
      </View>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Follow shops, clubs and organisers. Open any channel for its full update thread.</Text>
      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={17} color={colors.mutedForeground} />
        <TextInput accessibilityLabel="Search channels" placeholder="Search channels" placeholderTextColor={colors.mutedForeground} value={query} onChangeText={setQuery} style={[styles.searchInput, { color: colors.foreground }]} />
      </View>
      <View style={styles.filters}>
        {(['All', 'Following', 'Yours'] as ChannelFilter[]).map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: filter === item }} onPress={() => setFilter(item)} style={[styles.filter, { backgroundColor: filter === item ? colors.primary : colors.secondary }]}><Text style={[styles.filterText, { color: filter === item ? colors.primaryForeground : colors.mutedForeground }]}>{item}</Text></Pressable>)}
      </View>
      <View style={styles.channelList}>
        {channels.map((channel) => {
          const latest = channel.updates[0];
          const owned = rawChannels.find((item) => item.id === channel.id)?.owner.id === profile?.id;
          return (
            <Pressable key={channel.id} accessibilityRole="button" accessibilityLabel={`Open ${channel.name}`} onPress={() => router.push(`/channel/${channel.id}`)} style={[styles.channelRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <Avatar initials={channel.initials} size={50} tone={channel.color} />
              <View style={styles.channelMeta}>
                <View style={styles.nameRow}><Text numberOfLines={1} style={[styles.channelName, { color: colors.foreground }]}>{channel.name}{owned ? ' · Yours' : ''}</Text><Text style={[styles.updateTime, { color: colors.mutedForeground }]}>{latest?.time ?? ''}</Text></View>
                <Text numberOfLines={1} style={[styles.updateText, { color: colors.mutedForeground }]}>{latest?.text ?? channel.description}</Text>
                <Text style={[styles.channelCategory, { color: colors.mutedForeground }]}>{channel.category} · {channel.followers} followers</Text>
              </View>
              {owned ? <Pressable accessibilityRole="button" accessibilityLabel={`Open ${channel.name} controls`} onPress={(event) => { event.stopPropagation(); router.push(`/channel/${channel.id}`); }} style={styles.rowAction}><Feather name="chevron-right" size={19} color={colors.mutedForeground} /></Pressable>
                : <Pressable accessibilityRole="button" accessibilityState={{ selected: channel.followed }} accessibilityLabel={channel.followed ? `Unfollow ${channel.name}` : `Follow ${channel.name}`} onPress={(event) => { event.stopPropagation(); void toggleChannelFollow(channel.id); }} style={[styles.rowAction, { borderColor: channel.followed ? colors.border : colors.primary }]}><Feather name={channel.followed ? 'check' : 'plus'} size={17} color={channel.followed ? colors.mutedForeground : colors.primary} /></Pressable>}
            </Pressable>
          );
        })}
        {channels.length === 0 ? <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="radio" size={22} color={colors.mutedForeground} /><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{query || filter !== 'All' ? 'No channels match this view.' : 'No channels yet.'}</Text></View> : null}
      </View>
    </PageFrame>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.8, marginTop: 4 },
  createButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  subtitle: { fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 15, maxWidth: 310 },
  searchBox: { height: 46, borderRadius: 15, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, fontSize: 13 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 8 },
  filter: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  filterText: { fontSize: 11, fontWeight: '700' },
  channelList: { paddingBottom: 16 },
  channelRow: { minHeight: 74, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  channelMeta: { flex: 1, minWidth: 0, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  channelName: { flex: 1, fontSize: 13, fontWeight: '700' },
  channelCategory: { fontSize: 10 },
  updateText: { fontSize: 11, lineHeight: 15 },
  updateTime: { fontSize: 9, flexShrink: 0 },
  rowAction: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { borderRadius: 16, borderWidth: 1, marginTop: 8, padding: 20, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 12 },
});
