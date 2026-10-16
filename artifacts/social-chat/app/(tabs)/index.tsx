import React, { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useAppStore } from '@/state/AppStore';
import { Avatar, AppHeader, Eyebrow, PageFrame, SectionTitle, StorageNotice } from '@/components/common';

const stories = [
  { initials: 'MC', name: 'Maya', tone: 'coral' as const },
  { initials: 'SA', name: 'Sola', tone: 'blue' as const },
  { initials: 'KO', name: 'Kemi', tone: 'gold' as const },
  { initials: 'IF', name: 'Ife', tone: 'lime' as const },
];

export default function FeedScreen() {
  const colors = useColors();
  const { state, toggleLike, addComment, createPost } = useAppStore();
  const [draft, setDraft] = useState('');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [storyOpen, setStoryOpen] = useState('');

  const publish = () => {
    if (!draft.trim()) return;
    createPost(draft);
    setDraft('');
  };

  return (
    <PageFrame>
      <AppHeader label="your people" />
      <StorageNotice />
      <View style={styles.welcome}>
        <Eyebrow>FRIDAY, OCTOBER 16</Eyebrow>
        <Text style={[styles.title, { color: colors.forest }]}>A little closer,{"\n"}wherever you are.</Text>
      </View>
      <View style={styles.storyRow}>
        <Pressable style={styles.storyItem} onPress={() => setStoryOpen('Share a moment with your community.')}>
          <View style={[styles.addStory, { borderColor: colors.border, backgroundColor: colors.card }]}><Feather name="plus" size={20} color={colors.forest} /></View>
          <Text style={[styles.storyName, { color: colors.mutedForeground }]}>Your story</Text>
        </Pressable>
        {stories.map((story) => (
          <Pressable key={story.name} style={styles.storyItem} onPress={() => setStoryOpen(`${story.name}’s story`)}>
            <View style={[styles.storyRing, { borderColor: colors.coral }]}><Avatar initials={story.initials} size={49} tone={story.tone} /></View>
            <Text style={[styles.storyName, { color: colors.foreground }]}>{story.name}</Text>
          </Pressable>
        ))}
      </View>
      {storyOpen ? (
        <Pressable onPress={() => setStoryOpen('')} style={[styles.storyNotice, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.storyNoticeText, { color: colors.forest }]}>{storyOpen}</Text><Feather name="x" size={16} color={colors.forest} />
        </Pressable>
      ) : null}
      <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.composerTop}>
          <Avatar initials="AM" size={38} tone="lime" />
          <TextInput accessibilityLabel="Write a community post" placeholder="What’s on your mind, Amara?" placeholderTextColor={colors.mutedForeground} value={draft} onChangeText={setDraft} multiline style={[styles.composerInput, { color: colors.foreground }]} />
        </View>
        <View style={[styles.composerFooter, { borderTopColor: colors.border }]}>
          <View style={styles.composePrompt}><Feather name="image" size={16} color={colors.coral} /><Text style={[styles.promptText, { color: colors.mutedForeground }]}>Add a moment</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Publish post" testID="publish-post" onPress={publish} disabled={!draft.trim()} style={[styles.publishButton, { backgroundColor: draft.trim() ? colors.forest : colors.secondary }]}>
            <Text style={[styles.publishText, { color: draft.trim() ? colors.primaryForeground : colors.mutedForeground }]}>Share</Text><Feather name="arrow-up-right" size={14} color={draft.trim() ? colors.primaryForeground : colors.mutedForeground} />
          </Pressable>
        </View>
      </View>
      <SectionTitle title="Around your circle" action="See all" onAction={() => setStoryOpen('You’re seeing the latest posts from your community.')} />
      <View style={styles.postList}>
        {state.posts.map((post) => (
          <View key={post.id} style={[styles.postCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.postAuthor}>
              <Avatar initials={post.initials} size={42} tone={post.author.startsWith('Sola') ? 'blue' : post.author.startsWith('Kemi') ? 'gold' : 'coral'} />
              <View style={styles.authorInfo}>
                <View style={styles.authorLine}><Text style={[styles.authorName, { color: colors.forest }]}>{post.author}</Text><Text style={[styles.postTime, { color: colors.mutedForeground }]}>· {post.time}</Text></View>
                <Text style={[styles.postSubtitle, { color: colors.mutedForeground }]}>{post.subtitle}</Text>
              </View>
              <View style={styles.moreButton}><Feather name="more-horizontal" size={21} color={colors.mutedForeground} /></View>
            </View>
            <Text style={[styles.postText, { color: colors.foreground }]}>{post.text}</Text>
            {post.image === 'cafe' ? <Image source={require('@/assets/images/cafe-post.jpg')} style={styles.postImage} resizeMode="cover" /> : null}
            {post.image === 'market' ? <Image source={require('@/assets/images/market-post.jpg')} style={styles.postImage} resizeMode="cover" /> : null}
            <View style={styles.postActions}>
              <Pressable accessibilityRole="button" accessibilityLabel={post.liked ? 'Unlike post' : 'Like post'} onPress={() => toggleLike(post.id)} style={styles.actionButton}>
                <Feather name="heart" size={18} color={post.liked ? colors.coral : colors.mutedForeground} /><Text style={[styles.actionLabel, { color: post.liked ? colors.coral : colors.mutedForeground }]}>{post.likes}</Text>
              </Pressable>
              <View style={styles.actionButton}><Feather name="message-circle" size={18} color={colors.mutedForeground} /><Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>{post.comments.length}</Text></View>
            </View>
            {post.comments.slice(-2).map((comment) => (
              <View key={comment.id} style={styles.commentRow}><Text style={[styles.commentAuthor, { color: colors.forest }]}>{comment.author}</Text><Text style={[styles.commentText, { color: colors.mutedForeground }]}>{comment.text}</Text></View>
            ))}
            <View style={[styles.commentInputRow, { borderTopColor: colors.border }]}>
              <TextInput accessibilityLabel={`Comment on ${post.author}’s post`} placeholder="Add a thoughtful reply…" placeholderTextColor={colors.mutedForeground} value={commentDrafts[post.id] ?? ''} onChangeText={(text) => setCommentDrafts((current) => ({ ...current, [post.id]: text }))} onSubmitEditing={() => {
                const text = commentDrafts[post.id] ?? '';
                if (!text.trim()) return;
                addComment(post.id, text);
                setCommentDrafts((current) => ({ ...current, [post.id]: '' }));
              }} returnKeyType="send" style={[styles.commentInput, { color: colors.foreground }]} />
              <Pressable accessibilityLabel="Send comment" onPress={() => {
                const text = commentDrafts[post.id] ?? '';
                if (!text.trim()) return;
                addComment(post.id, text);
                setCommentDrafts((current) => ({ ...current, [post.id]: '' }));
              }}><Feather name="arrow-up-right" size={18} color={colors.forest} /></Pressable>
            </View>
          </View>
        ))}
      </View>
    </PageFrame>
  );
}

