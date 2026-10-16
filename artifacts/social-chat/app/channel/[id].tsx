import React from 'react';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const { state, toggleChannelFollow } = useAppStore();
  const channel = state.channels.find((item) => item.id === id);

  if (!channel) return <View style={[styles.missing, { backgroundColor: colors.background }]}><Text style={[styles.title, { color: colors.forest }]}>Channel not found</Text><Pressable onPress={() => router.back()}><Text style={{ color: colors.forest }}>Go back</Text></Pressable></View>;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}><Feather name="arrow-left" size={21} color={colors.forest} /></Pressable>
        <Text style={[styles.topLabel, { color: colors.mutedForeground }]}>CHANNEL</Text>
        <Pressable accessibilityLabel="More options" style={styles.moreButton}><Feather name="more-horizontal" size={21} color={colors.forest} /></Pressable>
      </View>
      <View style={styles.content}>
        <View style={[styles.hero, { backgroundColor: colors.forest }]}>
          <Avatar initials={channel.initials} size={62} tone={tones[channel.color]} />
          <Text style={[styles.channelName, { color: colors.primaryForeground }]}>{channel.name}</Text>
          <Text style={[styles.memberCount, { color: colors.primaryForeground }]}>{channel.followers} members · {channel.category}</Text>
          <Text style={[styles.description, { color: colors.primaryForeground }]}>{channel.description}</Text>
          <Pressable onPress={() => toggleChannelFollow(channel.id)} style={[styles.joinButton, { backgroundColor: channel.followed ? colors.secondary : colors.lime }]}><Feather name={channel.followed ? 'check' : 'plus'} size={15} color={colors.forest} /><Text style={[styles.joinText, { color: colors.forest }]}>{channel.followed ? 'Following' : 'Join channel'}</Text></Pressable>
        </View>
        <View style={styles.updatesHeading}><Text style={[styles.updatesTitle, { color: colors.forest }]}>Recent updates</Text><Text style={[styles.updatesSubtitle, { color: colors.mutedForeground }]}>A shared space for useful things and good news.</Text></View>
        {channel.updates.map((update) => (
          <View key={update.id} style={[styles.updateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.updateTop}><Avatar initials={update.author.slice(0, 2).toUpperCase()} size={32} tone={tones[channel.color]} /><View style={styles.updateBy}><Text style={[styles.author, { color: colors.forest }]}>{update.author}</Text><Text style={[styles.time, { color: colors.mutedForeground }]}>{update.time}</Text></View><Feather name="volume-2" size={16} color={colors.mutedForeground} /></View>
            <Text style={[styles.updateText, { color: colors.foreground }]}>{update.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { height: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
