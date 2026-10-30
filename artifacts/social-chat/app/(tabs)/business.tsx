import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, Switch, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetGrowthOverviewQueryKey,
  getGetGrowthReviewQueueQueryKey,
  getGetGrowthVerificationQueryKey,
  useCreateGrowthPromotion,
  useCreateQuickReply,
  useGetGrowthOverview,
  useGetGrowthReviewQueue,
  useGetGrowthVerification,
  useReviewGrowthVerification,
  useSubmitGrowthVerification,
  useUpdateGrowthPromotion,
  type GrowthPromotionInput,
  type GrowthPromotionTargetType,
} from '@workspace/api-client-react';
import { AppHeader, PageFrame, StorageNotice, SectionTitle } from '@/components/common';
import { SellerStudio } from '@/components/commerce/SellerStudio';
import { Segments } from '@/components/commerce/kit';
import { useColors } from '@/hooks/useColors';
import { useAppStore } from '@/state/AppStore';

export default function BusinessScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{ targetType?: string; targetId?: string; name?: string }>();
  const [tab, setTab] = useState<'studio' | 'inbox' | 'growth'>('studio');
  const initialTargetType: GrowthPromotionTargetType = params.targetType === 'channel' || params.targetType === 'product' ? params.targetType : 'post';
  useEffect(() => { if (params.targetId) setTab('growth'); }, [params.targetId]);
  return <PageFrame>
    <AppHeader /><StorageNotice />
    <Text style={{ color: colors.foreground, fontSize: 30, fontWeight: '900', letterSpacing: -1, marginBottom: 12 }}>Business</Text>
    <Segments value={tab} options={[['studio', 'Shop studio'], ['inbox', 'Inbox & replies'], ['growth', 'Growth']] as const} onChange={setTab} />
    {tab === 'studio' ? <SellerStudio /> : tab === 'inbox' ? <Inbox /> : <GrowthTools key={`${initialTargetType}-${params.targetId ?? ''}`} initialTargetType={initialTargetType} initialTargetId={params.targetId ?? ''} initialName={params.name ?? ''} />}
  </PageFrame>;
}