const styles = StyleSheet.create({
  welcome: { marginBottom: 18 },
  title: { fontSize: 30, lineHeight: 35, fontWeight: '700', letterSpacing: -1.1, marginTop: 8 },
  storyRow: { flexDirection: 'row', gap: 15, marginBottom: 18 },
  storyItem: { alignItems: 'center', gap: 6 },
  addStory: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  storyRing: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  storyName: { fontSize: 11, fontWeight: '500' },
  storyNotice: { borderRadius: 12, padding: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  storyNoticeText: { fontSize: 13, fontWeight: '600' },
  composer: { borderRadius: 20, borderWidth: 1, padding: 14, marginBottom: 26 },
  composerTop: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', minHeight: 48 },
  composerInput: { flex: 1, fontSize: 14, paddingTop: 9, minHeight: 42 },
  composerFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 10 },
  composePrompt: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  promptText: { fontSize: 12, fontWeight: '500' },
  publishButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 13, paddingVertical: 8, paddingHorizontal: 12 },
  publishText: { fontSize: 12, fontWeight: '700' },
  postList: { gap: 14 },
  postCard: { borderRadius: 20, borderWidth: 1, padding: 15, overflow: 'hidden' },
  postAuthor: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  authorInfo: { flex: 1, gap: 3 },
  authorLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  authorName: { fontSize: 14, fontWeight: '700' },
  postTime: { fontSize: 11 },
  postSubtitle: { fontSize: 11 },
  moreButton: { padding: 5 },
  postText: { fontSize: 14, lineHeight: 21, marginTop: 14, marginBottom: 13 },
  postImage: { width: '100%', height: 220, borderRadius: 14, marginBottom: 8 },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingVertical: 10 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  actionLabel: { fontSize: 12, fontWeight: '600' },
  shareAction: { marginLeft: 'auto', padding: 3 },
  commentRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  commentAuthor: { fontSize: 12, fontWeight: '700' },
  commentText: { flex: 1, fontSize: 12, lineHeight: 17 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 10, gap: 10 },
  commentInput: { flex: 1, fontSize: 12, minHeight: 28 },
});
