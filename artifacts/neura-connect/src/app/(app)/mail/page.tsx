"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, ArrowLeft, ChevronRight, CircleAlert, Clock3, Inbox, KeyRound,
  LockKeyhole, Mail as MailIcon, Plus, RefreshCw, Search, Send, ShieldCheck,
  ShieldQuestion, Undo2, UserRound, X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMailAccountQueryKey, getListMailMessagesQueryKey, getListMailThreadsQueryKey,
  getSearchMailRecipientsQueryKey, useCreateMailThread, useGetMailAccount,
  useListMailMessages, useListMailThreads, useMarkMailThreadRead,
  useRegisterMailKeys, useSearchMailRecipients, useSendMailMessage,
  useSetMailThreadArchived,
} from "@workspace/api-client-react";
import type { MailContact, MailThread } from "@workspace/api-client-react";
import {
  clearMailIdentityMemory, createRecoveryPhrase, decryptMailEnvelope,
  deriveMailIdentity, encryptMailForRecipient, getMailKeyFingerprint,
  type MailCleartext, type MailIdentity,
} from "@workspace/mail-crypto";
import { loadMailIdentity, saveMailIdentity } from "@/lib/mail-key-store";
import { useMe } from "@/lib/me";

type Box = "inbox" | "sent" | "archived";
type Decrypted = { status: "trusted"; content: MailCleartext } | { status: "untrusted" };

const boxLabels: Record<Box, string> = { inbox: "Inbox", sent: "Sent", archived: "Archived" };
const errorText = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";
const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(date);
};

