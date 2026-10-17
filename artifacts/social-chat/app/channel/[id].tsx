import React, { useState } from 'react';
import { useListChannelUpdates, getListChannelUpdatesQueryKey, usePublishChannelUpdate } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, StorageNotice } from '@/components/common';
import { useColors } from '@/hooks/useColors';
import { useAppStore } from '@/state/AppStore';

const tones = { lime: 'lime', coral: 'coral', blue: 'blue', gold: 'gold' } as const;

export default function ChannelDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, rawChannels, profile, run, toggleChannelFollow } = useAppStore();
  const updates = useListChannelUpdates(id, { query: { queryKey: getListChannelUpdatesQueryKey(id), refetchInterval: 10000 } });
  const publish = usePublishChannelUpdate();
  const [draft, setDraft] = useState('');
  const owned = rawChannels.find(c => c.id === id)?.owner.id === profile?.id;
  const channel = state.channels.find((item) => item.id === id);

  if (!channel) return <View style={[styles.missing, { backgroundColor: colors.background }]}><Text style={[styles.title, { color: colors.forest }]}>Channel not found</Text><Pressable onPress={() => router.back()}><Text style={{ color: colors.forest }}>Go back</Text></Pressable></View>;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}><Feather name="arrow-left" size={21} color={colors.forest} /></Pressable>
        <Text style={[styles.topLabel, { color: colors.mutedForeground }]}>CHANNEL</Text>
      </View>
      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 16 }} keyboardShouldPersistTaps="handled">
        <StorageNotice />
        <View style={[styles.hero, { backgroundColor: colors.forest }]}>
          <Avatar initials={channel.initials} size={62} tone={tones[channel.color]} />
          <Text style={[styles.channelName, { color: colors.primaryForeground }]}>{channel.name}</Text>
          <Text style={[styles.memberCount, { color: colors.primaryForeground }]}>{channel.followers} members · {channel.category}</Text>
          <Text style={[styles.description, { color: colors.primaryForeground }]}>{channel.description}</Text>
          <Pressable onPress={async () => { await toggleChannelFollow(channel.id); }} style={[styles.joinButton, { backgroundColor: channel.followed ? colors.secondary : colors.lime }]}><Feather name={channel.followed ? 'check' : 'plus'} size={15} color={colors.forest} /><Text style={[styles.joinText, { color: colors.forest }]}>{channel.followed ? 'Following' : 'Follow channel'}</Text></Pressable>
        </View>
        <View style={styles.updatesHeading}><Text style={[styles.updatesTitle, { color: colors.forest }]}>Recent updates</Text><Text style={[styles.updatesSubtitle, { color: colors.mutedForeground }]}>A shared space for useful things and good news.</Text></View>
        {owned && <View><TextInput accessibilityLabel="Channel update" placeholder="Share an update…" placeholderTextColor={colors.mutedForeground} value={draft} onChangeText={setDraft} multiline style={{ padding: 16, color: colors.foreground, backgroundColor: colors.card, borderRadius: 14 }} /><Pressable disabled={!draft.trim() || publish.isPending} onPress={async () => { if (await run(() => publish.mutateAsync({ channelId: id, data: { content: draft } }))) setDraft(''); }}><Text style={{ color: colors.primary, padding: 14 }}>{publish.isPending ? 'Publishing…' : 'Publish update'}</Text></Pressable></View>}
        {updates.isPending && <Text style={{ color: colors.mutedForeground }}>Loading updates…</Text>}
        {updates.error && <Pressable onPress={() => void updates.refetch()}><Text style={{ color: colors.destructive }}>Could not load updates. Retry</Text></Pressable>}
        {updates.data?.length === 0 && <Text style={{ color: colors.mutedForeground }}>No updates yet.</Text>}
        {(updates.data ?? []).map((update) => (
          <View key={update.id} style={[styles.updateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.updateTop}><Avatar initials={channel.initials} size={32} tone={tones[channel.color]} /><View style={styles.updateBy}><Text style={[styles.author, { color: colors.foreground }]}>{channel.name}{update.pinned ? ' · Pinned' : ''}</Text><Text style={[styles.time, { color: colors.mutedForeground }]}>{new Date(update.createdAt).toLocaleString()}</Text></View></View>
            <Text style={[styles.updateText, { color: colors.foreground }]}>{update.content}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { minHeight: 58, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 36, height: 38, justifyContent: 'center' },
  topLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  moreButton: { width: 36, height: 38, alignItems: 'flex-end', justifyContent: 'center' },
  content: { flex: 1, paddingHorizontal: 18, paddingTop: 8 },
  hero: { borderRadius: 23, padding: 20, alignItems: 'center' },
  channelName: { fontSize: 22, fontWeight: '700', letterSpacing: -0.6, marginTop: 13 },
  memberCount: { fontSize: 11, opacity: 0.75, marginTop: 5 },
  description: { textAlign: 'center', fontSize: 13, lineHeight: 19, opacity: 0.88, marginTop: 13, maxWidth: 290 },
  joinButton: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 13, paddingVertical: 10, paddingHorizontal: 17, marginTop: 17 },
  joinText: { fontSize: 12, fontWeight: '700' },
  updatesHeading: { marginTop: 24, marginBottom: 13 },
  updatesTitle: { fontSize: 19, fontWeight: '700' },
  updatesSubtitle: { fontSize: 11, marginTop: 5 },
  updateCard: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 11 },
  updateTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  updateBy: { flex: 1, gap: 3 },
  author: { fontSize: 12, fontWeight: '700' },
  time: { fontSize: 10 },
  updateText: { fontSize: 13, lineHeight: 20, marginTop: 13, marginBottom: 14 },
  updateActions: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontSize: 11, fontWeight: '600' },
  shareIcon: { marginLeft: 'auto' },
  missing: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  title: { fontSize: 18, fontWeight: '700' },
});
