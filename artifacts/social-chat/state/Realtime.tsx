import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAppAuth } from '@/state/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';

type Typer = { userId: string; name: string };
type LiveState = {
  status: 'connecting' | 'live' | 'offline';
  presence: Record<string, boolean>;
  typing: Record<string, Typer[]>;
  joinChat: (id: string) => () => void;
  sendTyping: (id: string, value: boolean) => void;
};
const LiveContext = createContext<LiveState | null>(null);

/** Tokens are refreshed for each connection; HTTP polling remains a fallback. */
export function MobileRealtimeProvider({ children }: { children: React.ReactNode }) {
  const { getToken, userId } = useAppAuth();
  const client = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const rooms = useRef(new Set<string>());
  const [status, setStatus] = useState<LiveState['status']>('connecting');
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [typing, setTyping] = useState<Record<string, Typer[]>>({});

  useEffect(() => {
    if (!userId || !process.env.EXPO_PUBLIC_DOMAIN) return;
    setPresence({}); setTyping({}); setStatus('connecting');
    const socket = io(`https://${process.env.EXPO_PUBLIC_DOMAIN}`, {
      path: '/api/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      auth: callback => {
        void getToken().then(token => callback(token ? { token } : {})).catch(() => callback({}));
      },
    });
    socketRef.current = socket;
    const expirations = new Map<string, ReturnType<typeof setTimeout>>();
    socket.on('connect', () => {
      setStatus('live'); setPresence({});
      rooms.current.forEach(chatId => socket.emit('chat:join', { chatId }));
      void client.invalidateQueries();
    });
    socket.on('disconnect', reason => {
      setStatus('offline'); setTyping({});
      if (reason === 'io server disconnect' && AppState.currentState === 'active') socket.connect();
    });
    socket.on('connect_error', () => setStatus('offline'));
    socket.on('data:changed', (event: { entity?: string; chatId?: string }) => {
      if (event.entity === 'profile' || event.entity === 'users') setPresence({});
      const prefixes = event.chatId ? [`/api/chats/${event.chatId}/messages`, '/api/chats', '/api/notifications'] : null;
      void client.invalidateQueries(prefixes ? { predicate: q => prefixes.some(prefix => String(q.queryKey[0]).startsWith(prefix)) } : undefined);
    });
    socket.on('presence', (event: { userId: string; online: boolean }) => {
      if (typeof event.userId === 'string' && typeof event.online === 'boolean') setPresence(old => ({ ...old, [event.userId]: event.online }));
    });
    socket.on('typing', (event: { chatId: string; userId: string; name: string; isTyping: boolean }) => {
      if (event.userId === userId || typeof event.chatId !== 'string') return;
      const key = `${event.chatId}:${event.userId}`;
      const previous = expirations.get(key);
      if (previous) clearTimeout(previous);
      const remove = () => {
        setTyping(old => ({ ...old, [event.chatId]: (old[event.chatId] ?? []).filter(p => p.userId !== event.userId) }));
        expirations.delete(key);
      };
      if (!event.isTyping) return remove();
      setTyping(old => ({ ...old, [event.chatId]: [...(old[event.chatId] ?? []).filter(p => p.userId !== event.userId), { userId: event.userId, name: event.name }] }));
      expirations.set(key, setTimeout(remove, 6000));
    });
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') socket.connect();
      else socket.disconnect();
    });
    return () => {
      listener.remove();
      expirations.forEach(clearTimeout);
      socket.removeAllListeners(); socket.disconnect();
      socketRef.current = null; rooms.current.clear();
    };
  }, [client, getToken, userId]);

  const joinChat = useCallback((chatId: string) => {
    rooms.current.add(chatId);
    socketRef.current?.emit('chat:join', { chatId });
    return () => { rooms.current.delete(chatId); };
  }, []);
  const sendTyping = useCallback((chatId: string, isTyping: boolean) => {
    socketRef.current?.emit('typing', { chatId, isTyping });
  }, []);
  return <LiveContext.Provider value={{ status, presence, typing, joinChat, sendTyping }}>{children}</LiveContext.Provider>;
}

export function useMobileRealtime() {
  const value = useContext(LiveContext);
  if (!value) throw new Error('Realtime provider is missing');
  return value;
}
