import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState as NativeAppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '@workspace/api-client-react';
import { AppState } from '@/types';
import { useMobileRealtime } from '@/state/Realtime';
import { findVastMindEmoji } from '@/components/vastmind-emoji-data';

// Legacy drafts remain untouched at gather-app-state-v1. Never hydrate server
// identities or sample content from that device-local snapshot.
export const LEGACY_STORAGE_KEY = 'gather-app-state-v1';
export const initials = (name: string) => name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
export const time = (value: string | null) => value ? new Date(value).toLocaleString() : '';

function useServerStore() {
  const client = useQueryClient();
  const { presence } = useMobileRealtime();
  const profile = api.useGetMyProfile();
  const chats = api.useListChats(undefined, { query: { queryKey: api.getListChatsQueryKey(), refetchInterval: 10000 } });
  const feed = api.useGetFeed(undefined, { query: { queryKey: api.getGetFeedQueryKey(), refetchInterval: 10000 } });
  const channels = api.useListChannels(undefined, { query: { queryKey: api.getListChannelsQueryKey(), refetchInterval: 10000 } });
  const business = api.useGetBusinessOverview({ query: { queryKey: api.getGetBusinessOverviewQueryKey(), refetchInterval: 10000 } });
  const replies = api.useListQuickReplies();
  const send = api.useSendMessage();
  const read = api.useMarkChatRead();
  const react = api.useTogglePostReaction();
  const comment = api.useAddPostComment();
  const post = api.useCreatePost();
  const follow = api.useToggleChannelFollow();
  const status = api.useUpdateBusinessStatus();
  const [mutationError, setError] = useState('');
  const queries = [profile, chats, feed, channels, business, replies];
  const refresh = async () => { await client.invalidateQueries(); };
  useEffect(() => {
    const listener = NativeAppState.addEventListener('change', value => {
      if (value === 'active') void client.invalidateQueries();
    });
    return () => listener.remove();
  }, [client]);
  async function run<T>(operation: () => Promise<T>): Promise<T | undefined> {
    setError('');
    try { const result = await operation(); await refresh(); return result; }
    catch (error) { setError(error instanceof Error ? error.message : 'Request failed. Please retry.'); return undefined; }
  }
  const state: AppState = {
    conversations: (chats.data ?? []).map(chat => {
      const other = chat.members.find(m => m.user.id !== profile.data?.id)?.user;
      const name = chat.name || other?.name || 'Conversation';
      const sticker = chat.lastMessage ? findVastMindEmoji(chat.lastMessage) : undefined;
      return { id: chat.id, name, initials: initials(name), category: chat.type === 'group' ? 'group' : 'personal', lastMessage: sticker ? `Sticker · ${sticker.label}` : chat.lastMessage ?? '', time: time(chat.lastMessageAt), unread: chat.unreadCount, online: other ? (presence[other.id] ?? other.online) : false, messages: [] };
    }),
    posts: (feed.data ?? []).filter(p => !p.communityId && p.surface === 'community' && !!p.communityTopic).map(p => ({ id: p.id, authorId: p.isAnonymous ? undefined : p.author.id, isAnonymous: p.isAnonymous, author: p.isAnonymous ? 'Anonymous member' : p.author.name, initials: p.isAnonymous ? '?' : initials(p.author.name), subtitle: p.isAnonymous ? 'Posted anonymously' : `@${p.author.username}`, time: time(p.createdAt), text: p.content, image: null, likes: p.reactionsCount, liked: p.reacted, comments: [] })),
    channels: (channels.data ?? []).map(c => ({ id: c.id, name: c.name, initials: initials(c.name), category: c.owner.name, followers: String(c.subscriberCount), color: 'blue', followed: c.followed, description: c.description, updates: c.latestUpdate ? [{ id: c.latestUpdate.id, author: c.owner.name, text: c.latestUpdate.content, time: time(c.latestUpdate.createdAt) }] : [] })),
    businessOpen: business.data?.isOpen ?? false,
  };
  return {
    state, profile: profile.data, business: business.data, quickReplies: replies.data ?? [], rawChannels: channels.data ?? [],
    loading: queries.some(q => q.isPending), error: mutationError || queries.find(q => q.error)?.error?.message || '',
    storageError: false, refresh, run,
    sendMessage: (id: string, text: string, mediaId?:string, type?: 'text' | 'sticker') => run(() => send.mutateAsync({ chatId: id, data: { content: text.trim(),mediaId,type } })),
    markConversationRead: (id: string) => run(() => read.mutateAsync({ chatId: id })),
    toggleLike: (id: string) => run(() => react.mutateAsync({ postId: id, data: { reaction: 'like' } })),
    addComment: (id: string, text: string) => run(() => comment.mutateAsync({ postId: id, data: { content: text.trim() } })),
    createPost: (text: string, isAnonymous = false) => run(() => post.mutateAsync({ data: { content: text.trim(), surface: 'community', communityTopic: 'opportunity', isAnonymous } })),
    toggleChannelFollow: (id: string) => run(() => follow.mutateAsync({ channelId: id })),
    toggleBusinessOpen: () => run(() => status.mutateAsync({ data: { isOpen: !state.businessOpen } })),
  };
}
const AppStoreContext = createContext<ReturnType<typeof useServerStore> | null>(null);
export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const value = useServerStore();
  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}
export function useAppStore() {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error('useAppStore must be used within AppStoreProvider');
  return value;
}
