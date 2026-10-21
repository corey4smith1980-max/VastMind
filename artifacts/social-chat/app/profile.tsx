import React, { useState } from 'react';
import { Pressable, Text, TextInput, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Profile, useUpdateMyProfile, useUpdatePrivacySettings } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAppStore } from '@/state/AppStore';
import { AppHeader, PageFrame, StorageNotice } from '@/components/common';
import { useAppAuth } from '@/state/AuthContext';

export default function ProfileScreen() {
  const { profile } = useAppStore();
  return <PageFrame><AppHeader /><StorageNotice />{profile && <ProfileForm key={profile.id} profile={profile} />}</PageFrame>;
}
function ProfileForm({ profile }: { profile: Profile }) {
  const colors = useColors();
  const router = useRouter();
  const { signOut } = useAppAuth();
  const { run } = useAppStore();
  const update = useUpdateMyProfile();
  const privacyUpdate = useUpdatePrivacySettings();
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [status, setStatus] = useState(profile.status ?? '');
  const [privacy, setPrivacy] = useState(profile.privacy);
  const [saved, setSaved] = useState(false);
  return <View style={{ gap: 16 }}>
    <Pressable onPress={() => router.back()}><Text style={{ color: colors.primary }}>Back</Text></Pressable>
    <Text style={{ fontSize: 25, color: colors.foreground }}>Your profile</Text>
    <Text style={{ color: colors.mutedForeground }}>{profile.email}</Text>
    {([{ label: 'Name', value: name, set: setName }, { label: 'Username', value: username, set: setUsername }, { label: 'Bio', value: bio, set: setBio }, { label: 'Status', value: status, set: setStatus }]).map(field => <View key={field.label}><Text style={{ color: colors.foreground }}>{field.label}</Text><TextInput accessibilityLabel={field.label} value={field.value} onChangeText={v => { field.set(v); setSaved(false); }} style={{ borderWidth: 1, borderColor: colors.border, padding: 14, borderRadius: 14, color: colors.foreground, marginTop: 6 }} /></View>)}
    {(['showOnlineStatus', 'showLastSeen'] as const).map(key => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: colors.foreground }}>{key === 'showOnlineStatus' ? 'Show online status' : 'Show last seen'}</Text><Switch value={privacy[key]} onValueChange={value => { setPrivacy(p => ({ ...p, [key]: value })); setSaved(false); }} /></View>)}
    {(['allowMessagesFrom', 'profileVisibility'] as const).map(key => <View key={key}><Text style={{ color: colors.foreground }}>{key === 'allowMessagesFrom' ? 'Who can message you?' : 'Profile visibility'}</Text><View style={{ flexDirection: 'row', gap: 15, marginTop: 10 }}>{(['everyone', 'contacts', 'nobody'] as const).map(value => <Pressable key={value} onPress={() => { setPrivacy(p => ({ ...p, [key]: value })); setSaved(false); }}><Text style={{ color: privacy[key] === value ? colors.primary : colors.mutedForeground }}>{privacy[key] === value ? '✓ ' : ''}{value}</Text></Pressable>)}</View></View>)}
    <Pressable disabled={update.isPending || privacyUpdate.isPending} onPress={async () => {
      const result = await run(async () => { await update.mutateAsync({ data: { name, username, bio, status } }); return privacyUpdate.mutateAsync({ data: privacy }); });
      setSaved(!!result);
    }} style={{ padding: 16, borderRadius: 14, backgroundColor: colors.primary }}><Text style={{ color: colors.primaryForeground }}>{saved ? 'Saved' : 'Save profile & privacy'}</Text></Pressable>
    <Pressable onPress={async () => { await run(async () => { await signOut(); return true; }); }}><Text style={{ color: colors.destructive }}>Sign out</Text></Pressable>
  </View>;
}
