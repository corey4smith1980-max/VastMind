import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, FeedPost } from '@/types';
import { initialState } from '@/data/seed';

const STORAGE_KEY = 'gather-app-state-v1';

type AppStoreValue = {
  state: AppState;
  storageError: boolean;
  sendMessage: (conversationId: string, text: string) => void;
  markConversationRead: (conversationId: string) => void;
  toggleLike: (postId: string) => void;
  addComment: (postId: string, text: string) => void;
  createPost: (text: string) => void;
  toggleChannelFollow: (channelId: string) => void;
  toggleBusinessOpen: () => void;
};

const AppStoreContext = createContext<AppStoreValue | null>(null);

const shortTime = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active || !stored) return;
        const parsed: unknown = JSON.parse(stored);
        if (
          parsed &&
          typeof parsed === 'object' &&
          'posts' in parsed &&
          'conversations' in parsed &&
          'channels' in parsed
        ) {
          setState(parsed as AppState);
        }
      })
      .catch(() => {
        if (active) setStorageError(true);
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => setStorageError(true));
  }, [hydrated, state]);

  const value = useMemo<AppStoreValue>(() => ({
    state,
    storageError,
    sendMessage: (conversationId, rawText) => {
      const text = rawText.trim();
      if (!text) return;
      const message = { id: `${Date.now()}`, text, time: shortTime(), mine: true };
      setState((current) => ({
        ...current,
        conversations: current.conversations.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, lastMessage: text, time: message.time, messages: [...conversation.messages, message] }
            : conversation,
        ),
      }));
    },
    markConversationRead: (conversationId) => {
      setState((current) => {
        const conversation = current.conversations.find((item) => item.id === conversationId);
        if (!conversation || conversation.unread === 0) return current;
        return {
          ...current,
          conversations: current.conversations.map((item) =>
            item.id === conversationId ? { ...item, unread: 0 } : item,
          ),
        };
      });
    },
    toggleLike: (postId) => {
      setState((current) => ({
        ...current,
        posts: current.posts.map((post) =>
          post.id === postId
            ? { ...post, liked: !post.liked, likes: Math.max(0, post.likes + (post.liked ? -1 : 1)) }
            : post,
        ),
      }));
    },
    addComment: (postId, rawText) => {
      const text = rawText.trim();
      if (!text) return;
      setState((current) => ({
        ...current,
        posts: current.posts.map((post) =>
          post.id === postId
            ? {
                ...post,
                comments: [...post.comments, { id: `${Date.now()}`, author: 'Amara', initials: 'AM', text }],
              }
            : post,
        ),
      }));
    },
    createPost: (rawText) => {
      const text = rawText.trim();
      if (!text) return;
      const post: FeedPost = {
        id: `${Date.now()}`,
        author: 'Amara Okafor',
        initials: 'AM',
        subtitle: 'Your community',
        time: 'Just now',
        text,
        image: null,
        likes: 0,
        liked: false,
        comments: [],
      };
      setState((current) => ({ ...current, posts: [post, ...current.posts] }));
    },
    toggleChannelFollow: (channelId) => {
      setState((current) => ({
        ...current,
        channels: current.channels.map((channel) =>
          channel.id === channelId ? { ...channel, followed: !channel.followed } : channel,
        ),
      }));
    },
    toggleBusinessOpen: () => {
      setState((current) => ({ ...current, businessOpen: !current.businessOpen }));
    },
  }), [state, storageError]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error('useAppStore must be used within AppStoreProvider');
  return value;
}
