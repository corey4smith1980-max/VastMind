import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, Share, StyleSheet, Text, TextInput, View, type ViewToken } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEvent } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useAudioPlayer } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { getGetCreatorQueryKey, getListPostCommentsQueryKey, useAddPostComment, useListPostComments, useTogglePostReaction, useToggleUserFollow, type Post } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAppStore } from '@/state/AppStore';
import { ContentProducts } from '@/components/commerce/ContentProducts';
import { PostEntry } from '@/components/PostEntry';
import { activeCue, isClip, errorText, useAuthedMedia, useCaptionsPref, useWatchSession, webProfileLink } from '@/components/videoKit';

const INK = 'hsl(192,52%,9%)';
const compactCount = (n: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

function Soundtrack({ post, play, muted }: { post: Post; play: boolean; muted: boolean }) {
  const { source } = useAuthedMedia(post.audioMedia, true);
  const player = useAudioPlayer(source);
  useEffect(() => { player.loop = true; }, [player]);
  useEffect(() => {
    player.muted = muted;
    if (play && !muted && source) player.play(); else player.pause();
  }, [player, play, muted, source]);
  return null;
}

function CommentsSheet({ post, onClose, onAdded }: { post: Post; onClose: () => void; onAdded: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const list = useListPostComments(post.id, { query: { queryKey: getListPostCommentsQueryKey(post.id) } });
  const add = useAddPostComment({ mutation: { onSuccess: comment => { setText(''); onAdded(); queryClient.setQueryData(getListPostCommentsQueryKey(post.id), (old: typeof list.data) => old ? [...old, comment] : [comment]); } } });
  return <Modal visible animationType="slide" transparent onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(5,20,24,0.5)' }}>
      <View style={[s.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 12 }]}>
        <View style={s.rowBetween}><Text style={{ color: colors.foreground, fontSize: 19, fontWeight: '700' }}>The conversation</Text><Pressable accessibilityLabel="Close comments" onPress={onClose} style={s.hit}><Feather name="x" size={22} color={colors.foreground} /></Pressable></View>
        {list.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} accessibilityLabel="Loading comments" /> : null}
        {list.isError ? <Pressable onPress={() => void list.refetch()}><Text style={{ color: colors.destructive, marginVertical: 16 }}>Couldn't load the thread. Tap to retry.</Text></Pressable> : null}
        <FlatList style={{ maxHeight: 360 }} data={list.data ?? []} keyExtractor={c => c.id}
          ListEmptyComponent={!list.isLoading && !list.isError ? <Text style={{ color: colors.mutedForeground, marginVertical: 16 }}>Nothing here yet. Leave the first thoughtful note.</Text> : null}
          renderItem={({ item }) => <View style={{ paddingVertical: 8 }}><Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 13 }}>{item.author.name}</Text><Text style={{ color: colors.foreground, marginTop: 2, lineHeight: 20 }}>{item.content}</Text></View>} />
        {add.isError ? <Text style={{ color: colors.destructive }}>{errorText(add.error)}</Text> : null}
        <View style={[s.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 }]}>
          <TextInput accessibilityLabel="Write a comment" value={text} onChangeText={setText} maxLength={2000} placeholder="Add to the conversation" placeholderTextColor={colors.mutedForeground} style={{ flex: 1, minHeight: 44, color: colors.foreground }} />
          <Pressable accessibilityLabel="Send comment" disabled={!text.trim() || add.isPending} onPress={() => add.mutate({ postId: post.id, data: { content: text.trim() } })} style={[s.sendBtn, { backgroundColor: colors.primary, opacity: !text.trim() || add.isPending ? 0.5 : 1 }]}><Feather name="arrow-up" size={18} color={colors.primaryForeground} /></Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function ActionButton({ icon, label, count, onPress, tint, disabled }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; count?: number; onPress: () => void; tint?: string; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} style={{ alignItems: 'center', gap: 3 }}>
    <View style={s.action}><Feather name={icon} size={22} color={tint ?? '#f6efe4'} /></View>
    {count !== undefined ? <Text style={s.count}>{compactCount(count)}</Text> : null}
  </Pressable>;
}