export default function MailPage() {
  const me = useMe();
  const queryClient = useQueryClient();
  const account = useGetMailAccount({ query: { queryKey: getGetMailAccountQueryKey() } });
  const registerKeys = useRegisterMailKeys();
  const createThread = useCreateMailThread();
  const sendMessage = useSendMailMessage();
  const markRead = useMarkMailThreadRead();
  const setArchived = useSetMailThreadArchived();
  const identityRef = useRef<MailIdentity | null>(null);
  const [identityReady, setIdentityReady] = useState(false);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [identityError, setIdentityError] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [phraseAcknowledged, setPhraseAcknowledged] = useState(false);
  const [restorePhrase, setRestorePhrase] = useState("");
  const [restoreMode, setRestoreMode] = useState(false);
  const [phraseBusy, setPhraseBusy] = useState(false);
  const [box, setBox] = useState<Box>("inbox");
  const [activeId, setActiveId] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [recipientQuery, setRecipientQuery] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<MailContact | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [draftError, setDraftError] = useState("");
  const [decrypted, setDecrypted] = useState<Record<string, Decrypted>>({});
  const [operationError, setOperationError] = useState("");
  const [busy, setBusy] = useState(false);
  const readMarkedRef = useRef(new Set<string>());
  const markReadMutateRef = useRef(markRead.mutate);
  markReadMutateRef.current = markRead.mutate;

  const threadsQueryKey = useMemo(() => getListMailThreadsQueryKey({ box }), [box]);
  const threads = useListMailThreads({ box }, { query: { queryKey: threadsQueryKey, refetchInterval: 12000 } });
  const activeThread = threads.data?.find((thread) => thread.id === activeId) ?? null;
  const messagesQueryKey = useMemo(() => getListMailMessagesQueryKey(activeId, { limit: 100 }), [activeId]);
  const messages = useListMailMessages(activeId, { limit: 100 }, {
    query: { enabled: !!activeId && identityReady, queryKey: messagesQueryKey, refetchInterval: 12000 },
  });
  const recipients = useSearchMailRecipients({ q: recipientQuery.trim() }, {
    query: {
      enabled: composeOpen && !selectedRecipient && recipientQuery.trim().length >= 2 && identityReady,
      queryKey: getSearchMailRecipientsQueryKey({ q: recipientQuery.trim() }),
    },
  });

  useEffect(() => {
    let cancelled = false;
    setIdentityLoading(true);
    setIdentityReady(false);
    if (identityRef.current) clearMailIdentityMemory(identityRef.current);
    identityRef.current = null;
    setDecrypted({});
    setIdentityError("");
    if (!account.data) {
      setIdentityLoading(false);
      return;
    }
    if (!account.data.keyReady || !account.data.encryptionPublicKey || !account.data.signingPublicKey) {
      setIdentityLoading(false);
      return;
    }
    loadMailIdentity(me.id).then((local) => {
      if (cancelled) return;
      if (!local) {
        setRestoreMode(true);
        setIdentityLoading(false);
        return;
      }
      if (local.encryptionPublicKey !== account.data?.encryptionPublicKey || local.signingPublicKey !== account.data?.signingPublicKey) {
        clearMailIdentityMemory(local);
        setRestoreMode(true);
        setIdentityError("The keys on this device do not match this account. Restore with the recovery phrase registered to this address.");
        setIdentityLoading(false);
        return;
      }
      identityRef.current = local;
      setIdentityReady(true);
      setRestoreMode(false);
      setIdentityLoading(false);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setRestoreMode(true);
      setIdentityError(errorText(error));
      setIdentityLoading(false);
    });
    return () => { cancelled = true; };
  }, [account.data, me.id]);

  useEffect(() => () => {
    if (identityRef.current) clearMailIdentityMemory(identityRef.current);
    identityRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const identity = identityRef.current;
    if (!identity || !messages.data?.items) {
      setDecrypted({});
      return;
    }
    const items = messages.data.items;
    (async () => {
      const results: Record<string, Decrypted> = {};
      for (const message of items) {
        try {
          const content = await decryptMailEnvelope({
            identity,
            threadId: message.threadId,
            senderId: message.senderId,
            recipientId: me.id,
            senderSigningPublicKey: message.senderSigningPublicKey,
            envelope: message.envelope,
          });
          results[message.id] = { status: "trusted", content };
        } catch {
          results[message.id] = { status: "untrusted" };
        }
      }
      if (!cancelled) setDecrypted(results);
    })();
    return () => { cancelled = true; };
  }, [messages.data, me.id, identityReady]);

  useEffect(() => {
    if (activeThread?.unreadCount && !readMarkedRef.current.has(activeThread.id)) {
      readMarkedRef.current.add(activeThread.id);
      markReadMutateRef.current({ threadId: activeThread.id }, {
        onSuccess: () => {
          readMarkedRef.current.delete(activeThread.id);
          queryClient.invalidateQueries({ queryKey: threadsQueryKey });
        },
        onError: () => readMarkedRef.current.delete(activeThread.id),
      });
    }
  }, [activeThread?.id, activeThread?.unreadCount, queryClient, threadsQueryKey]);

  const saveAndUnlock = async (identity: MailIdentity) => {
    try {
      await saveMailIdentity(me.id, identity);
      identityRef.current = identity;
      setIdentityReady(true);
      setRestoreMode(false);
      setIdentityLoading(false);
      setIdentityError("");
      setDecrypted({});
      queryClient.invalidateQueries({ queryKey: getGetMailAccountQueryKey() });
    } catch (error) {
      clearMailIdentityMemory(identity);
      throw error;
    }
  };

  const generatePhrase = () => {
    setIdentityError("");
    setPhraseAcknowledged(false);
    setRecoveryPhrase(createRecoveryPhrase());
  };

  const createAccountKeys = async () => {
    if (!recoveryPhrase || !phraseAcknowledged) return;
    setPhraseBusy(true);
    setIdentityError("");
    let identity: MailIdentity | null = null;
    try {
      identity = await deriveMailIdentity(recoveryPhrase);
      const registered = await registerKeys.mutateAsync({ data: {
        encryptionPublicKey: identity.encryptionPublicKey,
        signingPublicKey: identity.signingPublicKey,
      } });
      if (registered.encryptionPublicKey !== identity.encryptionPublicKey || registered.signingPublicKey !== identity.signingPublicKey) {
        throw new Error("The server returned keys that do not match this recovery phrase. The local identity was not saved.");
      }
      await saveAndUnlock(identity);
      identity = null;
      setRecoveryPhrase("");
      setPhraseAcknowledged(false);
    } catch (error) {
      if (identity) clearMailIdentityMemory(identity);
      setIdentityError(errorText(error));
    } finally {
      setPhraseBusy(false);
    }
  };

  const restoreKeys = async () => {
    setPhraseBusy(true);
    setIdentityError("");
    let identity: MailIdentity | null = null;
    try {
      if (!account.data?.encryptionPublicKey || !account.data.signingPublicKey) {
        throw new Error("This account has no registered mail keys to restore.");
      }
      identity = await deriveMailIdentity(restorePhrase);
      if (
        identity.encryptionPublicKey !== account.data.encryptionPublicKey ||
        identity.signingPublicKey !== account.data.signingPublicKey
      ) {
        throw new Error("These keys do not match the public keys registered to this account. Check the phrase and try again.");
      }
      await saveAndUnlock(identity);
      identity = null;
      setRestorePhrase("");
    } catch (error) {
      if (identity) clearMailIdentityMemory(identity);
      setIdentityError(errorText(error));
    } finally {
      setPhraseBusy(false);
    }
  };

  const openThread = (thread: MailThread) => {
    setActiveId(thread.id);
    setOperationError("");
  };

  const startCompose = () => {
    setComposeOpen(true);
    setSelectedRecipient(null);
    setRecipientQuery("");
    setSubject("");
    setBody("");
    setDraftError("");
  };

  const send = async () => {
    const identity = identityRef.current;
    if (!identity || !selectedRecipient) return;
    if (!subject.trim() && !body.trim()) {
      setDraftError("Add a subject or message before sending.");
      return;
    }
    setBusy(true);
    setDraftError("");
    try {
      const thread = await createThread.mutateAsync({ data: { address: selectedRecipient.address } });
      const cleartext: MailCleartext = { subject: subject.trim(), body: body.trim() };
      const [toRecipient, senderCopy] = await Promise.all([
        encryptMailForRecipient({
          identity, threadId: thread.id, senderId: me.id, recipientId: selectedRecipient.userId,
          recipientEncryptionPublicKey: selectedRecipient.encryptionPublicKey, cleartext,
        }),
        encryptMailForRecipient({
          identity, threadId: thread.id, senderId: me.id, recipientId: me.id,
          recipientEncryptionPublicKey: identity.encryptionPublicKey, cleartext,
        }),
      ]);
      await sendMessage.mutateAsync({ threadId: thread.id, data: { envelopes: [toRecipient, senderCopy] } });
      setComposeOpen(false);
      setActiveId(thread.id);
      setBox("sent");
      setSubject("");
      setBody("");
      setSelectedRecipient(null);
      setRecipientQuery("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListMailThreadsQueryKey({ box: "sent" }) }),
        queryClient.invalidateQueries({ queryKey: getListMailThreadsQueryKey({ box: "inbox" }) }),
        queryClient.invalidateQueries({ queryKey: getListMailMessagesQueryKey(thread.id, { limit: 100 }) }),
      ]);
    } catch (error) {
      setDraftError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async (thread: MailThread) => {
    setOperationError("");
    try {
      await setArchived.mutateAsync({ threadId: thread.id, data: { archived: !thread.archived } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListMailThreadsQueryKey({ box: "inbox" }) }),
        queryClient.invalidateQueries({ queryKey: getListMailThreadsQueryKey({ box: "sent" }) }),
        queryClient.invalidateQueries({ queryKey: getListMailThreadsQueryKey({ box: "archived" }) }),
      ]);
      setActiveId("");
    } catch (error) {
      setOperationError(errorText(error));
    }
  };

  if (account.isLoading || identityLoading) {
    return <div className="mail-page flex min-h-0 flex-1 flex-col p-5 md:p-8">
      <div className="mail-skeleton h-8 w-48 rounded-lg" />
      <div className="mt-6 grid min-h-[420px] flex-1 grid-cols-1 gap-4 md:grid-cols-[330px_1fr]">
        <div className="mail-skeleton rounded-2xl" /><div className="mail-skeleton rounded-2xl" />
      </div>
    </div>;
  }

  if (account.isError) return <div className="mail-page flex min-h-0 flex-1 items-center justify-center p-6">
    <div className="mail-panel max-w-lg p-7 text-center">
      <CircleAlert className="mx-auto h-8 w-8 text-destructive" />
      <h1 className="mt-4 font-display text-2xl">Mail is unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">{errorText(account.error)}</p>
      <button className="mail-button mt-5" onClick={() => account.refetch()}><RefreshCw className="h-4 w-4" /> Try again</button>
    </div>
  </div>;

  const requiresSetup = !account.data?.keyReady || !account.data.encryptionPublicKey || !account.data.signingPublicKey;

  if (!identityReady) return <main className="mail-page min-h-0 flex-1 overflow-y-auto p-5 md:p-10">
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 flex items-center gap-3">
        <div className="mail-mark"><MailIcon className="h-5 w-5" /></div>
        <div><p className="mail-kicker">VASTMIND / PRIVATE MAIL</p><h1 className="font-display text-3xl font-semibold tracking-tight">Set up your mailbox</h1></div>
      </header>
      <section className="mail-panel overflow-hidden">
        <div className="mail-keyband"><KeyRound className="h-5 w-5" /><span>Keys stay with you</span></div>
        <div className="space-y-6 p-6 md:p-8">
          <div>
            <h2 className="font-display text-xl font-semibold">{requiresSetup ? "Create your private mail identity" : "Unlock this device"}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              VastMind mail uses private <strong className="font-semibold text-foreground">username@vastmind.com</strong> aliases inside VastMind only. They are not public email addresses, and messages are never delivered outside the service.
            </p>
          </div>
          {requiresSetup ? (
            <div className="rounded-2xl border border-border/70 bg-background/65 p-5">
              <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p className="text-sm leading-6">Generate a user-held 24-word BIP39 recovery phrase. Save it somewhere private before continuing. It is shown once and is never sent to VastMind.</p></div>
              {recoveryPhrase ? <>
                <div className="mail-phrase-grid mt-5" aria-label="Recovery phrase">
                  {recoveryPhrase.split(" ").map((word, i) => <div key={`${word}-${i}`}><span>{String(i + 1).padStart(2, "0")}</span>{word}</div>)}
                </div>
                <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-5">
                  <input type="checkbox" checked={phraseAcknowledged} onChange={(event) => setPhraseAcknowledged(event.target.checked)} className="mt-1 accent-primary" />
                  <span>I saved this phrase somewhere safe. I understand VastMind cannot recover it for me.</span>
                </label>
                <button className="mail-button mt-5" disabled={!phraseAcknowledged || phraseBusy} onClick={createAccountKeys}>
                  {phraseBusy ? "Registering keys…" : "Save keys and open mailbox"}<ChevronRight className="h-4 w-4" />
                </button>
              </> : <button className="mail-button mt-5" onClick={generatePhrase}><KeyRound className="h-4 w-4" /> Generate recovery phrase</button>}
            </div>
          ) : (
            <div className="rounded-2xl border border-border/70 bg-background/65 p-5">
              <p className="text-sm leading-6 text-muted-foreground">This account already has mail keys. Load the local key store or restore them with the phrase that was used when the keys were registered.</p>
              {identityError && <div className="mail-error mt-4"><CircleAlert className="h-4 w-4 shrink-0" />{identityError}</div>}
              <button className="mt-4 text-sm font-semibold text-primary underline-offset-4 hover:underline" onClick={() => setRestoreMode((value) => !value)}>
                {restoreMode ? "Enter recovery phrase" : "Restore with recovery phrase"}
              </button>
              {restoreMode && <>
                <textarea aria-label="Recovery phrase" value={restorePhrase} onChange={(event) => setRestorePhrase(event.target.value)} placeholder="Enter your 12, 15, 18, 21, or 24-word phrase" className="mail-input mt-4 min-h-24 w-full resize-y" autoComplete="off" />
                <button className="mail-button mt-3" disabled={!restorePhrase.trim() || phraseBusy} onClick={restoreKeys}>{phraseBusy ? "Checking keys…" : "Verify keys and unlock"}<ChevronRight className="h-4 w-4" /></button>
              </>}
            </div>
          )}
          {requiresSetup && identityError && <div className="mail-error"><CircleAlert className="h-4 w-4 shrink-0" />{identityError}</div>}
          <section className="mail-security-note">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="h-4 w-4 text-primary" />What this protects — and what it does not</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
              <li>Message text is encrypted into recipient-specific HPKE envelopes and signed by the sender. The server stores ciphertext and routing metadata.</li>
              <li>Participants, sender, and timestamps remain visible to VastMind servers. Mail is private to the service, not anonymous.</li>
              <li>There is no independent key-transparency service. The API prevents ordinary key replacement, but a compromised server could substitute a first-contact key. Compare each contact fingerprint out of band before trusting it.</li>
              <li>This release uses a static per-account recipient key. It does not provide Signal-style forward secrecy or a Double Ratchet.</li>
              <li>Mail keys cannot be reset without losing access to old encrypted mail. Keep the recovery phrase safe; if it is lost, old messages cannot be restored.</li>
              <li>Messages are one-to-one text only. Files, group mail, external delivery, and content search are not supported.</li>
            </ul>
          </section>
        </div>
      </section>
    </div>
  </main>;

  return <main className="mail-page flex min-h-0 flex-1 flex-col overflow-hidden">
    <header className="mail-topbar flex shrink-0 items-center justify-between gap-4 px-5 py-4 md:px-8">
      <div className="flex items-center gap-3">
        <div className="mail-mark"><MailIcon className="h-5 w-5" /></div>
        <div><p className="mail-kicker">INTERNAL / ENCRYPTED</p><h1 className="font-display text-2xl font-semibold tracking-tight">Mail</h1></div>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block"><div className="text-sm font-semibold">{account.data?.address ?? `${me.username}@vastmind.com`}</div><div className="mail-caption">VastMind-only address</div></div>
        <button className="mail-button" onClick={startCompose}><Plus className="h-4 w-4" /><span className="hidden sm:inline">Compose</span><span className="sm:hidden">New</span></button>
      </div>
    </header>
    <div className="mail-security-strip flex shrink-0 items-start gap-2 px-5 py-3 text-xs leading-5 md:px-8">
      <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0" />
      <span>Private within VastMind, not anonymous. Participants, sender, and timestamps remain visible to servers. Static account keys do not provide forward secrecy.</span>
    </div>
    <div className="flex min-h-0 flex-1">
      <aside className={`mail-list flex min-h-0 w-full shrink-0 flex-col md:w-[340px] lg:w-[380px] ${activeId ? "hidden md:flex" : "flex"}`}>
        <nav className="mail-box-tabs grid grid-cols-3 gap-1 p-3" aria-label="Mail folders">
          {(["inbox", "sent", "archived"] as Box[]).map((item) => <button key={item} onClick={() => { setBox(item); setActiveId(""); }}
            className={`mail-tab ${box === item ? "mail-tab-active" : ""}`}><span>{boxLabels[item]}</span></button>)}
        </nav>
        {threads.isError ? <div className="m-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="text-destructive">{errorText(threads.error)}</p><button className="mt-3 inline-flex items-center gap-2 font-semibold" onClick={() => threads.refetch()}><RefreshCw className="h-3.5 w-3.5" />Retry</button>
        </div> : threads.isLoading ? <div className="space-y-2 p-3">{[0, 1, 2, 3].map((n) => <div key={n} className="mail-row-skeleton h-[78px] rounded-xl" />)}</div>
        : (threads.data ?? []).length === 0 ? <div className="flex flex-1 flex-col items-center justify-center px-8 pb-12 text-center">
          <div className="mail-empty-icon"><Inbox className="h-6 w-6" /></div>
          <h2 className="mt-4 font-display text-lg font-semibold">{box === "inbox" ? "A clear inbox." : `Nothing in ${boxLabels[box].toLowerCase()} yet.`}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{box === "inbox" ? "Messages from VastMind mail users will appear here." : "Your mail will show up here when there is something to see."}</p>
          {box === "inbox" && <button className="mail-link-button mt-4" onClick={startCompose}>Write a message</button>}
        </div> : <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {(threads.data ?? []).map((thread) => {
            const last = thread.lastMessage;
            return <button key={thread.id} onClick={() => openThread(thread)} className={`mail-thread-row ${activeId === thread.id ? "mail-thread-selected" : ""}`}>
              <span className="mail-avatar"><UserRound className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1 text-left">
                <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{thread.contact.name}</span><span className="mail-caption shrink-0">{last ? dateLabel(last.createdAt) : dateLabel(thread.updatedAt)}</span></span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">@{thread.contact.username}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">{last ? `${last.senderId === me.id ? "You" : last.senderName} · Encrypted message` : "No messages yet"}</span>
              </span>
              {thread.unreadCount > 0 && <span className="mail-unread-dot" aria-label={`${thread.unreadCount} unread`} />}
            </button>;
          })}
        </div>}
      </aside>
      <section className={`mail-conversation min-w-0 flex-1 ${activeId ? "flex" : "hidden md:flex"}`}>
        {!activeId ? <div className="mail-welcome flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="mail-orbit"><MailIcon className="h-8 w-8" /></div>
          <p className="mail-kicker mt-6">A PRIVATE LINE, INSIDE VASTMIND</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">Words stay between<br className="hidden sm:block" /> the two of you.</h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">Open a conversation or start a one-to-one text message with someone who has set up VastMind mail.</p>
          <button className="mail-button mt-6" onClick={startCompose}><Plus className="h-4 w-4" />Compose a message</button>
        </div> : activeThread ? <>
          <header className="mail-convo-header flex shrink-0 items-center gap-3 px-4 py-3 md:px-6">
            <button className="mail-icon-button md:hidden" aria-label="Back to mail list" onClick={() => setActiveId("")}><ArrowLeft className="h-4 w-4" /></button>
            <span className="mail-avatar"><UserRound className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{activeThread.contact.name}</h2><p className="truncate text-xs text-muted-foreground">@{activeThread.contact.username} · {activeThread.contact.address}</p><p className="mail-contact-fingerprint"><span>UNVERIFIED KEY</span>{getMailKeyFingerprint(activeThread.contact)}</p></div>
            <button className="mail-icon-button" title={activeThread.archived ? "Unarchive thread" : "Archive thread"} aria-label={activeThread.archived ? "Unarchive thread" : "Archive thread"} onClick={() => toggleArchive(activeThread)}>
              {activeThread.archived ? <Undo2 className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            </button>
          </header>
          {operationError && <div className="mail-error mx-4 mt-3 md:mx-6"><CircleAlert className="h-4 w-4 shrink-0" />{operationError}</div>}
          <div className="mail-message-list flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 md:px-8">
            <div className="mail-thread-meta"><LockKeyhole className="h-3.5 w-3.5" />Messages are encrypted for the two participants</div>
            {messages.isError ? <div className="mail-inline-error"><p>{errorText(messages.error)}</p><button onClick={() => messages.refetch()}>Retry loading messages</button></div>
            : messages.isLoading ? <div className="space-y-4">{[0, 1, 2].map((n) => <div key={n} className={`mail-bubble-skeleton ${n % 2 ? "ml-auto" : ""}`} />)}</div>
            : (messages.data?.items ?? []).length === 0 ? <div className="my-auto text-center">
              <p className="font-display text-xl font-semibold">The conversation starts here.</p><p className="mt-2 text-sm text-muted-foreground">Send a private text message to {activeThread.contact.name}.</p>
              <button className="mail-link-button mt-4" onClick={() => { setSelectedRecipient(activeThread.contact); setRecipientQuery(activeThread.contact.address); setComposeOpen(true); }}>Write a message</button>
            </div> : (messages.data?.items ?? []).map((message) => {
              const result = decrypted[message.id];
              const isMine = message.senderId === me.id;
              return <article key={message.id} className={`mail-message ${isMine ? "mail-message-mine" : "mail-message-theirs"}`}>
                <div className="mail-message-byline">{isMine ? "You" : message.senderName}<span><Clock3 className="h-3 w-3" />{dateLabel(message.createdAt)}</span></div>
                {result?.status === "untrusted" ? <div className="mail-untrusted"><ShieldQuestion className="h-4 w-4 shrink-0" /><div><strong>Untrusted message</strong><p>Signature verification or decryption failed. Content is hidden.</p></div></div>
                  : result?.status === "trusted" ? <div className="mail-bubble">
                    {result.content.subject && <h3 className="mb-2 text-sm font-semibold">{result.content.subject}</h3>}
                    <p className="whitespace-pre-wrap break-words text-sm leading-6">{result.content.body}</p>
                  </div> : <div className="mail-bubble-skeleton h-20" />}
              </article>;
            })}
          </div>
          <div className="mail-compose-prompt shrink-0 px-4 py-3 md:px-6"><button className="mail-button w-full justify-center" onClick={() => { setSelectedRecipient(activeThread.contact); setRecipientQuery(activeThread.contact.address); setComposeOpen(true); }}><Send className="h-4 w-4" />Write a message</button></div>
        </> : <div className="flex flex-1 items-center justify-center p-8 text-center"><p className="text-sm text-muted-foreground">This thread is no longer available.</p></div>}
      </section>
    </div>

    {composeOpen && <div className="mail-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setComposeOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="compose-title" className="mail-compose-modal">
        <header className="flex items-start justify-between gap-4 border-b border-border/70 px-5 py-4">
          <div><p className="mail-kicker">PRIVATE / ONE-TO-ONE</p><h2 id="compose-title" className="mt-1 font-display text-xl font-semibold">New message</h2></div>
          <button className="mail-icon-button" aria-label="Close compose" disabled={busy} onClick={() => setComposeOpen(false)}><X className="h-4 w-4" /></button>
        </header>
        <div className="space-y-4 p-5">
          <div>
            <label htmlFor="mail-recipient" className="mail-label">To</label>
            {selectedRecipient ? <div className="mail-recipient-chip"><span className="mail-avatar"><UserRound className="h-4 w-4" /></span><span className="min-w-0 flex-1"><strong>{selectedRecipient.name}</strong><small>{selectedRecipient.address}</small><small className="mail-contact-fingerprint"><span>UNVERIFIED KEY</span>{getMailKeyFingerprint(selectedRecipient)}</small></span><button className="mail-icon-button h-8 w-8" aria-label="Change recipient" onClick={() => { setSelectedRecipient(null); setRecipientQuery(""); }}><X className="h-4 w-4" /></button></div>
            : <div className="relative"><Search className="mail-search-icon h-4 w-4" /><input id="mail-recipient" value={recipientQuery} onChange={(event) => setRecipientQuery(event.target.value)} placeholder="Search username or internal address" className="mail-input w-full pl-10" autoComplete="off" />
              {recipientQuery.trim().length >= 2 && <div className="mail-recipient-results">
                {recipients.isLoading ? <p className="p-3 text-sm text-muted-foreground">Searching mail users…</p>
                : recipients.isError ? <div className="p-3 text-sm text-destructive">{errorText(recipients.error)}<button className="ml-2 underline" onClick={() => recipients.refetch()}>Retry</button></div>
                : (recipients.data ?? []).length === 0 ? <p className="p-3 text-sm text-muted-foreground">No mail-enabled member found.</p>
                : (recipients.data ?? []).map((contact) => <button key={contact.userId} className="mail-recipient-option" onClick={() => { setSelectedRecipient(contact); setRecipientQuery(""); }}>
                  <span className="mail-avatar"><UserRound className="h-4 w-4" /></span><span className="min-w-0 flex-1 text-left"><strong className="block truncate text-sm">{contact.name}</strong><small className="block truncate text-xs text-muted-foreground">@{contact.username} · {contact.address}</small><small className="mail-contact-fingerprint"><span>UNVERIFIED</span>{getMailKeyFingerprint(contact)}</small></span><ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>)}
              </div>}
            </div>}
            <p className="mt-1 text-xs text-muted-foreground">Only existing VastMind mail addresses are accepted. No outside delivery.</p>
          </div>
          <div><label htmlFor="mail-subject" className="mail-label">Subject</label><input id="mail-subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} placeholder="Add a subject" className="mail-input w-full" /></div>
          <div><label htmlFor="mail-body" className="mail-label">Message</label><textarea id="mail-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={12000} placeholder="Write your message…" className="mail-input min-h-40 w-full resize-y" /></div>
          <div className="mail-compose-footnote"><LockKeyhole className="h-4 w-4 shrink-0" />Encrypted on this device. A separate signed envelope is prepared for each participant, including your sent copy.</div>
          {draftError && <div className="mail-error"><CircleAlert className="h-4 w-4 shrink-0" />{draftError}</div>}
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-xs text-muted-foreground">{body.length.toLocaleString()} / 12,000</span>
            <button className="mail-button" disabled={!selectedRecipient || busy || (!subject.trim() && !body.trim())} onClick={send}>{busy ? "Encrypting and sending…" : "Send securely"}<Send className="h-4 w-4" /></button>
          </div>
        </div>
      </section>
    </div>}
  </main>;
}
