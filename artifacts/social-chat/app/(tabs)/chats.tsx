import React, { useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, AppHeader, Eyebrow, PageFrame, StorageNotice } from '@/components/common';
import { useColors } from '@/hooks/useColors';
import { useAppStore } from '@/state/AppStore';

type Filter = 'All' | 'Unread' | 'Groups';

export default function ChatsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { state } = useAppStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const chats = useMemo(() => state.conversations.filter((chat) => {
    const matchesText = `${chat.name} ${chat.lastMessage}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === 'All' || (filter === 'Unread' ? chat.unread > 0 : chat.category === 'group');
    return matchesText && matchesFilter;
  }), [filter, query, state.conversations]);
  const unreadCount = state.conversations.reduce((sum, chat) => sum + chat.unread, 0);

  return (
    <PageFrame>
      <AppHeader label="messages" />
      <StorageNotice />
      <View style={styles.headingRow}>
        <View><Eyebrow>YOUR INBOX</Eyebrow><Text style={[styles.heading, { color: colors.forest }]}>Chats <Text style={[styles.headingCount, { color: colors.coral }]}>{unreadCount || '·'}</Text></Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open a conversation" onPress={() => router.push('/chat/maya-chen')} style={[styles.newChat, { backgroundColor: colors.lime }]}><Feather name="plus" size={20} color={colors.forest} /></Pressable>
      </View>
      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={17} color={colors.mutedForeground} />
        <TextInput accessibilityLabel="Search chats" placeholder="Search people and messages" placeholderTextColor={colors.mutedForeground} value={query} onChangeText={setQuery} style={[styles.searchInput, { color: colors.foreground }]} />
        <Feather name="sliders" size={16} color={colors.mutedForeground} />
      </View>
      <View style={styles.filterRow}>
        {(['All', 'Unread', 'Groups'] as Filter[]).map((item) => {
          const selected = filter === item;
          return <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filter, { backgroundColor: selected ? colors.forest : colors.secondary }]}><Text style={[styles.filterText, { color: selected ? colors.primaryForeground : colors.mutedForeground }]}>{item}</Text></Pressable>;
        })}
      </View>
      <View style={styles.chatList}>
        {chats.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="message-square" size={22} color={colors.mutedForeground} /><Text style={[styles.emptyTitle, { color: colors.forest }]}>No conversations found</Text><Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>Try another search or switch filters.</Text></View>
        ) : chats.map((chat) => (
          <Pressable accessibilityRole="button" key={chat.id} onPress={() => router.push(`/chat/${chat.id}`)} style={styles.chatRow}>
            <Avatar initials={chat.initials} size={52} tone={chat.category === 'customer' ? 'lime' : chat.category === 'group' ? 'gold' : chat.id === 'maya-chen' ? 'coral' : 'blue'} online={chat.online} />
            <View style={[styles.chatContent, { borderBottomColor: colors.border }]}>
              <View style={styles.chatTop}><View style={styles.nameRow}><Text style={[styles.chatName, { color: colors.forest }]}>{chat.name}</Text>{chat.verified ? <Feather name="check-circle" size={14} color={colors.blue} /> : null}</View><Text style={[styles.chatTime, { color: chat.unread ? colors.forest : colors.mutedForeground }]}>{chat.time}</Text></View>
              <View style={styles.chatBottom}><Text numberOfLines={1} style={[styles.lastMessage, { color: colors.mutedForeground }]}>{chat.lastMessage}</Text>{chat.unread > 0 ? <View style={[styles.unreadBadge, { backgroundColor: colors.lime }]}><Text style={[styles.unreadText, { color: colors.forest }]}>{chat.unread}</Text></View> : null}</View>
            </View>
          </Pressable>
        ))}
      </View>
      <View style={[styles.encryptionNote, { backgroundColor: colors.secondary }]}><Feather name="lock" size={13} color={colors.forest} /><Text style={[styles.encryptionText, { color: colors.mutedForeground }]}>Your conversations stay on this device.</Text></View>
    </PageFrame>
  );
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 },
  heading: { fontSize: 30, fontWeight: '700', letterSpacing: -1, marginTop: 6 },
  headingCount: { fontSize: 20 },
  newChat: { width: 44, height: 44, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  searchBox: { height: 48, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, fontSize: 13 },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 16 },
  filter: { borderRadius: 12, paddingVertical: 8, paddingHorizontal: 15 },
  filterText: { fontSize: 12, fontWeight: '700' },
  archiveRow: { minHeight: 54, borderRadius: 15, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  archiveIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  archiveText: { flex: 1, fontSize: 13, fontWeight: '600' },
  archiveCount: { fontSize: 12 },
  chatList: { marginTop: 4 },
  chatRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 76 },
  chatContent: { flex: 1, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 14 },
  chatTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chatName: { fontSize: 14, fontWeight: '700' },
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