export function ReelItem({ post, active, near, height, bottomInset }: { post: Post; active: boolean; near: boolean; height: number; bottomInset: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAppStore();
  const { source, error } = useAuthedMedia(post.media, near);
  const player = useVideoPlayer(source, p => { p.loop = true; p.timeUpdateEventInterval = 0.25; });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const timeEvent = useEvent(player, 'timeUpdate');
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ccOn, toggleCc] = useCaptionsPref();
  const [comments, setComments] = useState(false);
  const [stats, setStats] = useState({ reacted: post.reacted, reactions: post.reactionsCount, comments: post.commentsCount });
  const [heartBurst, setHeartBurst] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [following, setFollowing] = useState(post.author.following);
  const [note, setNote] = useState('');
  const session = useWatchSession(post.id, active);
  const lastTime = useRef(0);
  const lastSurfaceTap = useRef(0);
  const surfaceTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const time = timeEvent?.currentTime ?? 0;

  useEffect(() => { if (!active) setPaused(false); }, [active]);
  useEffect(() => {
    if (!source) return;
    if (active && !paused) player.play(); else player.pause();
  }, [active, paused, player, source]);
  useEffect(() => { player.muted = muted; }, [player, muted]);
  useEffect(() => { session.setPlaying(isPlaying && active); }, [isPlaying, active, session]);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
      if (surfaceTapTimer.current) clearTimeout(surfaceTapTimer.current);
      if (heartTimer.current) clearTimeout(heartTimer.current);
      heartScale.stopAnimation();
      heartOpacity.stopAnimation();
    };
  }, [heartOpacity, heartScale]);
  useEffect(() => {
    if (time + 0.5 < lastTime.current && lastTime.current > (player.duration || 0) - 1.5) session.markCompleted();
    lastTime.current = time;
  }, [time, player, session]);

  const react = useTogglePostReaction({ mutation: { onSuccess: r => setStats(st => ({ ...st, reacted: r.reacted, reactions: r.reactionsCount })), onError: e => setNote(errorText(e)) } });
  const follow = useToggleUserFollow({ mutation: {
    onSuccess: r => { setFollowing(r.following); void queryClient.invalidateQueries({ queryKey: getGetCreatorQueryKey(post.author.id) }); },
    onError: e => { setFollowing(post.author.following); setNote(errorText(e)); },
  } });
  const cue = ccOn ? activeCue(post.captions, time) : null;
  const openCreator = () => router.push({ pathname: '/creator/[id]', params: { id: post.author.id } });
  const share = () => void Share.share({ message: `${post.author.name} shares clips on VastMind: ${webProfileLink(post.author.username)}` }).catch(() => {});
  const showHeartBurst = () => {
    setHeartBurst(true);
    if (heartTimer.current) clearTimeout(heartTimer.current);
    if (reduceMotion) {
      heartScale.setValue(1);
      heartOpacity.setValue(1);
      heartTimer.current = setTimeout(() => { setHeartBurst(false); heartOpacity.setValue(0); }, 650);
      return;
    }
    heartScale.setValue(0.55);
    heartOpacity.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, friction: 4 }),
        Animated.timing(heartOpacity, { toValue: 1, duration: 110, useNativeDriver: true }),
      ]),
      Animated.delay(180),
      Animated.parallel([
        Animated.timing(heartScale, { toValue: 0.88, duration: 190, useNativeDriver: true }),
        Animated.timing(heartOpacity, { toValue: 0, duration: 190, useNativeDriver: true }),
      ]),
    ]).start(({ finished }) => { if (finished) setHeartBurst(false); });
  };
  const likeFromGesture = () => {
    showHeartBurst();
    // Double-tap always means "like"; it never removes an existing like.
    if (!stats.reacted && !react.isPending) react.mutate({ postId: post.id, data: { reaction: 'like' } });
  };
  const handleSurfaceTap = () => {
    const now = Date.now();
    if (lastSurfaceTap.current && now - lastSurfaceTap.current <= 300) {
      if (surfaceTapTimer.current) clearTimeout(surfaceTapTimer.current);
      surfaceTapTimer.current = null;
      lastSurfaceTap.current = 0;
      likeFromGesture();
      return;
    }
    lastSurfaceTap.current = now;
    surfaceTapTimer.current = setTimeout(() => {
      surfaceTapTimer.current = null;
      lastSurfaceTap.current = 0;
      setPaused(p => !p);
    }, 310);
  };

  return <View style={{ height, backgroundColor: INK }}>
    {source ? <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} accessibilityLabel={`Video by ${post.author.name}`} />
      : <View style={[StyleSheet.absoluteFill, s.center]}>{error ? <Text style={s.dim}>This clip isn't available. Pull to refresh.</Text> : <ActivityIndicator color="#f6efe4" accessibilityLabel="Loading clip" />}</View>}
    {post.audioMedia && near ? <Soundtrack post={post} play={active && isPlaying} muted={muted} /> : null}
     <Pressable accessibilityRole="button" accessibilityLabel={`${paused ? 'Play clip' : 'Pause clip'}. Double-tap to like.`} onPress={handleSurfaceTap} style={StyleSheet.absoluteFill}>
      {paused && active ? <View style={[StyleSheet.absoluteFill, s.center]}><View style={s.bigPlay}><Feather name="play" size={28} color="#f6efe4" /></View></View> : null}
    </Pressable>
    {cue ? <View pointerEvents="none" style={s.cueWrap}><Text style={s.cue}>{cue}</Text></View> : null}
     {heartBurst ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.likeBurst, { opacity: heartOpacity, transform: [{ scale: heartScale }] }]}><Feather name="heart" size={88} color="hsl(347,96%,61%)" /></Animated.View> : null}
    <View style={[s.meta, { paddingBottom: bottomInset + 18 }]} pointerEvents="box-none">
      <View style={s.row}>
        <Pressable accessibilityRole="link" accessibilityLabel={`Open ${post.author.name}'s profile`} onPress={openCreator} style={{ flexShrink: 1 }}>
          <Text style={s.name} numberOfLines={1}>{post.author.name}</Text><Text style={s.dim}>@{post.author.username}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={following ? `Unfollow ${post.author.name}` : `Follow ${post.author.name}`} disabled={follow.isPending} onPress={() => { setFollowing(f => !f); follow.mutate({ userId: post.author.id }); }} style={[s.pill, following ? null : { backgroundColor: 'rgba(246,239,228,0.16)' }]}>
          <Text style={{ color: '#f6efe4', fontSize: 12, fontWeight: '700' }}>{following ? 'Following' : 'Follow'}</Text>
        </Pressable>
      </View>
      <Text style={s.caption} numberOfLines={4}>{post.content}</Text>
      <View style={[s.row, { flexWrap: 'wrap', marginTop: 8 }]}>
        <Text style={s.tag}>{post.effect === 'none' ? 'Original look' : `${post.effect} look`}</Text>
        <Text style={s.tag} numberOfLines={1}>{post.audioMedia ? `Creator's sound · ${post.audioMedia.name}` : 'Original sound'}</Text>
      </View>
      <ContentProducts postId={post.id} isAuthor={profile?.id === post.author.id} tone="dark" enabled={near} />
      {note ? <Text style={{ color: 'hsl(42,90%,70%)', marginTop: 6 }} onPress={() => setNote('')}>{note}</Text> : null}
    </View>
    <View style={[s.rail, { bottom: bottomInset + 20 }]}>
      <ActionButton icon={muted ? 'volume-x' : 'volume-2'} label={muted ? 'Turn sound on' : 'Mute sound'} onPress={() => setMuted(m => !m)} />
      {post.captions?.length ? <ActionButton icon="type" label={ccOn ? 'Hide captions' : 'Show captions'} tint={ccOn ? 'hsl(42,90%,65%)' : undefined} onPress={toggleCc} /> : null}
      <ActionButton icon="heart" label={`${stats.reacted ? 'Unlike clip' : 'Like clip'}, ${stats.reactions} likes`} count={stats.reactions} tint={stats.reacted ? 'hsl(347,96%,61%)' : undefined} disabled={react.isPending} onPress={() => { if (!stats.reacted) showHeartBurst(); react.mutate({ postId: post.id, data: { reaction: 'like' } }); }} />
      <ActionButton icon="message-circle" label={`View ${stats.comments} comments`} count={stats.comments} onPress={() => setComments(true)} />
      <ActionButton icon="share" label="Share creator link" onPress={share} />
    </View>
    {comments ? <CommentsSheet post={post} onClose={() => setComments(false)} onAdded={() => setStats(st => ({ ...st, comments: st.comments + 1 }))} /> : null}
  </View>;
}

