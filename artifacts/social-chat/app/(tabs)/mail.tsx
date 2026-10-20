import React, { useEffect, useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as api from '@workspace/api-client-react';
import type { MailContact, MailMessage, MailThread } from '@workspace/api-client-react';
import {
  clearMailIdentityMemory,
  createRecoveryPhrase,
  decryptMailEnvelope,
  deriveMailIdentity,
  encryptMailForRecipient,
  getMailKeyFingerprint,
} from '@workspace/mail-crypto';
import type { MailIdentity } from '@workspace/mail-crypto';
import { useColors } from '@/hooks/useColors';
import { useAppStore } from '@/state/AppStore';
import { loadMailIdentity, saveMailIdentity } from '@/lib/mail-key-store';

type MailBox = 'inbox' | 'sent' | 'archived';
type DecodedMessage = { id: string; subject: string; body: string; trusted: true } | { id: string; body: string; trusted: false };

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export default function MailScreen() {
  const colors = useColors();
  const client = useQueryClient();
  const { profile } = useAppStore();
  const accountQuery = api.useGetMailAccount();
  const account = accountQuery.data;
  const registerKeys = api.useRegisterMailKeys();
  const createThread = api.useCreateMailThread();
  const sendMessage = api.useSendMailMessage();
  const markRead = api.useMarkMailThreadRead();
  const archiveThread = api.useSetMailThreadArchived();

  const [box, setBox] = useState<MailBox>('inbox');
  const [identity, setIdentity] = useState<MailIdentity | null>(null);
  const [identityState, setIdentityState] = useState<'checking' | 'ready' | 'missing' | 'mismatch'>('checking');
  const [phrase, setPhrase] = useState('');
  const [phraseGenerated, setPhraseGenerated] = useState(false);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [restorePhrase, setRestorePhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [screenError, setScreenError] = useState('');
  const [selected, setSelected] = useState<MailThread | null>(null);
  const [decoded, setDecoded] = useState<DecodedMessage[]>([]);
  const [showSecurity, setShowSecurity] = useState(false);
  const [verifiedContacts, setVerifiedContacts] = useState<Set<string>>(() => new Set());
  const [composeOpen, setComposeOpen] = useState(false);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [recipient, setRecipient] = useState<MailContact | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const threadsQuery = api.useListMailThreads({ box }, {
    query: { queryKey: api.getListMailThreadsQueryKey({ box }), enabled: identityState === 'ready', refetchInterval: 12000 },
  });
  const searchValue = recipientQuery.trim();
  const recipientParams = { q: searchValue.length >= 2 ? searchValue : '__' };
  const recipientsQuery = api.useSearchMailRecipients(recipientParams, {
    query: {
      queryKey: api.getSearchMailRecipientsQueryKey(recipientParams),
      enabled: composeOpen && identityState === 'ready' && searchValue.length >= 2 && !recipient,
    },
  });
  const messagesQuery = api.useListMailMessages(selected?.id ?? '', { limit: 50 }, {
    query: {
      queryKey: api.getListMailMessagesQueryKey(selected?.id ?? '', { limit: 50 }),
      enabled: Boolean(selected?.id) && identityState === 'ready',
      refetchInterval: 12000,
    },
  });

  useEffect(() => {
    let active = true;
    if (!accountQuery.data || !profile?.id) return () => { active = false; };
    if (!accountQuery.data.keyReady || !accountQuery.data.encryptionPublicKey || !accountQuery.data.signingPublicKey) {
      setIdentityState('missing');
      return () => { active = false; };
    }
    setIdentityState('checking');
    void loadMailIdentity(profile.id).then((localIdentity) => {
      if (!active) {
        if (localIdentity) clearMailIdentityMemory(localIdentity);
        return;
      }
      if (!localIdentity) {
        setIdentity(null);
        setIdentityState('missing');
        return;
      }
      const matches = localIdentity.encryptionPublicKey === accountQuery.data?.encryptionPublicKey
        && localIdentity.signingPublicKey === accountQuery.data?.signingPublicKey;
      if (!matches) {
        clearMailIdentityMemory(localIdentity);
        setIdentity(null);
        setIdentityState('mismatch');
        return;
      }
      setIdentity(localIdentity);
      setIdentityState('ready');
    }).catch((error: unknown) => {
      if (!active) return;
      setScreenError(errorText(error));
      setIdentityState('missing');
    });
    return () => { active = false; };
  }, [accountQuery.data, profile?.id]);

  useEffect(() => () => {
    if (identity) clearMailIdentityMemory(identity);
  }, [identity]);

  useEffect(() => {
    let active = true;
    setDecoded([]);
    if (!identity || !profile?.id || !selected?.id || !messagesQuery.data?.items) return () => { active = false; };
    const source = messagesQuery.data.items;
    void Promise.all(source.map(async (message: MailMessage): Promise<DecodedMessage> => {
      try {
        const clear = await decryptMailEnvelope({
          identity,
          threadId: message.threadId,
          senderId: message.senderId,
          recipientId: profile.id,
          senderSigningPublicKey: message.senderSigningPublicKey,
          envelope: message.envelope,
        });
        return { id: message.id, subject: clear.subject, body: clear.body, trusted: true };
      } catch {
        return { id: message.id, body: 'This message could not be verified or decrypted. Its contents are hidden.', trusted: false };
      }
    })).then((result) => { if (active) setDecoded(result); });
    return () => { active = false; };
  }, [identity, messagesQuery.data, profile?.id, selected?.id]);

  const threads = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data]);
  const decodedById = useMemo(() => new Map(decoded.map((message) => [message.id, message])), [decoded]);
  const currentAddress = account?.address ?? (profile?.username ? `${profile.username}@vastmind.com` : 'your VastMind address');

  async function provisionMail() {
    if (!phrase || !savedConfirmed) return;
    setBusy(true);
    setScreenError('');
    let derived: MailIdentity | null = null;
    try {
      derived = await deriveMailIdentity(phrase);
      await registerKeys.mutateAsync({ data: {
        encryptionPublicKey: derived.encryptionPublicKey,
        signingPublicKey: derived.signingPublicKey,
      } });
      if (!profile?.id) throw new Error('Your VastMind profile could not be loaded. Try again.');
      await saveMailIdentity(profile.id, derived);
      setIdentity(derived);
      setIdentityState('ready');
      setPhrase('');
      setSavedConfirmed(false);
      await client.invalidateQueries({ queryKey: api.getGetMailAccountQueryKey() });
    } catch (error) {
      if (derived && identity !== derived) clearMailIdentityMemory(derived);
      setScreenError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function restoreMail() {
    if (!profile?.id || !account?.encryptionPublicKey || !account.signingPublicKey) return;
    setBusy(true);
    setScreenError('');
    let restored: MailIdentity | null = null;
    try {
      restored = await deriveMailIdentity(restorePhrase);
      if (
        restored.encryptionPublicKey !== account.encryptionPublicKey
        || restored.signingPublicKey !== account.signingPublicKey
      ) {
        clearMailIdentityMemory(restored);
        restored = null;
        throw new Error('Those keys do not match this account. Check the phrase and try again.');
      }
      await saveMailIdentity(profile.id, restored);
      setIdentity(restored);
      setIdentityState('ready');
      setRestorePhrase('');
    } catch (error) {
      if (restored) clearMailIdentityMemory(restored);
      setScreenError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  function openThread(thread: MailThread) {
    setSelected(thread);
    setDecoded([]);
    if (thread.unreadCount > 0) {
      void markRead.mutateAsync({ threadId: thread.id })
        .then(() => client.invalidateQueries({ queryKey: api.getListMailThreadsQueryKey({ box }) }))
        .catch((error: unknown) => setScreenError(errorText(error)));
    }
  }

  async function submitMessage() {
    if (!identity || !profile?.id || !recipient || (!subject.trim() && !body.trim())) return;
    setBusy(true);
    setScreenError('');
    try {
      const thread = await createThread.mutateAsync({ data: { address: recipient.address } });
      const cleartext = { subject: subject.trim(), body: body.trim() };
      const [toRecipient, senderCopy] = await Promise.all([
        encryptMailForRecipient({
          identity,
          threadId: thread.id,
          senderId: profile.id,
          recipientId: recipient.userId,
          recipientEncryptionPublicKey: recipient.encryptionPublicKey,
          cleartext,
        }),
        encryptMailForRecipient({
          identity,
          threadId: thread.id,
          senderId: profile.id,
          recipientId: profile.id,
          recipientEncryptionPublicKey: identity.encryptionPublicKey,
          cleartext,
        }),
      ]);
      await sendMessage.mutateAsync({ threadId: thread.id, data: { envelopes: [toRecipient, senderCopy] } });
      setComposeOpen(false);
      setRecipient(null);
      setRecipientQuery('');
      setSubject('');
      setBody('');
      setSelected(thread);
      setBox('sent');
      await client.invalidateQueries({ queryKey: api.getListMailThreadsQueryKey({ box: 'sent' }) });
      await client.invalidateQueries({ queryKey: api.getListMailMessagesQueryKey(thread.id, { limit: 50 }) });
    } catch (error) {
      setScreenError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive(thread: MailThread) {
    setScreenError('');
    try {
      await archiveThread.mutateAsync({ threadId: thread.id, data: { archived: !thread.archived } });
      await client.invalidateQueries({ queryKey: api.getListMailThreadsQueryKey({ box }) });
      if (selected?.id === thread.id) setSelected(null);
    } catch (error) {
      setScreenError(errorText(error));
    }
  }

  function markContactCompared(contactId: string) {
    setVerifiedContacts((current) => {
      const next = new Set(current);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  function closeComposer() {
    setComposeOpen(false);
    setRecipient(null);
    setRecipientQuery('');
    setSubject('');
    setBody('');
  }

  if (accountQuery.isPending || identityState === 'checking') {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.page}>
          <View style={styles.header}><Text style={[styles.kicker, { color: colors.mutedForeground }]}>VASTMIND / PRIVATE MAIL</Text></View>
          <View style={[styles.skeletonHero, { backgroundColor: colors.secondary }]} />
          <View style={[styles.skeletonLine, { backgroundColor: colors.secondary, width: '72%' }]} />
          <View style={[styles.skeletonLine, { backgroundColor: colors.secondary, width: '91%' }]} />
          <View style={[styles.skeletonCard, { backgroundColor: colors.card, borderColor: colors.border }]} />
        </View>
      </View>
    );
  }

  if (accountQuery.isError) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.background }]}>
        <Feather name="cloud-off" size={28} color={colors.coral} />
        <Text style={[styles.stateTitle, { color: colors.foreground }]}>Mail could not load</Text>
        <Text style={[styles.stateCopy, { color: colors.mutedForeground }]}>{errorText(accountQuery.error)}</Text>
        <Pressable onPress={() => void accountQuery.refetch()} style={[styles.primaryButton, { backgroundColor: colors.forest }]}><Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Try again</Text></Pressable>
      </View>
    );
  }

  if (identityState !== 'ready' || !identity) {
    const registeredAlready = Boolean(account?.keyReady && account.encryptionPublicKey && account.signingPublicKey);
    return (
      <ScrollView style={[styles.root, { backgroundColor: colors.background }]} contentContainerStyle={styles.setupPage} keyboardShouldPersistTaps="handled">
        <Text style={[styles.kicker, { color: colors.mutedForeground }]}>VASTMIND / INTERNAL MAIL</Text>
        <Text style={[styles.setupTitle, { color: colors.forest }]}>{registeredAlready ? 'Restore your mail keys' : 'Your inbox, kept on your device'}</Text>
        <Text style={[styles.setupCopy, { color: colors.mutedForeground }]}>
          {registeredAlready
            ? 'This account already has mail keys. Enter the recovery phrase you saved when mail was set up; we will compare the derived public keys exactly before unlocking.'
            : 'Create your internal address and a recovery phrase. The phrase is shown here once and never sent to VastMind.'}
        </Text>
        {registeredAlready ? (
          <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.inputLabel, { color: colors.foreground }]}>24-word recovery phrase</Text>
            <TextInput
              testID="mail-restore-phrase"
              accessibilityLabel="Recovery phrase"
              value={restorePhrase}
              onChangeText={setRestorePhrase}
              placeholder="Enter your recovery words in order"
              placeholderTextColor={colors.mutedForeground}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, styles.phraseInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            />
            <Pressable disabled={busy || !restorePhrase.trim()} onPress={() => void restoreMail()} style={[styles.primaryButton, { backgroundColor: colors.forest, opacity: busy || !restorePhrase.trim() ? 0.5 : 1 }]}>
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{busy ? 'Checking keys…' : 'Verify and unlock'}</Text>
            </Pressable>
          </View>
        ) : phrase ? (
          <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.phraseHeader}><Feather name="key" size={17} color={colors.blue} /><Text style={[styles.panelTitle, { color: colors.foreground }]}>Your recovery phrase</Text></View>
            <Text style={[styles.phraseText, { color: colors.foreground }]} selectable>{phrase}</Text>
            <Text style={[styles.helperCopy, { color: colors.mutedForeground }]}>Write these words down in order and keep them somewhere private. Anyone with this phrase can derive your mail keys.</Text>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: savedConfirmed }} onPress={() => setSavedConfirmed(!savedConfirmed)} style={styles.checkRow}>
              <View style={[styles.checkbox, { borderColor: savedConfirmed ? colors.blue : colors.border, backgroundColor: savedConfirmed ? colors.blue : 'transparent' }]}>{savedConfirmed ? <Feather name="check" size={13} color={colors.primaryForeground} /> : null}</View>
              <Text style={[styles.checkCopy, { color: colors.foreground }]}>I have saved this phrase and can use it to restore my keys.</Text>
            </Pressable>
            <Pressable disabled={busy || !savedConfirmed} onPress={() => void provisionMail()} style={[styles.primaryButton, { backgroundColor: colors.forest, opacity: busy || !savedConfirmed ? 0.48 : 1 }]}>
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{busy ? 'Creating your mailbox…' : 'Create mail keys'}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.addressPill}><Feather name="at-sign" size={15} color={colors.blue} /><Text style={[styles.addressText, { color: colors.foreground }]}>{currentAddress}</Text></View>
            <Text style={[styles.helperCopy, { color: colors.mutedForeground }]}>This is a VastMind-only alias. It is not a public email address and cannot send to or receive from outside VastMind.</Text>
            <Pressable disabled={phraseGenerated} onPress={() => { setPhrase(createRecoveryPhrase()); setPhraseGenerated(true); }} style={[styles.primaryButton, { backgroundColor: colors.forest, opacity: phraseGenerated ? 0.5 : 1 }]}>
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Generate recovery phrase</Text>
            </Pressable>
          </View>
        )}
        <View style={[styles.securityBox, { backgroundColor: colors.secondary }]}>
          <Feather name="info" size={16} color={colors.blue} />
          <Text style={[styles.securityCopy, { color: colors.foreground }]}>Mail uses a static account key with HPKE envelopes and sender signatures. It does not provide Signal-style forward secrecy or a Double Ratchet. Keys cannot be reset without losing access to old encrypted mail. Participants, sender, and timestamps remain visible to VastMind servers. There is no key-transparency service; a compromised server could substitute a first-contact key.</Text>
        </View>
        {screenError ? <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.coral }]}>{screenError}</Text> : null}
      </ScrollView>
    );
  }

  const threadMessages = messagesQuery.data?.items ?? [];
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.page}>
        <View style={styles.header}>
          <View><Text style={[styles.kicker, { color: colors.mutedForeground }]}>VASTMIND / PRIVATE MAIL</Text><Text style={[styles.heading, { color: colors.forest }]}>{selected ? selected.contact.name : 'Mail'}</Text></View>
          {selected ? (
            <Pressable accessibilityRole="button" accessibilityLabel={selected.archived ? 'Restore thread' : 'Archive thread'} onPress={() => void toggleArchive(selected)} style={[styles.headerAction, { backgroundColor: colors.secondary }]}>
              <Feather name={selected.archived ? 'inbox' : 'archive'} size={18} color={colors.forest} />
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Compose mail" testID="mail-compose" onPress={() => setComposeOpen(true)} style={[styles.headerAction, { backgroundColor: colors.lime }]}>
              <Feather name="edit-3" size={18} color={colors.forest} />
            </Pressable>
          )}
        </View>

        {!selected ? (
          <>
            <View style={[styles.mailAddressCard, { backgroundColor: colors.forest }]}>
              <View style={styles.addressCardTop}><Text style={styles.addressCardLabel}>YOUR INTERNAL ADDRESS</Text><Feather name="lock" size={15} color={colors.lime} /></View>
              <Text style={[styles.mailAddress, { color: colors.primaryForeground }]}>{currentAddress}</Text>
              <Text style={styles.addressCardFoot}>VastMind members only · no external delivery</Text>
            </View>
            <Pressable onPress={() => setShowSecurity(!showSecurity)} style={[styles.disclosure, { borderColor: colors.border }]}>
              <View style={styles.disclosureTitle}><Feather name="shield" size={16} color={colors.blue} /><Text style={[styles.disclosureText, { color: colors.foreground }]}>Security & recovery</Text></View>
              <Feather name={showSecurity ? 'chevron-up' : 'chevron-down'} size={17} color={colors.mutedForeground} />
            </Pressable>
            {showSecurity ? (
              <View style={[styles.securityBox, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.securityCopy, { color: colors.foreground }]}>Messages are encrypted on this device with HPKE and signed by the sender. Keys are static per account: there is no Signal-style forward secrecy or Double Ratchet. Resetting keys means losing access to old encrypted mail. Participants, sender, and timestamps remain visible to VastMind servers. This is not an anonymity feature. There is no key-transparency service: the API prevents ordinary key replacement, but a compromised server could substitute a first-contact public key.</Text>
                <Text style={[styles.fingerprint, { color: colors.mutedForeground }]}>KEY FINGERPRINT  {getMailKeyFingerprint(identity)}</Text>
                <Text style={[styles.securityCopy, { color: colors.foreground, marginTop: 9 }]}>Your BIP39 recovery phrase is the only way to restore these keys on another device.</Text>
              </View>
            ) : null}
            <View style={styles.boxTabs}>
              {(['inbox', 'sent', 'archived'] as MailBox[]).map((item) => {
                const active = box === item;
                return <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setBox(item)} style={[styles.boxTab, { backgroundColor: active ? colors.forest : colors.secondary }]}><Text style={[styles.boxTabText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{item[0].toUpperCase() + item.slice(1)}</Text></Pressable>;
              })}
            </View>
            {screenError ? <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.coral }]}>{screenError}</Text> : null}
            {threadsQuery.isPending ? (
              <View style={styles.threadSkeletonList}>{[0, 1, 2].map((item) => <View key={item} style={[styles.threadSkeleton, { backgroundColor: colors.secondary }]} />)}</View>
            ) : threadsQuery.isError ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="cloud-off" size={22} color={colors.coral} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Threads could not load</Text><Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>{errorText(threadsQuery.error)}</Text><Pressable onPress={() => void threadsQuery.refetch()}><Text style={[styles.retryText, { color: colors.blue }]}>Retry</Text></Pressable></View>
            ) : threads.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="mail" size={23} color={colors.blue} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{box === 'inbox' ? 'A quiet inbox' : `No ${box} mail`}</Text><Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>{box === 'inbox' ? 'Start a one-to-one note with a VastMind member who has activated mail.' : 'Threads will appear here when available.'}</Text><Pressable onPress={() => setComposeOpen(true)} style={[styles.smallButton, { backgroundColor: colors.secondary }]}><Text style={[styles.smallButtonText, { color: colors.forest }]}>Write a note</Text></Pressable></View>
            ) : (
              <ScrollView style={styles.threadList} showsVerticalScrollIndicator={false}>
                {threads.map((thread) => {
                  const lastMessage = thread.lastMessage;
                  return (
                    <Pressable key={thread.id} accessibilityRole="button" onPress={() => openThread(thread)} style={[styles.threadRow, { borderBottomColor: colors.border }]}>
                      <View style={[styles.avatar, { backgroundColor: colors.secondary }]}><Text style={[styles.avatarText, { color: colors.forest }]}>{thread.contact.name.slice(0, 1).toUpperCase()}</Text></View>
                      <View style={styles.threadDetails}>
                        <View style={styles.threadTop}><Text numberOfLines={1} style={[styles.contactName, { color: colors.foreground }]}>{thread.contact.name}</Text><Text style={[styles.timestamp, { color: colors.mutedForeground }]}>{lastMessage ? new Date(lastMessage.createdAt).toLocaleDateString() : new Date(thread.updatedAt).toLocaleDateString()}</Text></View>
                        <Text style={[styles.threadAddress, { color: colors.mutedForeground }]}>@{thread.contact.username} · {thread.contact.address}</Text>
                        <Text style={[styles.cipherHint, { color: colors.mutedForeground }]}>{lastMessage ? 'Encrypted message · open to decrypt' : 'No messages yet'}</Text>
                        <Text style={[styles.fingerprint, { color: verifiedContacts.has(thread.contact.userId) ? colors.blue : colors.coral }]}>{verifiedContacts.has(thread.contact.userId) ? 'COMPARED OUT OF BAND' : 'UNVERIFIED KEY'}  {getMailKeyFingerprint(thread.contact)}</Text>
                      </View>
                      {thread.unreadCount > 0 ? <View style={[styles.unreadDot, { backgroundColor: colors.blue }]} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </>
        ) : (
          <>
            <View style={styles.threadSubhead}>
              <Pressable onPress={() => { setSelected(null); setDecoded([]); }} style={styles.backButton}><Feather name="arrow-left" size={17} color={colors.forest} /><Text style={[styles.backText, { color: colors.forest }]}>{box}</Text></Pressable>
              <View style={{ alignItems: 'flex-end', maxWidth: '62%' }}><Text numberOfLines={1} style={[styles.threadAddress, { color: colors.mutedForeground }]}>{selected.contact.address}</Text><Text style={[styles.fingerprint, { color: verifiedContacts.has(selected.contact.userId) ? colors.blue : colors.coral, textAlign: 'right' }]}>{verifiedContacts.has(selected.contact.userId) ? 'COMPARED OUT OF BAND' : 'UNVERIFIED KEY'} · {getMailKeyFingerprint(selected.contact)}</Text></View>
            </View>
            <View style={[styles.trustNotice, { backgroundColor: colors.secondary }]}><Feather name="alert-triangle" size={14} color={colors.coral} /><View style={{ flex: 1 }}><Text style={[styles.trustNoticeText, { color: colors.foreground }]}>Compare this full fingerprint with {selected.contact.name} through a separate trusted channel. First-contact keys are not independently authenticated. This comparison mark is local to this screen session.</Text><Pressable onPress={() => markContactCompared(selected.contact.userId)} style={styles.compareAction}><Text style={[styles.compareActionText, { color: colors.blue }]}>{verifiedContacts.has(selected.contact.userId) ? 'Remove comparison mark' : 'I compared this fingerprint out of band'}</Text></Pressable></View></View>
            {screenError ? <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.coral }]}>{screenError}</Text> : null}
            {messagesQuery.isPending ? (
              <View style={styles.threadSkeletonList}><View style={[styles.messageSkeleton, { backgroundColor: colors.secondary }]} /><View style={[styles.messageSkeleton, styles.messageSkeletonRight, { backgroundColor: colors.secondary }]} /></View>
            ) : messagesQuery.isError ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Messages could not load</Text><Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>{errorText(messagesQuery.error)}</Text><Pressable onPress={() => void messagesQuery.refetch()}><Text style={[styles.retryText, { color: colors.blue }]}>Retry</Text></Pressable></View>
            ) : (
              <ScrollView style={styles.messageList} contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
                {threadMessages.length === 0 ? <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>No messages in this thread</Text><Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>Mail supports one-to-one text only.</Text></View> : threadMessages.map((message) => {
                  const item = decodedById.get(message.id);
                  const mine = message.senderId === profile?.id;
                  return (
                    <View key={message.id} style={[styles.messageBlock, mine ? styles.messageBlockRight : null]}>
                      <Text style={[styles.messageMeta, { color: colors.mutedForeground }]}>{message.senderName} · {new Date(message.createdAt).toLocaleString()}</Text>
                      {!item ? <View style={[styles.messageBubble, { backgroundColor: colors.secondary }]}><View style={[styles.skeletonLine, { backgroundColor: colors.border, width: '54%' }]} /><View style={[styles.skeletonLine, { backgroundColor: colors.border, width: '82%' }]} /></View> : item.trusted ? (
                        <View style={[styles.messageBubble, { backgroundColor: mine ? colors.forest : colors.card, borderColor: colors.border }]}>
                          <Text style={[styles.messageSubject, { color: mine ? colors.primaryForeground : colors.foreground }]}>{item.subject}</Text>
                          <Text style={[styles.messageBody, { color: mine ? colors.primaryForeground : colors.foreground }]}>{item.body}</Text>
                        </View>
                      ) : (
                        <View style={[styles.untrustedBubble, { backgroundColor: colors.secondary, borderColor: colors.coral }]}>
                          <Feather name="alert-triangle" size={15} color={colors.coral} />
                          <View style={{ flex: 1 }}><Text style={[styles.untrustedTitle, { color: colors.foreground }]}>Untrusted message</Text><Text style={[styles.messageBody, { color: colors.mutedForeground }]}>{item.body}</Text></View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
            <Pressable onPress={() => { setRecipient(selected.contact); setSubject(decoded.filter((message) => message.trusted).at(-1)?.subject ? `Re: ${decoded.filter((message) => message.trusted).at(-1)?.subject}` : ''); setComposeOpen(true); }} style={[styles.readOnlyNotice, { backgroundColor: colors.secondary }]}><Feather name="corner-up-left" size={14} color={colors.blue} /><Text style={[styles.readOnlyText, { color: colors.mutedForeground }]}>Reply to {selected.contact.name}</Text></Pressable>
          </>
        )}
      </View>

      <Modal visible={composeOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeComposer}>
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}><View><Text style={[styles.kicker, { color: colors.mutedForeground }]}>NEW MESSAGE</Text><Text style={[styles.modalTitle, { color: colors.forest }]}>Write a note</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close composer" onPress={closeComposer} style={[styles.closeButton, { backgroundColor: colors.secondary }]}><Feather name="x" size={18} color={colors.forest} /></Pressable></View>
          <View style={[styles.modalNotice, { backgroundColor: colors.secondary }]}><Feather name="lock" size={15} color={colors.blue} /><Text style={[styles.modalNoticeText, { color: colors.foreground }]}>Internal VastMind mail only. One recipient. Text only.</Text></View>
          <Text style={[styles.inputLabel, { color: colors.foreground }]}>To</Text>
          {recipient ? (
            <>
              <View style={[styles.selectedRecipient, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.avatar, { backgroundColor: colors.secondary }]}><Text style={[styles.avatarText, { color: colors.forest }]}>{recipient.name.slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={[styles.contactName, { color: colors.foreground }]}>{recipient.name}</Text><Text style={[styles.threadAddress, { color: colors.mutedForeground }]}>{recipient.address}</Text><Text style={[styles.fingerprint, { color: colors.coral }]}>UNVERIFIED · {getMailKeyFingerprint(recipient)}</Text></View><Pressable accessibilityLabel="Change recipient" onPress={() => setRecipient(null)}><Feather name="x-circle" size={19} color={colors.mutedForeground} /></Pressable></View>
              <View style={[styles.trustNotice, { backgroundColor: colors.secondary }]}><Feather name="alert-triangle" size={14} color={colors.coral} /><View style={{ flex: 1 }}><Text style={[styles.trustNoticeText, { color: colors.foreground }]}>Compare this full key fingerprint out of band. There is no key-transparency service; a compromised server could substitute a first-contact key. Comparison marks are local to this screen session.</Text><Pressable onPress={() => markContactCompared(recipient.userId)} style={styles.compareAction}><Text style={[styles.compareActionText, { color: colors.blue }]}>{verifiedContacts.has(recipient.userId) ? 'Remove comparison mark' : 'I compared this fingerprint out of band'}</Text></Pressable></View></View>
            </>
          ) : (
            <>
              <View style={[styles.searchField, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="search" size={16} color={colors.mutedForeground} /><TextInput testID="mail-recipient-search" accessibilityLabel="Find a mail recipient" value={recipientQuery} onChangeText={setRecipientQuery} placeholder="Search activated mail members" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" style={[styles.searchInput, { color: colors.foreground }]} /></View>
              {searchValue.length > 0 && searchValue.length < 2 ? <Text style={[styles.helperCopy, { color: colors.mutedForeground, marginTop: 8 }]}>Enter at least two characters to search.</Text> : null}
              {recipientsQuery.isPending && recipientsQuery.fetchStatus === 'fetching' ? <Text style={[styles.helperCopy, { color: colors.mutedForeground, marginTop: 10 }]}>Searching VastMind mail users…</Text> : null}
              {recipientsQuery.isError ? <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.coral }]}>{errorText(recipientsQuery.error)}</Text> : null}
              {recipientsQuery.data?.map((contact) => <Pressable key={contact.userId} onPress={() => setRecipient(contact)} style={[styles.recipientRow, { borderBottomColor: colors.border }]}><View style={[styles.avatar, { backgroundColor: colors.secondary }]}><Text style={[styles.avatarText, { color: colors.forest }]}>{contact.name.slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={[styles.contactName, { color: colors.foreground }]}>{contact.name}</Text><Text style={[styles.threadAddress, { color: colors.mutedForeground }]}>{contact.address}</Text><Text style={[styles.fingerprint, { color: verifiedContacts.has(contact.userId) ? colors.blue : colors.coral }]}>{verifiedContacts.has(contact.userId) ? 'COMPARED OUT OF BAND' : 'UNVERIFIED KEY'} · {getMailKeyFingerprint(contact)}</Text></View><Feather name="arrow-up-right" size={16} color={colors.blue} /></Pressable>)}
              {searchValue.length >= 2 && !recipientsQuery.isPending && !recipientsQuery.isError && recipientsQuery.data?.length === 0 ? <Text style={[styles.helperCopy, { color: colors.mutedForeground, marginTop: 10 }]}>No activated mail accounts matched that search.</Text> : null}
            </>
          )}
          <Text style={[styles.inputLabel, { color: colors.foreground, marginTop: 18 }]}>Subject</Text>
          <TextInput testID="mail-subject" accessibilityLabel="Subject" value={subject} onChangeText={setSubject} maxLength={160} placeholder="A short subject" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
          <Text style={[styles.inputLabel, { color: colors.foreground, marginTop: 15 }]}>Message</Text>
          <TextInput testID="mail-body" accessibilityLabel="Message text" value={body} onChangeText={setBody} maxLength={4000} placeholder="Write your message…" placeholderTextColor={colors.mutedForeground} multiline textAlignVertical="top" style={[styles.input, styles.bodyInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
          {screenError ? <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.coral }]}>{screenError}</Text> : null}
          <Pressable testID="mail-send" accessibilityRole="button" disabled={busy || !recipient || !subject.trim() || !body.trim()} onPress={() => void submitMessage()} style={[styles.primaryButton, styles.sendButton, { backgroundColor: colors.forest, opacity: busy || !recipient || !subject.trim() || !body.trim() ? 0.45 : 1 }]}>
            <Feather name="send" size={16} color={colors.primaryForeground} /><Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{busy ? 'Encrypting and sending…' : 'Encrypt and send'}</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { flex: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  setupPage: { paddingHorizontal: 22, paddingTop: 56, paddingBottom: 48 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 19 },
  kicker: { fontSize: 10, letterSpacing: 1.45, fontWeight: '800' },
  heading: { fontSize: 30, fontWeight: '800', letterSpacing: -1, marginTop: 5 },
  headerAction: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  mailAddressCard: { borderRadius: 20, padding: 19, marginBottom: 15 },
  addressCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addressCardLabel: { color: 'rgba(255,255,255,0.64)', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  mailAddress: { fontSize: 19, fontWeight: '700', letterSpacing: -0.4, marginTop: 12 },
  addressCardFoot: { color: 'rgba(255,255,255,0.66)', fontSize: 11, marginTop: 7 },
  disclosure: { minHeight: 48, paddingVertical: 10, paddingHorizontal: 2, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  disclosureTitle: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  disclosureText: { fontSize: 13, fontWeight: '700' },
  securityBox: { borderRadius: 15, padding: 14, marginTop: 11, flexDirection: 'row', gap: 9 },
  securityCopy: { flex: 1, fontSize: 12, lineHeight: 18 },
  fingerprint: { fontSize: 8, lineHeight: 12, marginTop: 4, letterSpacing: 0.15 },
  boxTabs: { flexDirection: 'row', gap: 8, marginTop: 17, marginBottom: 8 },
  boxTab: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 13 },
  boxTabText: { fontSize: 12, fontWeight: '700' },
  threadList: { flex: 1 },
  threadRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800' },
  threadDetails: { flex: 1, paddingVertical: 13 },
  threadTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  contactName: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  timestamp: { fontSize: 10, fontWeight: '600' },
  threadAddress: { fontSize: 10, marginTop: 4 },
  cipherHint: { fontSize: 11, marginTop: 5 },
  trustNotice: { flexDirection: 'row', gap: 8, padding: 11, borderRadius: 13, marginTop: 10, marginBottom: 8 },
  trustNoticeText: { flex: 1, fontSize: 10, lineHeight: 15 },
  compareAction: { alignSelf: 'flex-start', marginTop: 7, paddingVertical: 3 },
  compareActionText: { fontSize: 10, fontWeight: '800' },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  emptyCard: { padding: 24, marginTop: 16, borderRadius: 18, borderWidth: 1, alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  emptyCopy: { fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: 'center' },
  smallButton: { marginTop: 15, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 10 },
  smallButtonText: { fontSize: 12, fontWeight: '700' },
  retryText: { fontSize: 13, fontWeight: '700', marginTop: 12 },
  threadSubhead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(100,100,100,0.18)' },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  backText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  messageList: { flex: 1, paddingTop: 15 },
  messageBlock: { alignSelf: 'flex-start', maxWidth: '91%', marginBottom: 18 },
  messageBlockRight: { alignSelf: 'flex-end' },
  messageMeta: { fontSize: 10, marginBottom: 6 },
  messageBubble: { borderRadius: 17, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, minWidth: 170 },
  messageSubject: { fontSize: 14, fontWeight: '700', marginBottom: 7 },
  messageBody: { fontSize: 13, lineHeight: 19 },
  untrustedBubble: { borderRadius: 16, borderWidth: 1, padding: 13, flexDirection: 'row', gap: 9, maxWidth: '100%' },
  untrustedTitle: { fontSize: 12, fontWeight: '800', marginBottom: 4 },
  readOnlyNotice: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, marginTop: 5, marginBottom: 7 },
  readOnlyText: { fontSize: 10 },
  threadSkeletonList: { paddingTop: 12, gap: 12 },
  threadSkeleton: { height: 70, borderRadius: 15 },
  messageSkeleton: { height: 82, width: '74%', borderRadius: 16 },
  messageSkeletonRight: { alignSelf: 'flex-end', width: '62%' },
  skeletonHero: { height: 130, borderRadius: 20, marginTop: 28, marginBottom: 22 },
  skeletonLine: { height: 10, borderRadius: 6, marginBottom: 12 },
  skeletonCard: { height: 180, borderRadius: 18, borderWidth: 1, marginTop: 26 },
  stateTitle: { fontSize: 19, fontWeight: '800', marginTop: 15 },
  stateCopy: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7, marginBottom: 18 },
  primaryButton: { minHeight: 47, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, paddingHorizontal: 17, marginTop: 15 },
  primaryButtonText: { fontSize: 13, fontWeight: '800' },
  setupTitle: { fontSize: 31, lineHeight: 37, letterSpacing: -1.2, fontWeight: '800', marginTop: 13 },
  setupCopy: { fontSize: 14, lineHeight: 21, marginTop: 10, marginBottom: 21 },
  panel: { borderWidth: 1, borderRadius: 20, padding: 17 },
  addressPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(110,130,160,0.08)', borderRadius: 12, padding: 11 },
  addressText: { fontSize: 13, fontWeight: '700' },
  helperCopy: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  phraseHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelTitle: { fontSize: 14, fontWeight: '800' },
  phraseText: { fontSize: 17, lineHeight: 27, letterSpacing: 0.3, marginTop: 15, fontWeight: '600' },
  checkRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 16 },
  checkbox: { width: 21, height: 21, borderWidth: 1.5, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  checkCopy: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  inputLabel: { fontSize: 12, fontWeight: '800', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, fontSize: 13 },
  phraseInput: { minHeight: 106, textAlignVertical: 'top', lineHeight: 20 },
  errorText: { fontSize: 12, lineHeight: 17, marginTop: 10 },
  modalRoot: { flex: 1, paddingHorizontal: 20, paddingTop: 27, paddingBottom: 30 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  modalTitle: { fontSize: 25, letterSpacing: -0.7, fontWeight: '800', marginTop: 4 },
  closeButton: { width: 37, height: 37, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  modalNotice: { borderRadius: 13, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  modalNoticeText: { fontSize: 11, fontWeight: '600', flex: 1 },
  searchField: { borderWidth: 1, borderRadius: 13, minHeight: 45, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 12 },
  selectedRecipient: { minHeight: 61, borderRadius: 14, borderWidth: 1, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  recipientRow: { minHeight: 59, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  bodyInput: { minHeight: 115, paddingTop: 12 },
  sendButton: { marginTop: 'auto', marginBottom: 8 },
});
