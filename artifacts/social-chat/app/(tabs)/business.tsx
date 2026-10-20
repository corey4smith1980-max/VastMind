import React, { useState } from 'react';
import { Pressable, Text, TextInput, Switch, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useCreateQuickReply } from '@workspace/api-client-react';
import { AppHeader, PageFrame, StorageNotice, SectionTitle } from '@/components/common';
import { SellerStudio } from '@/components/commerce/SellerStudio';
import { Segments } from '@/components/commerce/kit';
import { useColors } from '@/hooks/useColors';
import { useAppStore } from '@/state/AppStore';

export default function BusinessScreen() {
  const colors = useColors();
  const [tab, setTab] = useState<'studio' | 'inbox'>('studio');
  return <PageFrame>
    <AppHeader /><StorageNotice />
    <Text style={{ color: colors.foreground, fontSize: 30, fontWeight: '900', letterSpacing: -1, marginBottom: 12 }}>Business</Text>
    <Segments value={tab} options={[['studio', 'Shop studio'], ['inbox', 'Inbox & replies']] as const} onChange={setTab} />
    {tab === 'studio' ? <SellerStudio /> : <Inbox />}
  </PageFrame>;
}

function Inbox() {
  const colors = useColors();
  const { state, profile, business, quickReplies, run, sendMessage, toggleBusinessOpen } = useAppStore();
  const create = useCreateQuickReply();
  const [label, setLabel] = useState('');
  const [content, setContent] = useState('');
  const [recipient, setRecipient] = useState('');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);
  const input = { color: colors.foreground, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 14, marginBottom: 10 };
  return <View>
    <View style={{ backgroundColor: colors.forest, padding: 20, borderRadius: 22, marginBottom: 22, gap: 12 }}>
      <Text style={{ color: colors.primaryForeground, fontSize: 22 }}>{profile?.name}</Text>
      <Text style={{ color: colors.primaryForeground }}>Business inbox</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: colors.primaryForeground }}>{state.businessOpen ? 'Open for messages' : 'Away for now'}</Text><Switch accessibilityLabel="Open for messages" value={state.businessOpen} onValueChange={async () => { await toggleBusinessOpen(); }} /></View>
    </View>
    {business && <Text style={{ color: colors.mutedForeground, marginBottom: 24 }}>{business.unreadCustomerChats} unread customer chats · {business.totalCustomers} customers</Text>}
    <SectionTitle title="Quick replies" />
    <Text style={{ color: colors.mutedForeground, marginBottom: 12 }}>Choose a conversation, then send a saved reply.</Text>
    {state.conversations.map(chat => <Pressable key={chat.id} accessibilityRole="radio" accessibilityState={{ checked: recipient === chat.id }} onPress={() => { setRecipient(chat.id); setSent(''); }} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Feather name={recipient === chat.id ? 'check-circle' : 'circle'} size={16} color={recipient === chat.id ? colors.primary : colors.mutedForeground} />
      <Text style={{ color: recipient === chat.id ? colors.primary : colors.foreground }}>{chat.name}</Text>
    </Pressable>)}
    {quickReplies.map(reply => <Pressable key={reply.id} disabled={!recipient || busy} onPress={async () => { setBusy(true); setSent(''); if (await sendMessage(recipient, reply.content)) setSent(`Sent: ${reply.label}`); setBusy(false); }} style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16, borderRadius: 15, marginVertical: 6, opacity: !recipient ? 0.6 : 1 }}><Text style={{ color: colors.foreground, fontWeight: '700' }}>{reply.label}</Text><Text style={{ color: colors.mutedForeground, marginTop: 5 }}>{reply.content}</Text></Pressable>)}
    {!!sent && <Text style={{ color: colors.primary }}>{sent}</Text>}
    <SectionTitle title="Save a quick reply" />
    <TextInput accessibilityLabel="Reply label" placeholder="Label" placeholderTextColor={colors.mutedForeground} value={label} onChangeText={setLabel} style={input} />
    <TextInput accessibilityLabel="Reply text" placeholder="Reply text" placeholderTextColor={colors.mutedForeground} value={content} onChangeText={setContent} style={input} multiline />
    <Pressable disabled={create.isPending || !label.trim() || !content.trim()} onPress={async () => { if (await run(() => create.mutateAsync({ data: { label, content } }))) { setLabel(''); setContent(''); } }} style={{ padding: 16, borderRadius: 14, backgroundColor: colors.primary }}><Text style={{ color: colors.primaryForeground }}>{create.isPending ? 'Saving…' : 'Save reply'}</Text></Pressable>
  </View>;
}