/** Vertical paged clips. Only the visible item plays and only while `focused`. */
export function ReelPager({ items, focused, onEndReached, footer, initialIndex = 0, bottomInset = 0, onRefresh, refreshing }: {
  items: Post[]; focused: boolean; onEndReached: () => void; footer?: React.ReactElement | null; initialIndex?: number; bottomInset?: number; onRefresh?: () => void; refreshing?: boolean;
}) {
  const [height, setHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find(v => v.isViewable && v.index !== null);
    if (first?.index != null) setActiveIndex(first.index);
  }).current;
  const viewability = useMemo(() => ({ itemVisiblePercentThreshold: 80 }), []);
  const getItemLayout = useCallback((_: unknown, index: number) => ({ length: height, offset: height * index, index }), [height]);
  return <View style={{ flex: 1, backgroundColor: INK }} onLayout={e => setHeight(Math.round(e.nativeEvent.layout.height))}>
    {height > 0 ? <FlatList data={items} keyExtractor={p => p.id} pagingEnabled showsVerticalScrollIndicator={false} decelerationRate="fast" snapToInterval={height} snapToAlignment="start"
      initialScrollIndex={initialIndex < items.length ? initialIndex : 0} getItemLayout={getItemLayout} windowSize={3} maxToRenderPerBatch={2} initialNumToRender={2}
      onViewableItemsChanged={onViewable} viewabilityConfig={viewability} onEndReached={onEndReached} onEndReachedThreshold={1.5}
      onRefresh={onRefresh} refreshing={refreshing ?? false} ListFooterComponent={footer}
      renderItem={({ item, index }) => !isClip(item) ? <PostEntry post={item} height={height} near={Math.abs(index - activeIndex) <= 1} bottomInset={bottomInset} /> : <ReelItem post={item} height={height} active={focused && index === activeIndex} near={Math.abs(index - activeIndex) <= 1} bottomInset={bottomInset} />} /> : null}
  </View>;
}

