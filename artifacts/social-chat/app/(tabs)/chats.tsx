import React, { useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, AppHeader, Eyebrow, PageFrame, StorageNotice } from '@/components/common';
import { useColors } from '@/hooks/useColors';
import { initials, useAppStore } from '@/state/AppStore';
import { StatusRing, useActiveStatuses } from '@/components/StatusRing';

type Filter = 'All' | 'Unread' | 'Groups';

export default function ChatsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, profile } = useAppStore();
  const { active: activeStatuses } = useActiveStatuses();
  const mutualStatuses = useMemo(() => {
    const byAuthor = new Map<string, typeof activeStatuses>();
    for (const status of activeStatuses) {
      if (status.author.id === profile?.id) continue;
      byAuthor.set(status.author.id, [...(byAuthor.get(status.author.id) ?? []), status]);
    }
    return Array.from(byAuthor.values())
      .map((items) => items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      .sort((a, b) => new Date(b[0].createdAt).getTime() - new Date(a[0].createdAt).getTime());
  }, [activeStatuses, profile?.id]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const chats = useMemo(() => state.conversations.filter((chat) => {
    const matchesText = `${chat.name} ${chat.lastMessage}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === 'All' || (filter === 'Unread' ? chat.unread > 0 : chat.category === 'group');
    return matchesText && matchesFilter;
  }), [filter, query, state.conversations]);
  const unreadCount = state.conversations.reduce((sum, chat) => sum + chat.unread, 0);
  const quickStatusAuthor = mutualStatuses[0]?.[0]?.author;

  return (
    <View style={{ flex: 1 }}>
      <PageFrame>
        <AppHeader label="messages" />
        <StorageNotice />
        <View style={styles.headingRow}>
          <View style={styles.headingBrand}>
            <Pressable accessibilityRole="button"
                accessibilityLabel={quickStatusAuthor ? `View ${quickStatusAuthor.name}'s status` : 'Open statuses'}
                onPress={() => quickStatusAuthor
                  ? router.push({ pathname: '/stories', params: { authorId: quickStatusAuthor.id } })
                  : router.push('/stories')}
                style={styles.quickStatusButton} data-testid="button-chat-friends-status">
                <StatusRing size={38} active={!!quickStatusAuthor} stroke={2.5}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}>
                    {quickStatusAuthor?.avatarUrl ? <Image source={{ uri: quickStatusAuthor.avatarUrl }} style={{ width: 30, height: 30 }} />
                      : quickStatusAuthor ? <Avatar initials={initials(quickStatusAuthor.name)} size={30} tone="blue" />
                        : <Feather name="aperture" size={16} color={colors.mutedForeground} />}
                  </View>
                </StatusRing>
            </Pressable>
            {mutualStatuses.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.compactStatusStrip} contentContainerStyle={styles.compactStatusContent}>
              {mutualStatuses.slice(1, 4).map((items) => {
                const author = items[0].author;
                return <Pressable key={author.id} accessibilityRole="button"
                  accessibilityLabel={`View ${author.name}'s ${items.length} active status ${items.length === 1 ? 'update' : 'updates'}`}
                  onPress={() => router.push({ pathname: '/stories', params: { authorId: author.id } })}
                  style={styles.compactStatusButton}>
                  <StatusRing size={38} active stroke={2.5}>
                    <View style={{ width: 30, height: 30, borderRadius: 15, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}>
                      {author.avatarUrl ? <Image source={{ uri: author.avatarUrl }} style={{ width: 30, height: 30 }} /> : <Avatar initials={initials(author.name)} size={30} tone="blue" />}
                    </View>
                  </StatusRing>
                </Pressable>;
              })}
            </ScrollView> : null}
            <View style={styles.headingTitle}>
              <Eyebrow>YOUR INBOX</Eyebrow>
              <Text style={[styles.heading, { color: colors.forest }]}>VastMind <Text style={[styles.headingCount, { color: colors.coral }]}>{unreadCount || '·'}</Text></Text>
            </View>
          </View>
        </View>
          <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={17} color={colors.mutedForeground} />
        <TextInput accessibilityLabel="Search chats" placeholder="Search people and messages" placeholderTextColor={colors.mutedForeground} value={query} onChangeText={setQuery} style={[styles.searchInput, { color: colors.foreground }]} />
          <Feather name="sliders" size={16} color={colors.mutedForeground} />
      </View>
      <View style={styles.filterRow}>
        {(['All', 'Unread', 'Groups'] as Filter[]).map((item) => {
          const selected = filter === item;
          return <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setFilter(item)} style={[styles.filter, { backgroundColor: selected ? colors.primary : colors.secondary }]}><Text style={[styles.filterText, { color: selected ? colors.primaryForeground : colors.mutedForeground }]}>{item}</Text></Pressable>;
        })}
      </View>
      <View style={styles.chatList}>
        {chats.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="message-square" size={22} color={colors.mutedForeground} /><Text style={[styles.emptyTitle, { color: colors.forest }]}>No conversations found</Text><Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>Try another search or switch filters.</Text></View>
        ) : chats.map((chat) => (
          <Pressable accessibilityRole="button" key={chat.id} onPress={() => router.push(`/chat/${chat.id}`)} style={[styles.chatRow, { borderBottomColor: colors.border }]}>
            <Avatar initials={chat.initials} size={52} tone={chat.category === 'customer' ? 'lime' : chat.category === 'group' ? 'gold' : chat.id === 'maya-chen' ? 'coral' : 'blue'} online={chat.online} />
            <View style={[styles.chatContent, { borderBottomColor: colors.border }]}>
              <View style={styles.chatTop}><View style={styles.nameRow}><Text style={[styles.chatName, { color: colors.foreground }]}>{chat.name}</Text>{chat.verified ? <Feather name="check-circle" size={14} color={colors.blue} /> : null}</View><Text style={[styles.chatTime, { color: chat.unread ? colors.primary : colors.mutedForeground }]}>{chat.time}</Text></View>
              <View style={styles.chatBottom}><Text numberOfLines={1} style={[styles.lastMessage, { color: colors.mutedForeground }]}>{chat.lastMessage}</Text>{chat.unread > 0 ? <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}><Text style={[styles.unreadText, { color: colors.primaryForeground }]}>{chat.unread}</Text></View> : null}</View>
            </View>
          </Pressable>
        ))}
      </View>
      <View style={[styles.encryptionNote, { backgroundColor: colors.secondary }]}><Feather name="refresh-cw" size={13} color={colors.forest} /><Text style={[styles.encryptionText, { color: colors.mutedForeground }]}>Inbox refreshes every 10 seconds.</Text></View>
      </PageFrame>
      <Pressable accessibilityRole="button" accessibilityLabel="New conversation" onPress={() => router.push('/new-chat')}
        style={[styles.floatingNewChat, { backgroundColor: colors.primary, bottom: Math.max(94, insets.bottom + 78) }]}>
        <Feather name="plus" size={22} color={colors.primaryForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  headingBrand: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  quickStatusButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  compactStatusStrip: { maxWidth: 86, flexGrow: 0, flexShrink: 0 },
  compactStatusContent: { alignItems: 'center', gap: 2, paddingVertical: 2 },
  compactStatusButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headingTitle: { flexShrink: 0 },
  heading: { fontSize: 30, fontWeight: '700', letterSpacing: -1, marginTop: 6 },
  headingCount: { fontSize: 20 },
  floatingNewChat: { position: 'absolute', right: 20, width: 54, height: 54, borderRadius: 27, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#06122C', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.24, shadowRadius: 10 },
  searchBox: { height: 46, borderWidth: 1, borderRadius: 23, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, fontSize: 13 },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 16 },
  filter: { borderRadius: 18, paddingVertical: 8, paddingHorizontal: 16 },
  filterText: { fontSize: 12, fontWeight: '700' },
  archiveRow: { minHeight: 54, borderRadius: 15, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  archiveIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  archiveText: { flex: 1, fontSize: 13, fontWeight: '600' },
  archiveCount: { fontSize: 12 },
  chatList: { marginTop: 4 },
  chatRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 76, borderBottomWidth: StyleSheet.hairlineWidth },
  chatContent: { flex: 1, paddingVertical: 14 },
  chatTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chatName: { fontSize: 15, fontWeight: '700' },
  chatTime: { fontSize: 11, fontWeight: '600' },
  chatBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 10 },
  lastMessage: { fontSize: 12, flex: 1 },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadText: { fontSize: 10, fontWeight: '800' },
  encryptionNote: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 13, marginTop: 23 },
  encryptionText: { fontSize: 11 },
  emptyState: { alignItems: 'center', padding: 26, borderRadius: 17, borderWidth: 1, marginTop: 20 },
  emptyTitle: { fontSize: 15, fontWeight: '700', marginTop: 10 },
  emptyBody: { fontSize: 12, marginTop: 5 },
});