function GrowthTools({ initialTargetType, initialTargetId, initialName }: { initialTargetType: GrowthPromotionTargetType; initialTargetId: string; initialName: string }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const overview = useGetGrowthOverview();
  const verification = useGetGrowthVerification();
  const reviewer = !!overview.data?.isPlatformReviewer;
  const queue = useGetGrowthReviewQueue({ query: { enabled: reviewer, queryKey: getGetGrowthReviewQueueQueryKey() } });
  const [targetType, setTargetType] = useState<GrowthPromotionTargetType>(initialTargetType);
  const [targetId, setTargetId] = useState(initialTargetId);
  const [draftName, setDraftName] = useState(initialName ? `Promote ${initialName}` : '');
  const [objective, setObjective] = useState<GrowthPromotionInput['objective']>('reach');
  const [budget, setBudget] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [website, setWebsite] = useState('');
  const [reason, setReason] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const verificationInitialized = React.useRef(false);

  useEffect(() => {
    if (!verification.data || verificationInitialized.current) return;
    verificationInitialized.current = true;
    setBusinessName(verification.data.businessName);
    setWebsite(verification.data.website);
    setReason(verification.data.reason);
  }, [verification.data]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getGetGrowthOverviewQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetGrowthVerificationQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetGrowthReviewQueueQueryKey() });
  };
  const createPromotion = useCreateGrowthPromotion({ mutation: { onSuccess: () => {
    refresh();
    setTargetId('');
    setDraftName('');
    setBudget('');
    setMessage('Promotion draft saved. It will not spend money or distribute content.');
  }, onError: (error) => setMessage(error instanceof Error ? error.message : 'Promotion draft could not be saved.') } });
  const cancelPromotion = useUpdateGrowthPromotion({ mutation: { onSuccess: refresh, onError: (error) => setMessage(error instanceof Error ? error.message : 'Draft could not be cancelled.') } });
  const submitVerification = useSubmitGrowthVerification({ mutation: { onSuccess: refresh, onError: (error) => setMessage(error instanceof Error ? error.message : 'Application could not be submitted.') } });
  const reviewApplication = useReviewGrowthVerification({ mutation: { onSuccess: refresh, onError: (error) => setMessage(error instanceof Error ? error.message : 'Review could not be saved.') } });
  const card = { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius, padding: 16, marginBottom: 12 } as const;
  const field = { color: colors.foreground, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, marginTop: 6 } as const;

  if (overview.isLoading || verification.isLoading) return <Text style={{ color: colors.mutedForeground, paddingVertical: 24 }}>Loading business growth tools…</Text>;
  if (overview.isError || verification.isError || !overview.data || !verification.data) return <View style={card}><Text style={{ color: colors.foreground, fontWeight: '700' }}>Growth tools are unavailable</Text><Text style={{ color: colors.mutedForeground, marginTop: 6 }}>Check your connection and try again.</Text></View>;

  const onSaveDraft = () => {
    if (!targetId.trim() || !draftName.trim()) {
      setMessage('Choose the content ID and add a draft name.');
      return;
    }
    const parsedBudget = budget.trim() ? Number(budget) : undefined;
    if (parsedBudget !== undefined && (!Number.isFinite(parsedBudget) || parsedBudget < 0)) {
      setMessage('Enter a valid optional planning budget.');
      return;
    }
    const input: GrowthPromotionInput = {
      targetType,
      targetId: targetId.trim(),
      name: draftName.trim(),
      objective,
      durationDays: 7,
      ...(parsedBudget !== undefined ? { desiredDailyBudgetMinor: Math.round(parsedBudget * 100), currency: 'USD' } : {}),
    };
    createPromotion.mutate({ data: input });
  };
  const locked = verification.data.state === 'pending' || verification.data.state === 'approved';
  const sectionTitle = { color: colors.foreground, fontSize: 19, fontWeight: '800', marginBottom: 10 } as const;

  return <View>
    <View style={[card, { backgroundColor: colors.forest, borderColor: colors.forest }]}>
      <Text style={{ color: colors.lime, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' }}>VastMind Growth</Text>
      <Text style={{ color: colors.primaryForeground, fontSize: 25, fontWeight: '900', marginTop: 6 }}>Tools for your next step</Text>
      <Text style={{ color: colors.primaryForeground, opacity: 0.78, lineHeight: 20, marginTop: 7 }}>Save promotion ideas and apply for business verification. Billing is not available, so drafts never run or spend.</Text>
      <View style={{ alignSelf: 'flex-start', backgroundColor: colors.card, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 30, marginTop: 12 }}>
        <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '700' }}>Plan: {overview.data.currentPlan} · {overview.data.subscriptionStatus.replace('_', ' ')}</Text>
      </View>
    </View>

    <Text style={sectionTitle}>Planned subscription tiers</Text>
    {overview.data.plans.map((plan) => <View key={plan.id} style={card}>
      <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: '800' }}>{plan.name}{plan.id === overview.data.currentPlan ? ' · Current' : ''}</Text>
      {plan.features.map((feature) => <Text key={feature} style={{ color: colors.mutedForeground, marginTop: 7, lineHeight: 19 }}>• {feature}</Text>)}
      <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 10 }}>Billing and upgrades are not enabled.</Text>
    </View>)}

    <Text style={[sectionTitle, { marginTop: 10 }]}>Save a promotion draft</Text>
    <View style={card}>
      <Text style={{ color: colors.mutedForeground, lineHeight: 18 }}>Drafts are notes only. VastMind does not charge, deliver, or report reach for them.</Text>
      <Text style={{ color: colors.foreground, fontWeight: '700', marginTop: 14 }}>Content type</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 7 }}>
        {(['post', 'channel', 'product'] as const).map((type) => <Pressable key={type} accessibilityRole="button" accessibilityState={{ selected: targetType === type }} onPress={() => setTargetType(type)} style={{ borderRadius: 24, borderWidth: 1, borderColor: targetType === type ? colors.primary : colors.border, backgroundColor: targetType === type ? colors.primary : colors.card, paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ color: targetType === type ? colors.primaryForeground : colors.foreground, fontSize: 12, fontWeight: '700' }}>{type === 'post' ? 'Feed post' : type === 'channel' ? 'Channel' : 'Product'}</Text></Pressable>)}
      </View>
      <TextInput accessibilityLabel="Content ID" placeholder="Owned content ID" placeholderTextColor={colors.mutedForeground} value={targetId} onChangeText={setTargetId} style={field} autoCapitalize="none" />
      <TextInput accessibilityLabel="Draft name" placeholder="Draft name" placeholderTextColor={colors.mutedForeground} value={draftName} onChangeText={setDraftName} style={field} maxLength={120} />
      <Text style={{ color: colors.foreground, fontWeight: '700', marginTop: 14 }}>Intent</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 7 }}>
        {(['reach', 'engagement', 'product_clicks'] as const).map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: objective === item }} onPress={() => setObjective(item)} style={{ borderRadius: 24, borderWidth: 1, borderColor: objective === item ? colors.primary : colors.border, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: objective === item ? colors.secondary : colors.card }}><Text style={{ color: colors.foreground, fontSize: 12 }}>{item === 'reach' ? 'Reach' : item === 'engagement' ? 'Engagement' : 'Product clicks'}</Text></Pressable>)}
      </View>
      <TextInput accessibilityLabel="Optional daily budget" placeholder="Optional daily budget in USD" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" value={budget} onChangeText={setBudget} style={field} />
      <Pressable accessibilityRole="button" disabled={createPromotion.isPending} onPress={onSaveDraft} style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 14, alignItems: 'center', marginTop: 14, opacity: createPromotion.isPending ? 0.6 : 1 }}><Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>{createPromotion.isPending ? 'Saving…' : 'Save draft'}</Text></Pressable>
    </View>
    {overview.data.promotions.map((item) => <View key={item.id} style={[card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
      <View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: '800' }}>{item.name}</Text><Text style={{ color: colors.mutedForeground, marginTop: 4, fontSize: 12 }}>{item.targetType} · {item.objective.replace('_', ' ')} · {item.durationDays} days · {item.state}</Text></View>
      {item.state === 'draft' ? <Pressable accessibilityRole="button" accessibilityLabel={`Cancel ${item.name}`} disabled={cancelPromotion.isPending} onPress={() => cancelPromotion.mutate({ promotionId: item.id, data: { state: 'cancelled' } })} style={{ padding: 8 }}><Feather name="x-circle" size={19} color={colors.mutedForeground} /></Pressable> : null}
    </View>)}

    <Text style={[sectionTitle, { marginTop: 12 }]}>Business verification</Text>
    <View style={card}>
      <Text style={{ color: colors.mutedForeground, lineHeight: 19 }}>Status: {verification.data.state.replace('_', ' ')}. Badge approval requires an active paid plan and a human reviewer.</Text>
      <TextInput accessibilityLabel="Business name" placeholder="Business name" placeholderTextColor={colors.mutedForeground} value={businessName} onChangeText={setBusinessName} editable={!locked} style={field} maxLength={120} />
      <TextInput accessibilityLabel="Business website" placeholder="https://business.example" placeholderTextColor={colors.mutedForeground} value={website} onChangeText={setWebsite} editable={!locked} autoCapitalize="none" keyboardType="url" style={field} maxLength={300} />
      <TextInput accessibilityLabel="Verification details" placeholder="How can reviewers verify your business?" placeholderTextColor={colors.mutedForeground} value={reason} onChangeText={setReason} editable={!locked} multiline style={[field, { minHeight: 96, textAlignVertical: 'top' }]} maxLength={1500} />
      {!locked ? <Pressable accessibilityRole="button" disabled={submitVerification.isPending || businessName.trim().length < 2 || reason.trim().length < 20 || !website.trim()} onPress={() => submitVerification.mutate({ data: { businessName: businessName.trim(), website: website.trim(), reason: reason.trim() } })} style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 14, alignItems: 'center', marginTop: 12, opacity: submitVerification.isPending ? 0.6 : 1 }}><Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>{submitVerification.isPending ? 'Submitting…' : 'Submit for review'}</Text></Pressable> : null}
      {verification.data.reviewNote ? <Text style={{ color: colors.mutedForeground, marginTop: 10 }}>Reviewer note: {verification.data.reviewNote}</Text> : null}
    </View>
    {!!message && <Text accessibilityRole="alert" style={{ color: colors.primary, marginBottom: 12 }}>{message}</Text>}

    {reviewer ? <View style={{ marginTop: 10 }}>
      <Text style={sectionTitle}>Verification review queue</Text>
      {queue.isLoading ? <Text style={{ color: colors.mutedForeground }}>Loading requests…</Text> : queue.isError ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>Reviewer queue could not be loaded.</Text> : !queue.data?.length ? <Text style={{ color: colors.mutedForeground }}>No applications waiting.</Text> : queue.data.map((application) => <View key={application.applicationId} style={card}>
        <Text style={{ color: colors.foreground, fontWeight: '800' }}>{application.businessName} · @{application.username}</Text>
        <Text style={{ color: colors.mutedForeground, marginTop: 5 }}>{application.website}{'\n'}{application.reason}</Text>
        <TextInput accessibilityLabel={`Reviewer note for ${application.businessName}`} placeholder="Review note" placeholderTextColor={colors.mutedForeground} value={reviewNotes[application.applicationId] ?? ''} onChangeText={(value) => setReviewNotes((notes) => ({ ...notes, [application.applicationId]: value }))} style={field} maxLength={1000} />
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
          {(['rejected', 'approved'] as const).map((decision) => <Pressable key={decision} accessibilityRole="button" disabled={reviewApplication.isPending} onPress={() => reviewApplication.mutate({ applicationId: application.applicationId, data: { decision, reviewNote: reviewNotes[application.applicationId] ?? '' } })} style={{ backgroundColor: decision === 'approved' ? colors.primary : colors.secondary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 24 }}><Text style={{ color: decision === 'approved' ? colors.primaryForeground : colors.foreground, fontWeight: '700' }}>{decision === 'approved' ? 'Approve' : 'Reject'}</Text></Pressable>)}
        </View>
      </View>)}
    </View> : null}
  </View>;
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