const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  hit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bigPlay: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  cueWrap: { position: 'absolute', left: 24, right: 24, top: '56%', alignItems: 'center' },
  cue: { backgroundColor: 'rgba(0,0,0,0.72)', color: '#f6efe4', fontSize: 16, fontWeight: '600', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, overflow: 'hidden', textAlign: 'center' },
  meta: { position: 'absolute', left: 0, right: 76, bottom: 0, paddingHorizontal: 18 },
  name: { color: '#f6efe4', fontWeight: '700', fontSize: 15 },
  dim: { color: 'rgba(246,239,228,0.7)', fontSize: 12 },
  pill: { borderWidth: 1, borderColor: 'rgba(246,239,228,0.45)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, minHeight: 32, justifyContent: 'center' },
  caption: { color: '#f6efe4', fontSize: 15, lineHeight: 21, marginTop: 10, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 6 },
  tag: { color: 'rgba(246,239,228,0.85)', fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', borderWidth: 1, borderColor: 'rgba(246,239,228,0.3)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, overflow: 'hidden', maxWidth: 220 },
  rail: { position: 'absolute', right: 12, alignItems: 'center', gap: 14 },
  likeBurst: { alignItems: 'center', justifyContent: 'center', zIndex: 4 },
  action: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  count: { color: '#f6efe4', fontSize: 12, fontWeight: '700' },
});
