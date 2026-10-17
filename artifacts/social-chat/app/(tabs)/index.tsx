import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useListPostComments, getListPostCommentsQueryKey } from '@workspace/api-client-react';
import { useAppStore, initials } from '@/state/AppStore';
import { useColors } from '@/hooks/useColors';
import { AppHeader, Avatar, Eyebrow, PageFrame, StorageNotice } from '@/components/common';
import { FeedPost } from '@/types';

export default function FeedScreen() {
  const colors = useColors();
  const { state, profile, createPost, loading } = useAppStore();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  return <PageFrame>
    <AppHeader /><StorageNotice />
    <Eyebrow>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Eyebrow>
    <Text style={[styles.heading, { color: colors.foreground }]}>A little closer,{'\n'}wherever you are.</Text>
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.row}><Avatar initials={initials(profile?.name ?? '')} size={38} tone="lime" /><TextInput accessibilityLabel="Write a community post" placeholder="What’s on your mind?" placeholderTextColor={colors.mutedForeground} value={draft} onChangeText={setDraft} multiline style={{ flex: 1, color: colors.foreground, minHeight: 60 }} /></View>
      <Pressable disabled={busy || !draft.trim()} onPress={async () => { setBusy(true); if (await createPost(draft)) setDraft(''); setBusy(false); }} style={[styles.button, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground }}>{busy ? 'Sharing…' : 'Share'}</Text></Pressable>
    </View>
    <Text style={[styles.section, { color: colors.foreground }]}>Around your circle</Text>
    {!loading && !state.posts.length && <Text style={{ color: colors.mutedForeground }}>No posts yet. Share a thought with your community.</Text>}
    {state.posts.map(post => <PostCard key={post.id} post={post} />)}
  </PageFrame>;
}
function PostCard({ post }: { post: FeedPost }) {
  const colors = useColors();
  const { toggleLike, addComment } = useAppStore();
  const comments = useListPostComments(post.id, { query: { queryKey: getListPostCommentsQueryKey(post.id), refetchInterval: 10000 } });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => { if (!draft.trim() || busy) return; setBusy(true); if (await addComment(post.id, draft)) setDraft(''); setBusy(false); };
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <View style={styles.row}><Avatar initials={post.initials} size={42} tone="blue" /><View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: '700' }}>{post.author}</Text><Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{post.subtitle} · {post.time}</Text></View></View>
    <Text style={{ color: colors.foreground, lineHeight: 22, marginVertical: 16 }}>{post.text}</Text>
    <Pressable onPress={async () => { await toggleLike(post.id); }} style={styles.row}><Feather name="heart" size={19} color={post.liked ? colors.primary : colors.mutedForeground} /><Text style={{ color: colors.mutedForeground }}>{post.likes} · {comments.data?.length ?? 0} replies</Text></Pressable>
    {comments.error && <Pressable onPress={() => void comments.refetch()}><Text style={{ color: colors.destructive }}>Could not load replies. Retry</Text></Pressable>}
    {comments.data?.map(comment => <Text key={comment.id} style={{ color: colors.foreground, marginTop: 10 }}><Text style={{ fontWeight: '700' }}>{comment.author.name}: </Text>{comment.content}</Text>)}
    <View style={styles.row}><TextInput accessibilityLabel="Comment" placeholder="Add a thoughtful reply…" placeholderTextColor={colors.mutedForeground} value={draft} onChangeText={setDraft} onSubmitEditing={() => void submit()} style={{ flex: 1, color: colors.foreground, minHeight: 48 }} /><Pressable disabled={busy || !draft.trim()} onPress={() => void submit()} accessibilityLabel="Send comment"><Feather name="arrow-up-right" size={22} color={colors.primary} /></Pressable></View>
  </View>;
}
const styles = StyleSheet.create({
  heading: { fontSize: 30, lineHeight: 35, fontWeight: '700', letterSpacing: -1, marginTop: 8, marginBottom: 22 },
  section: { fontSize: 20, fontWeight: '700', marginVertical: 18 },
  card: { borderWidth: 1, borderRadius: 20, padding: 15, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  button: { alignSelf: 'flex-end', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 13, marginTop: 12 },
});
