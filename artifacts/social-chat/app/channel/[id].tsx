import React, { useState } from 'react';
import { useListChannelUpdates, getListChannelUpdatesQueryKey, usePublishChannelUpdate } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/common';
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
  const pinned = updates.data?.find((update) => update.pinned);

  if (!channel) return <View style={[styles.missing, { backgroundColor: colors.background }]}><Text style={[styles.title, { color: colors.forest }]}>Channel not found</Text><Pressable onPress={() => router.back()}><Text style={{ color: colors.forest }}>Go back</Text></Pressable></View>;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: Platform.OS === 'web' ? 18 : insets.top + 5, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="All channels" onPress={() => router.back()} style={styles.backButton}><Feather name="arrow-left" size={21} color={colors.foreground} /></Pressable>
        <Avatar initials={channel.initials} size={42} tone={tones[channel.color]} />
        <View style={styles.headerCopy}>
          <Text numberOfLines={1} style={[styles.channelName, { color: colors.foreground }]}>{channel.name}</Text>
          <Text numberOfLines={1} style={[styles.memberCount, { color: colors.mutedForeground }]}>{channel.followers} followers · {channel.category}</Text>
        </View>
        {owned
          ? <Pressable accessibilityRole="button" accessibilityLabel="Save a promotion draft for this channel" onPress={() => router.push({ pathname: '/(tabs)/business', params: { targetType: 'channel', targetId: id, name: channel.name } } as never)} style={styles.backButton}><Feather name="trending-up" size={19} color={colors.primary} /></Pressable>
          : <Pressable accessibilityRole="button" accessibilityState={{ selected: channel.followed }} accessibilityLabel={channel.followed ? 'Unfollow channel' : 'Follow channel'} onPress={() => void toggleChannelFollow(channel.id)} style={[styles.followButton, { borderColor: colors.border }]}>
            <Feather name={channel.followed ? 'check' : 'plus'} size={16} color={colors.primary} />
            <Text style={[styles.followText, { color: colors.primary }]}>{channel.followed ? 'Following' : 'Follow'}</Text>
          </Pressable>}
      </View>
      <ScrollView style={styles.content} contentContainerStyle={{ paddingHorizontal: 15, paddingTop: 15, paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + 18 }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.description, { color: colors.mutedForeground }]}>{channel.description}</Text>
        {pinned ? <View style={[styles.pinned, { backgroundColor: colors.secondary, borderColor: colors.primary }]}>
          <View style={styles.pinnedLabel}><Feather name="bookmark" size={13} color={colors.primary} /><Text style={[styles.pinnedText, { color: colors.primary }]}>PINNED UPDATE</Text></View>
          <Text style={[styles.updateText, { color: colors.foreground }]}>{pinned.content}</Text>
        </View>
          : null}
        <View style={styles.updatesHeading}><Text style={[styles.updatesTitle, { color: colors.foreground }]}>Updates</Text><Text style={[styles.updatesSubtitle, { color: colors.mutedForeground }]}>{updates.data?.length ?? 0} posts from this channel</Text></View>
        {updates.isPending && <Text style={{ color: colors.mutedForeground }}>Loading updates…</Text>}
        {updates.error && <Pressable onPress={() => void updates.refetch()}><Text style={{ color: colors.destructive }}>Could not load updates. Retry</Text></Pressable>}
        {updates.data?.length === 0 && <Text style={{ color: colors.mutedForeground }}>No updates yet.</Text>}
        {(updates.data ?? []).map((update) => (
          <View key={update.id} style={styles.updateRow}>
            <Avatar initials={channel.initials} size={30} tone={tones[channel.color]} />
            <View style={[styles.updateBubble, { backgroundColor: colors.card, borderColor: update.pinned ? colors.primary : colors.border }]}>
              <View style={styles.updateTop}><Text numberOfLines={1} style={[styles.author, { color: colors.primary }]}>{channel.name}</Text>{update.pinned ? <Feather name="bookmark" size={12} color={colors.primary} /> : null}<Text style={[styles.time, { color: colors.mutedForeground }]}>{new Date(update.createdAt).toLocaleDateString()}</Text></View>
              <Text style={[styles.updateText, { color: colors.foreground }]}>{update.content}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      {owned ? <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10), backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <TextInput accessibilityLabel="Channel update" placeholder="Share an update with followers…" placeholderTextColor={colors.mutedForeground} value={draft} onChangeText={setDraft} multiline maxLength={4000} style={[styles.composerInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
        <Pressable accessibilityRole="button" accessibilityLabel="Publish update" disabled={!draft.trim() || publish.isPending} onPress={async () => { if (await run(() => publish.mutateAsync({ channelId: id, data: { content: draft.trim() } }))) setDraft(''); }} style={[styles.sendButton, { backgroundColor: colors.primary, opacity: !draft.trim() || publish.isPending ? 0.5 : 1 }]}>
          <Feather name={publish.isPending ? 'clock' : 'arrow-up'} size={19} color={colors.primaryForeground} />
        </Pressable>
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { minHeight: 66, paddingBottom: 9, paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 9 },
  backButton: { width: 38, height: 42, justifyContent: 'center', alignItems: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  channelName: { fontSize: 14, fontWeight: '800' },
  memberCount: { fontSize: 10, marginTop: 3 },
  followButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 18, borderWidth: 1 },
  followText: { fontSize: 10, fontWeight: '700' },
  content: { flex: 1 },
  description: { fontSize: 12, lineHeight: 18, marginBottom: 14 },
  pinned: { borderRadius: 13, borderLeftWidth: 3, padding: 12, marginBottom: 16 },
  pinnedLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  pinnedText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  updatesHeading: { marginTop: 2, marginBottom: 12 },
  updatesTitle: { fontSize: 18, fontWeight: '800' },
  updatesSubtitle: { fontSize: 10, marginTop: 3 },
  updateRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 },
  updateBubble: { maxWidth: '88%', borderRadius: 17, borderBottomLeftRadius: 5, borderWidth: 1, padding: 12 },
  updateTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  author: { flex: 1, fontSize: 11, fontWeight: '800' },
  time: { fontSize: 9 },
  updateText: { fontSize: 13, lineHeight: 19, marginTop: 6 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 9, paddingHorizontal: 12, borderTopWidth: StyleSheet.hairlineWidth },
  composerInput: { flex: 1, minHeight: 42, maxHeight: 110, borderRadius: 18, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10, fontSize: 13 },
  sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  missing: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  title: { fontSize: 18, fontWeight: '700' },
});
