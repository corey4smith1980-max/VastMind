import React, { useState } from 'react';
import { Pressable, Text, TextInput, View, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useSearchUsers, getSearchUsersQueryKey, useCreateChat, useGetSuggestedPeople, useToggleUserFollow } from '@workspace/api-client-react';
import { AppHeader, PageFrame, StorageNotice, Avatar } from '@/components/common';
import { initials, useAppStore } from '@/state/AppStore';
import { useColors } from '@/hooks/useColors';

export default function NewChat() {
  const colors = useColors();
  const router = useRouter();
  const { run } = useAppStore();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const users = useSearchUsers({ q: query }, { query: { queryKey: getSearchUsersQueryKey({ q: query }), enabled: !!query.trim() } });
  const suggestions = useGetSuggestedPeople();
  const follow = useToggleUserFollow();
  const create = useCreateChat();
  const source = query.trim() ? users : suggestions;
  const input = { color: colors.foreground, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 14, marginVertical: 8 };
  return <PageFrame>
    <AppHeader /><StorageNotice />
    <Pressable onPress={() => router.back()}><Text style={{ color: colors.primary }}>Back</Text></Pressable>
    <Text style={{ color: colors.foreground, fontSize: 25, marginVertical: 16 }}>Find your people</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ color: colors.foreground }}>Create a group</Text><Switch value={group} onValueChange={value => { setGroup(value); setSelected([]); }} /></View>
    {group && <TextInput accessibilityLabel="Group name" placeholder="Group name" placeholderTextColor={colors.mutedForeground} value={name} onChangeText={setName} style={input} />}
    <TextInput accessibilityLabel="Search people" placeholder="Search name or username" placeholderTextColor={colors.mutedForeground} value={query} onChangeText={setQuery} style={input} />
    {source.isPending && <Text style={{ color: colors.mutedForeground }}>Loading people…</Text>}
    {source.error && <Pressable onPress={() => void source.refetch()}><Text style={{ color: colors.destructive }}>{source.error.message} — Retry</Text></Pressable>}
    {source.data?.length === 0 && <Text style={{ color: colors.mutedForeground }}>No people found.</Text>}
    {source.data?.map(person => <View key={person.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
      <Avatar initials={initials(person.name)} size={40} />
      <Pressable style={{ flex: 1 }} onPress={() => setSelected(current => group ? current.includes(person.id) ? current.filter(id => id !== person.id) : [...current, person.id] : [person.id])}>
        <Text style={{ color: colors.foreground }}>{selected.includes(person.id) ? '✓ ' : ''}{person.name}</Text><Text style={{ color: colors.mutedForeground }}>@{person.username}</Text>
      </Pressable>
      <Pressable disabled={follow.isPending} onPress={() => void run(() => follow.mutateAsync({ userId: person.id }))}><Text style={{ color: colors.primary }}>{person.following ? 'Unfollow' : 'Follow'}</Text></Pressable>
    </View>)}
    <Pressable disabled={create.isPending || !selected.length || (group && !name.trim())} onPress={async () => {
      const chat = await run(() => create.mutateAsync({ data: { type: group ? 'group' : 'private', memberIds: selected, ...(group ? { name: name.trim() } : {}) } }));
      if (chat) router.replace(`/chat/${chat.id}`);
    }} style={{ padding: 16, marginTop: 15, borderRadius: 14, backgroundColor: colors.primary }}><Text style={{ color: colors.primaryForeground }}>{create.isPending ? 'Creating…' : 'Start conversation'}</Text></Pressable>
  </PageFrame>;
}
