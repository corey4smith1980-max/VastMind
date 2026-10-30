import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  COMMUNITY_POST_TOPICS, communityTopicLabel, getGetVideosQueryKey, getListPostCommentsQueryKey, useAddPostComment, useCreatePost,
  useListPostComments, useTogglePostReaction, useVoteOnPoll, type MediaAttachment, type Post,
  type CommunityPostTopic,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAppStore } from '@/state/AppStore';
import { ContentProducts } from '@/components/commerce/ContentProducts';
import { errorText, useAuthedMedia } from '@/components/videoKit';
import { MobileMediaPicker, MobileMediaPreview } from '@/components/Media';

const INK = 'hsl(192,52%,9%)';
const ago = (iso: string) => { const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };

/** Text/photo/poll card; the reel variant remains for older navigation paths. */
export function PostEntry({ post, height, near, bottomInset, variant = 'reel' }: { post: Post; height: number; near: boolean; bottomInset: number; variant?: 'reel' | 'community' }) {
  const colors = useColors();
  const qc = useQueryClient();
  const { profile } = useAppStore();
  const [p, setP] = useState(post);
  useEffect(() => setP(post), [post]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const isImage = !!p.media?.contentType.startsWith('image/');
  const { source } = useAuthedMedia(isImage ? p.media : null, near && isImage);
  const comments = useListPostComments(p.id, { query: { queryKey: getListPostCommentsQueryKey(p.id), enabled: open, refetchInterval: open ? 10000 : false } });
  const react = useTogglePostReaction({ mutation: { onSuccess: r => { setP(x => ({ ...x, reacted: r.reacted, reactionsCount: r.reactionsCount })); void qc.invalidateQueries({ queryKey: getGetVideosQueryKey({ surface: p.surface }) }); }, onError: e => setNote(errorText(e)) } });
  const vote = useVoteOnPoll({ mutation: { onSuccess: () => { void qc.invalidateQueries({ queryKey: getGetVideosQueryKey({ surface: p.surface }) }); }, onError: e => setNote(errorText(e)) } });
  const add = useAddPostComment({ mutation: { onSuccess: c => { setText(''); setP(x => ({ ...x, commentsCount: x.commentsCount + 1 })); qc.setQueryData(getListPostCommentsQueryKey(p.id), (old: typeof comments.data) => old ? [...old, c] : [c]); }, onError: e => setNote(errorText(e)) } });
  const total = p.pollOptions.reduce((n, o) => n + o.votes, 0);
  const voted = p.pollOptions.some(o => o.votedByMe);
  const castVote = (optionId: string) => {
    setP(x => ({ ...x, pollOptions: x.pollOptions.map(o => o.id === optionId ? { ...o, votedByMe: true, votes: o.votedByMe ? o.votes : o.votes + 1 } : o.votedByMe ? { ...o, votedByMe: false, votes: o.votes - 1 } : o) }));
    vote.mutate({ postId: p.id, data: { optionId } });
  };
  const author = p.isAnonymous ? 'Anonymous member' : p.author.name;

  return <View style={{ height, backgroundColor: variant === 'community' ? colors.background : INK, paddingHorizontal: 14, paddingTop: variant === 'community' ? 8 : 12, paddingBottom: variant === 'community' ? 8 : bottomInset + 10 }}>
    {variant === 'reel' ? <Text style={s.kicker}>{p.pollOptions.length && isImage ? 'PHOTO POLL' : p.pollOptions.length ? 'POLL' : isImage ? 'PHOTO POST' : 'POST'}</Text> : null}
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, ...(variant === 'community' ? { borderRadius: 18 } : {}) }]}>
      <ScrollView nestedScrollEnabled contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View style={s.row}>
          <View style={[s.avatar, { backgroundColor: p.isAnonymous ? colors.muted : colors.primary }]}>
            {p.isAnonymous ? <Feather name="eye-off" size={16} color={colors.mutedForeground} /> : <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>{p.author.name.slice(0, 1).toUpperCase()}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.foreground, fontWeight: '700' }} numberOfLines={1}>{author}{p.isAnonymous ? '' : <Text style={{ color: colors.mutedForeground, fontWeight: '400' }}>  @{p.author.username}</Text>}</Text>
            <View style={s.row}>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{ago(p.createdAt)}</Text>
              {variant === 'community' && p.communityTopic ? <Text style={{ color: colors.primary, backgroundColor: colors.muted, borderRadius: 10, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 2, fontSize: 10, fontWeight: '700' }}>{communityTopicLabel(p.communityTopic)}</Text> : null}
            </View>
          </View>
        </View>
        {p.content ? <Text style={{ color: colors.foreground, fontSize: 16, lineHeight: 23, marginTop: 14 }}>{p.content}</Text> : null}
        {isImage ? <View style={[s.photo, { backgroundColor: colors.muted }]}>{source ? <Image source={source} style={StyleSheet.absoluteFill} resizeMode="contain" accessibilityLabel={`Photo from ${author}`} /> : <ActivityIndicator color={colors.primary} />}</View> : null}
        {p.pollOptions.length ? <View style={{ marginTop: 14, gap: 10 }} accessibilityRole="radiogroup" accessibilityLabel={`${total} total votes`}>
          {p.pollOptions.map(o => { const pct = total ? Math.round((o.votes / total) * 1000) / 10 : 0; return (
            <Pressable key={o.id} accessibilityRole="radio" accessibilityLabel={`${o.label}: ${o.votes} votes, ${Math.round(pct)}%`} accessibilityState={{ checked: o.votedByMe }} disabled={vote.isPending} onPress={() => castVote(o.id)} style={[s.option, { minHeight: 68, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', gap: 9, borderColor: o.votedByMe ? colors.primary : colors.border, borderWidth: o.votedByMe ? 2 : 1, overflow: 'hidden' }]}>
              <View style={[s.row, { justifyContent: 'space-between', gap: 10 }]}>
                <Text style={{ color: colors.foreground, fontWeight: '600', flex: 1 }} numberOfLines={2}>{o.label}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, fontVariant: ['tabular-nums'] }}>{o.votes} · {Math.round(pct)}%</Text>
              </View>
              <View style={{ width: '100%', height: 7, borderRadius: 5, backgroundColor: colors.muted, overflow: 'hidden' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <View style={{ height: '100%', width: `${pct}%`, borderRadius: 5, backgroundColor: colors.primary }} />
              </View>
            </Pressable>); })}
          <View style={[s.row, { justifyContent: 'space-between', gap: 8 }]}>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, flex: 1 }}>{voted ? 'Your vote is in · tap another option to change it' : 'Tap an option to vote'}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, fontVariant: ['tabular-nums'] }}>{total} vote{total === 1 ? '' : 's'}</Text>
          </View>
        </View> : null}
        {!p.isAnonymous ? <ContentProducts postId={p.id} isAuthor={profile?.id === p.author.id} tone="light" enabled={near} /> : null}
        {note ? <Text style={{ color: colors.destructive, marginTop: 8 }} onPress={() => setNote('')}>{note}</Text> : null}
        <View style={[s.row, { marginTop: 14, gap: 18 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={p.reacted ? 'Unlike post' : 'Like post'} disabled={react.isPending} onPress={() => react.mutate({ postId: p.id, data: { reaction: 'like' } })} style={s.row}><Feather name="heart" size={19} color={p.reacted ? colors.primary : colors.mutedForeground} /><Text style={{ color: colors.mutedForeground }}>{p.reactionsCount}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Hide replies' : 'Show replies'} onPress={() => setOpen(o => !o)} style={s.row}><Feather name="message-circle" size={19} color={colors.mutedForeground} /><Text style={{ color: colors.mutedForeground }}>{p.commentsCount}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Share post" onPress={() => void Share.share({ message: (p.content || `Photo from ${author}`).slice(0, 280) }).catch(() => {})} style={{ marginLeft: 'auto' }}><Feather name="share" size={19} color={colors.mutedForeground} /></Pressable>
        </View>
        {open ? <View style={{ marginTop: 10 }}>
          {comments.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
          {comments.isError ? <Text style={{ color: colors.destructive }} onPress={() => void comments.refetch()}>Could not load replies. Tap to retry.</Text> : null}
          {comments.data?.length === 0 ? <Text style={{ color: colors.mutedForeground }}>No replies yet.</Text> : null}
          {comments.data?.map(c => <Text key={c.id} style={{ color: colors.foreground, marginTop: 8 }}><Text style={{ fontWeight: '700' }}>{c.author.name}: </Text>{c.content}</Text>)}
          <View style={[s.row, { marginTop: 8 }]}>
            <TextInput accessibilityLabel="Reply" value={text} onChangeText={setText} maxLength={2000} placeholder="Add a thoughtful reply" placeholderTextColor={colors.mutedForeground} style={{ flex: 1, minHeight: 44, color: colors.foreground }} />
            <Pressable accessibilityLabel="Send reply" disabled={!text.trim() || add.isPending} onPress={() => add.mutate({ postId: p.id, data: { content: text.trim() } })}><Feather name="arrow-up-right" size={22} color={colors.primary} /></Pressable>
          </View>
        </View> : null}
      </ScrollView>
    </View>
  </View>;
}

/** Native post / poll composer using the real Post contract. */
export function CreatePostSheet({ onClose, onPublished, surface = 'community', initialCommunityTopic }: { onClose: () => void; onPublished: () => void; surface?: 'community' | 'profile'; initialCommunityTopic?: CommunityPostTopic }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [content, setContent] = useState('');
  const [communityTopic, setCommunityTopic] = useState<CommunityPostTopic | null>(initialCommunityTopic ?? null);
  const [anon, setAnon] = useState(false);
  const [poll, setPoll] = useState<string[] | null>(null);
  const [photo, setPhoto] = useState<MediaAttachment>();
  const [uploading, setUploading] = useState(false);
  const create = useCreatePost({ mutation: { onSuccess: () => {
    void qc.invalidateQueries({ queryKey: getGetVideosQueryKey({ surface }) });
    setContent(''); setCommunityTopic(initialCommunityTopic ?? null); setPoll(null); setAnon(false); setPhoto(undefined); onPublished();
  } } });
  const opts = (poll ?? []).map(o => o.trim()).filter(Boolean);
  const distinct = new Set(opts.map(o => o.toLowerCase())).size === opts.length;
  const ok = (poll ? !!content.trim() && opts.length >= 2 && distinct : !!content.trim() || !!photo) && (surface !== 'community' || !!communityTopic) && !create.isPending && !uploading;
  const hint = uploading ? 'Wait for the photo to finish uploading.' : surface === 'community' && !communityTopic ? 'Choose a Community topic to continue.' : poll && !content.trim() ? 'Polls need a question.' : poll && opts.length < 2 ? 'Add at least two options.' : poll && !distinct ? 'Poll options must be different.' : '';
  return <Modal visible animationType="slide" transparent onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(5,20,24,0.55)' }}>
      <View style={[s.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 14, maxHeight: '92%', flexShrink: 1 }]}>
        <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={{ color: colors.foreground, fontSize: 19, fontWeight: '700' }}>{poll ? (photo ? 'New photo poll' : 'New poll') : photo ? 'New photo post' : surface === 'community' ? 'Community post' : 'New post'}</Text><Pressable accessibilityLabel="Close" onPress={onClose} style={{ padding: 8 }}><Feather name="x" size={22} color={colors.foreground} /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
          <TextInput accessibilityLabel="Post content" multiline maxLength={5000} value={content} onChangeText={setContent} placeholder={poll ? 'Ask a question' : photo ? 'Add a caption (optional)' : surface === 'community' ? 'Share an opportunity, ask for help, or offer a skill…' : 'What is on your mind?'} placeholderTextColor={colors.mutedForeground} style={{ color: colors.foreground, minHeight: 90, fontSize: 16, textAlignVertical: 'top' }} />
          {surface === 'community' ? <View style={{ marginTop: 6, marginBottom: 14 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>Choose a topic</Text>
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              {COMMUNITY_POST_TOPICS.map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected: communityTopic === option.id }} onPress={() => setCommunityTopic(option.id)}
                style={{ borderWidth: 1, borderColor: communityTopic === option.id ? colors.primary : colors.border, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: communityTopic === option.id ? colors.primary : colors.card }}>
                <Text style={{ color: communityTopic === option.id ? colors.primaryForeground : colors.foreground, fontSize: 11, fontWeight: '700' }}>{option.label}</Text>
              </Pressable>)}
            </View>
            {communityTopic ? <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 8 }}>{COMMUNITY_POST_TOPICS.find(option => option.id === communityTopic)?.prompt}</Text> : null}
          </View> : null}
          {poll ? <View style={{ gap: 8 }}>{poll.map((o, i) => <View key={i} style={s.row}>
            <TextInput accessibilityLabel={`Poll option ${i + 1}`} value={o} maxLength={120} onChangeText={v => setPoll(pp => pp!.map((x, j) => j === i ? v : x))} placeholder={`Option ${i + 1}`} placeholderTextColor={colors.mutedForeground} style={[s.input, { flex: 1, color: colors.foreground, borderColor: colors.border }]} />
            {poll.length > 2 ? <Pressable accessibilityLabel="Remove option" onPress={() => setPoll(pp => pp!.filter((_, j) => j !== i))}><Feather name="minus-circle" size={20} color={colors.mutedForeground} /></Pressable> : null}
          </View>)}{poll.length < 6 ? <Pressable onPress={() => setPoll(pp => [...pp!, ''])}><Text style={{ color: colors.primary, fontWeight: '700' }}>Add option</Text></Pressable> : null}</View> : null}
          {photo ? <View style={{ marginTop: 12, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.muted, alignItems: 'center', paddingVertical: 8 }}>
            <MobileMediaPreview media={photo} />
            <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" disabled={create.isPending} onPress={() => setPhoto(undefined)} style={[s.row, { minHeight: 40, marginTop: 4 }]}><Feather name="trash-2" size={16} color={colors.destructive} /><Text style={{ color: colors.destructive, fontWeight: '700' }}>Remove photo</Text></Pressable>
          </View> : null}
          <View style={{ marginTop: 10 }}><MobileMediaPicker purpose="post" imagesOnly label={photo ? 'Replace photo' : 'Add a photo'} onChange={setPhoto} onUploadingChange={setUploading} disabled={create.isPending} /></View>
          <Pressable accessibilityRole="button" onPress={() => setPoll(pp => pp ? null : ['', ''])} style={[s.row, { marginTop: 14 }]}><Feather name="bar-chart-2" size={18} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: '700' }}>{poll ? 'Remove poll' : 'Add a poll'}</Text></Pressable>
          <View style={[s.row, { marginTop: 14 }]}><View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: '700' }}>Post anonymously</Text><Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Your profile won't appear on the post.</Text></View><Switch accessibilityLabel="Post anonymously" value={anon} onValueChange={setAnon} /></View>
        </ScrollView>
        {create.isError ? <Text accessibilityRole="alert" style={{ color: colors.destructive, marginTop: 8 }}>{errorText(create.error)}</Text> : null}
        {hint ? <Text accessibilityLiveRegion="polite" style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 8 }}>{hint}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Publish post" accessibilityState={{ disabled: !ok, busy: create.isPending }} disabled={!ok} onPress={() => create.mutate({ data: { content: content.trim(), surface, communityTopic: surface === 'community' ? communityTopic ?? undefined : undefined, isAnonymous: anon, pollOptions: poll ? opts : undefined, mediaId: photo?.id } })} style={[s.publish, { backgroundColor: colors.primary, opacity: ok ? 1 : 0.5 }]}>
          {create.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>Share</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const s = StyleSheet.create({
  kicker: { color: 'hsl(42,90%,65%)', fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 8, alignSelf: 'center' },
  card: { flex: 1, borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  photo: { marginTop: 14, height: 300, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  option: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44 },
  publish: { marginTop: 14, borderRadius: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
