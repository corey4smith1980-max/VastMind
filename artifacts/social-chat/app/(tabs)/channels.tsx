import React, { useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, AppHeader, Eyebrow, PageFrame, StorageNotice } from '@/components/common';
import { useColors } from '@/hooks/useColors';
import { useAppStore } from '@/state/AppStore';

export default function ChannelsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { state, toggleChannelFollow } = useAppStore();
  const [query, setQuery] = useState('');
  const channels = useMemo(() => state.channels.filter((channel) => `${channel.name} ${channel.category}`.toLowerCase().includes(query.toLowerCase())), [query, state.channels]);
  const following = state.channels.filter((channel) => channel.followed);

  return (
    <PageFrame>
      <AppHeader label="communities" />
      <StorageNotice />
      <Eyebrow>PUBLIC CHANNELS</Eyebrow>
      <Text style={[styles.title, { color: colors.forest }]}>Find your people.</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Follow the conversations and communities you care about.</Text>
      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={17} color={colors.mutedForeground} />
        <TextInput accessibilityLabel="Search channels" placeholder="Search channels" placeholderTextColor={colors.mutedForeground} value={query} onChangeText={setQuery} style={[styles.searchInput, { color: colors.foreground }]} />
      </View>
      <View style={[styles.followingCard, { backgroundColor: colors.forest }]}>
        <View style={styles.followingTop}><View><Text style={[styles.followingTitle, { color: colors.primaryForeground }]}>Your channels</Text><Text style={[styles.followingSub, { color: colors.primaryForeground }]}>{following.length} communities in your orbit</Text></View><Feather name="radio" size={22} color={colors.lime} /></View>
        <View style={styles.followingAvatars}>{following.slice(0, 4).map((channel) => <Avatar key={channel.id} initials={channel.initials} size={32} tone={channel.color} />)}<Text style={[styles.followingCaption, { color: colors.primaryForeground }]}>Latest updates are ready</Text></View>
      </View>
      <View style={styles.listHeader}><Eyebrow>EXPLORE CHANNELS</Eyebrow><Text style={[styles.sortText, { color: colors.mutedForeground }]}>Recommended</Text></View>
      <View style={styles.channelList}>
        {channels.map((channel) => {
          const latest = channel.updates[0];
          return (
            <Pressable key={channel.id} onPress={() => router.push(`/channel/${channel.id}`)} style={[styles.channelCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.channelTop}><Avatar initials={channel.initials} size={48} tone={channel.color} /><View style={styles.channelMeta}><Text style={[styles.channelName, { color: colors.forest }]}>{channel.name}</Text><Text style={[styles.channelCategory, { color: colors.mutedForeground }]}>{channel.category} · {channel.followers} members</Text></View><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></View>
              <Text numberOfLines={2} style={[styles.description, { color: colors.mutedForeground }]}>{channel.description}</Text>
              <View style={[styles.updatePreview, { backgroundColor: colors.secondary }]}><Text numberOfLines={2} style={[styles.updateText, { color: colors.foreground }]}>{latest.text}</Text></View>
              <View style={styles.channelFooter}><Text style={[styles.updateTime, { color: colors.mutedForeground }]}>{latest.time}</Text><Pressable onPress={(event) => { event.stopPropagation(); toggleChannelFollow(channel.id); }} style={[styles.followButton, { backgroundColor: channel.followed ? colors.secondary : colors.lime }]}><Text style={[styles.followText, { color: colors.forest }]}>{channel.followed ? 'Following' : 'Follow'}</Text></Pressable></View>
            </Pressable>
          );
        })}
        {channels.length === 0 ? <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="compass" size={22} color={colors.mutedForeground} /><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No channels match that search.</Text></View> : null}
      </View>
    </PageFrame>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 29, fontWeight: '700', letterSpacing: -1, marginTop: 8 },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 17, maxWidth: 290 },
  searchBox: { height: 47, borderRadius: 15, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, fontSize: 13 },
  followingCard: { borderRadius: 20, padding: 16, marginTop: 15, marginBottom: 23 },
  followingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  followingTitle: { fontSize: 15, fontWeight: '700' },
  followingSub: { fontSize: 11, opacity: 0.75, marginTop: 4 },
  followingAvatars: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18 },
  followingCaption: { fontSize: 11, marginLeft: 3, opacity: 0.8 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sortText: { fontSize: 11, fontWeight: '600' },
  channelList: { gap: 11 },
  channelCard: { borderRadius: 18, borderWidth: 1, padding: 13 },
  channelTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  channelMeta: { flex: 1, gap: 4 },
  channelName: { fontSize: 14, fontWeight: '700' },
  channelCategory: { fontSize: 10 },
  description: { fontSize: 11, lineHeight: 16, marginTop: 11 },
  updatePreview: { padding: 10, borderRadius: 12, marginTop: 10 },
  updateText: { fontSize: 11, lineHeight: 16 },
  channelFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  updateTime: { fontSize: 10 },
  followButton: { borderRadius: 11, paddingVertical: 7, paddingHorizontal: 12 },
  followText: { fontSize: 11, fontWeight: '700' },
  emptyState: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 12 },
});
