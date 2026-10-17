import React, { useState } from 'react';
import { Text, TextInput, Pressable } from 'react-native';
import { useCreateChannel } from '@workspace/api-client-react';
import { useRouter } from 'expo-router';
import { PageFrame, AppHeader, StorageNotice } from '@/components/common';
import { useAppStore } from '@/state/AppStore';
import { useColors } from '@/hooks/useColors';
export default function NewChannel() {
  const colors = useColors();
  const router = useRouter();
  const { run } = useAppStore();
  const create = useCreateChannel();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const input = { color: colors.foreground, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 15, marginVertical: 12 };
  return <PageFrame><AppHeader /><StorageNotice /><Pressable onPress={() => router.back()}><Text style={{ color: colors.primary }}>Back</Text></Pressable><Text style={{ color: colors.foreground, fontSize: 24, marginTop: 20 }}>Create a channel</Text><TextInput accessibilityLabel="Channel name" placeholder="Name" placeholderTextColor={colors.mutedForeground} value={name} onChangeText={setName} style={input} /><TextInput accessibilityLabel="Channel description" placeholder="Description" placeholderTextColor={colors.mutedForeground} value={description} onChangeText={setDescription} multiline style={input} /><Pressable disabled={create.isPending || name.trim().length < 2 || description.trim().length < 2} onPress={async () => { const channel = await run(() => create.mutateAsync({ data: { name, description } })); if (channel) router.replace(`/channel/${channel.id}`); }} style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 14 }}><Text style={{ color: colors.primaryForeground }}>{create.isPending ? 'Creating…' : 'Create'}</Text></Pressable></PageFrame>;
}
