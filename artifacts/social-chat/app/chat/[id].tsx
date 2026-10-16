import React, { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/common';
import { useColors } from '@/hooks/useColors';
import { useAppStore } from '@/state/AppStore';
import { Message } from '@/types';

export default function ChatDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, sendMessage, markConversationRead } = useAppStore();
  const conversation = state.conversations.find((item) => item.id === id);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (conversation) markConversationRead(conversation.id);
  }, [conversation?.id]);

  if (!conversation) {
    return <View style={[styles.missing, { backgroundColor: colors.background }]}><Text style={[styles.missingTitle, { color: colors.forest }]}>Conversation not found</Text><Pressable onPress={() => router.back()}><Text style={[styles.backText, { color: colors.forest }]}>Go back</Text></Pressable></View>;
  }

  const send = () => {
    if (!draft.trim()) return;
    sendMessage(conversation.id, draft);
    setDraft('');
  };
  const messages = [...conversation.messages].reverse();

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior="padding" keyboardVerticalOffset={0}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.headerButton}><Feather name="arrow-left" size={21} color={colors.forest} /></Pressable>
        <Avatar initials={conversation.initials} size={40} tone={conversation.category === 'customer' ? 'lime' : conversation.category === 'group' ? 'gold' : 'coral'} online={conversation.online} />
        <View style={styles.headerText}><View style={styles.nameRow}><Text style={[styles.name, { color: colors.forest }]}>{conversation.name}</Text>{conversation.verified ? <Feather name="check-circle" size={14} color={colors.blue} /> : null}</View><Text style={[styles.status, { color: colors.mutedForeground }]}>{conversation.category === 'group' ? 'Group conversation' : conversation.online ? 'Active now' : 'Tap for contact info'}</Text></View>
      </View>
      <FlatList<Message>
        data={messages}
        inverted
        keyExtractor={(message) => message.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.messageList}
        renderItem={({ item }) => (
          <View style={[styles.messageRow, item.mine ? styles.mineRow : styles.theirRow]}>
            <View style={[styles.bubble, item.mine ? { backgroundColor: colors.forest } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <Text style={[styles.messageText, { color: item.mine ? colors.primaryForeground : colors.foreground }]}>{item.text}</Text>
              <View style={styles.messageTimeRow}><Text style={[styles.messageTime, { color: item.mine ? colors.primaryForeground : colors.mutedForeground }]}>{item.time}</Text>{item.mine ? <Feather name="check" size={12} color={colors.lime} /> : null}</View>
            </View>
          </View>
        )}
        ListHeaderComponent={<View style={styles.listEnd}><Text style={[styles.datePill, { backgroundColor: colors.secondary, color: colors.mutedForeground }]}>Today</Text></View>}
      />
      <View style={[styles.composerWrap, { backgroundColor: colors.background, paddingBottom: Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 10) }]}>
        {conversation.category === 'customer' ? <View style={styles.quickActions}><Pressable onPress={() => setDraft('Thanks for reaching out! ')} style={[styles.quickChip, { backgroundColor: colors.secondary }]}><Feather name="zap" size={12} color={colors.forest} /><Text style={[styles.quickChipText, { color: colors.forest }]}>Quick reply</Text></Pressable></View> : null}
        <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput accessibilityLabel="Write a message" testID="message-input" placeholder="Write a message…" placeholderTextColor={colors.mutedForeground} value={draft} onChangeText={setDraft} onSubmitEditing={send} returnKeyType="send" style={[styles.input, { color: colors.foreground }]} />
          <Pressable accessibilityLabel="Send message" testID="send-message" onPress={send} disabled={!draft.trim()} style={[styles.sendButton, { backgroundColor: draft.trim() ? colors.lime : colors.secondary }]}><Feather name="arrow-up" size={18} color={draft.trim() ? colors.forest : colors.mutedForeground} /></Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 68, paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerButton: { minWidth: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontSize: 14, fontWeight: '700' },
  status: { fontSize: 10 },
  messageList: { paddingHorizontal: 15, paddingVertical: 16, flexGrow: 1, justifyContent: 'flex-end' },
  messageRow: { width: '100%', marginVertical: 4, flexDirection: 'row' },
  mineRow: { justifyContent: 'flex-end' },
  theirRow: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '83%', paddingHorizontal: 13, paddingTop: 10, paddingBottom: 7, borderRadius: 17 },
  messageText: { fontSize: 14, lineHeight: 20 },
  messageTimeRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 3 },
  messageTime: { fontSize: 9 },
  listEnd: { alignItems: 'center', paddingVertical: 12 },
  datePill: { overflow: 'hidden', borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10, fontSize: 10, fontWeight: '600' },
  composerWrap: { paddingHorizontal: 12, paddingTop: 8 },
  quickActions: { flexDirection: 'row', gap: 7, marginBottom: 8 },
  quickChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  quickChipText: { fontSize: 10, fontWeight: '600' },
  composer: { minHeight: 49, borderWidth: 1, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 7 },
  attach: { width: 31, height: 36, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 42, fontSize: 14, paddingVertical: 8 },
  sendButton: { width: 35, height: 35, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  missingTitle: { fontSize: 18, fontWeight: '700' },
  backText: { fontSize: 14, fontWeight: '600' },
});
