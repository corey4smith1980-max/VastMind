import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCloseCommunityGig,
  useCompleteCommunityGig,
  useCreateCommunityGig,
  useCreateCommunityGigResponse,
  useDecideCommunityGigResponse,
  getListCommunityGigResponsesQueryKey,
  useListCommunityGigResponses,
  useListCommunityGigs,
  type CommunityGig,
  type CommunityGigCategory,
  type CommunityGigCreate,
  type CommunityGigKind,
  type ListCommunityGigsParams,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAppStore } from '@/state/AppStore';

const CATEGORIES: { id: CommunityGigCategory; label: string }[] = [
  { id: 'errands', label: 'Help & errands' },
  { id: 'home-repairs', label: 'Home & repairs' },
  { id: 'transport', label: 'Driving & delivery' },
  { id: 'learning', label: 'Learning & tutoring' },
  { id: 'creative', label: 'Creative work' },
  { id: 'technology', label: 'Technology' },
  { id: 'personal-care', label: 'Personal care' },
  { id: 'food-events', label: 'Food & events' },
  { id: 'childcare', label: 'Child & pet care' },
  { id: 'jobs', label: 'Jobs & projects' },
  { id: 'other', label: 'Other' },
];
type KindFilter = CommunityGigKind | 'all';
type CategoryFilter = CommunityGigCategory | 'all';
type ModalState = 'create' | 'respond' | 'manage' | null;

const fieldStyle = (colors: ReturnType<typeof useColors>) => ({
  minHeight: 44, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border,
  backgroundColor: colors.background, color: colors.foreground, paddingHorizontal: 12,
  fontSize: 14, marginTop: 6,
});
const button = (colors: ReturnType<typeof useColors>, selected = false) => ({
  minHeight: 38, paddingHorizontal: 13, borderRadius: 20, borderWidth: 1,
  borderColor: selected ? colors.primary : colors.border,
  backgroundColor: selected ? colors.primary : colors.card,
  justifyContent: 'center' as const, alignItems: 'center' as const,
});
const labelFor = (value: CommunityGigCategory) => CATEGORIES.find(item => item.id === value)?.label ?? 'Other';
const timeAgo = (value: string) => {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;
};
const styles = StyleSheet.create({
  fill: { flex: 1 },
  createIcon: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
});

/** Native marketplace matching the web listing, response, and owner workflows. */
export function CommunityMarketplace({ bottomInset = 0 }: { bottomInset?: number }) {
  const colors = useColors();
  const { profile } = useAppStore();
  const client = useQueryClient();
  const [modal, setModal] = useState<ModalState>(null);
  const [activeGig, setActiveGig] = useState<CommunityGig | null>(null);
  const [kind, setKind] = useState<KindFilter>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [draftKind, setDraftKind] = useState<CommunityGigCreate['kind']>('request');
  const [draftCategory, setDraftCategory] = useState<CommunityGigCreate['category']>('other');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rateNote, setRateNote] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [responseMessage, setResponseMessage] = useState('');
  const params = useMemo<ListCommunityGigsParams>(() => ({
    scope: 'community',
    ...(search.trim() ? { q: search.trim() } : {}),
    ...(location.trim() ? { location: location.trim() } : {}),
    ...(kind !== 'all' ? { kind } : {}),
    ...(category !== 'all' ? { category } : {}),
  }), [category, kind, location, search]);
  const listings = useListCommunityGigs(params);
  const activeId = activeGig?.id ?? '';
  const responses = useListCommunityGigResponses(activeId, {
    query: { queryKey: getListCommunityGigResponsesQueryKey(activeId), enabled: modal === 'manage' && activeGig?.author.id === profile?.id },
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['/api/community-gigs'] });
    if (activeId) void client.invalidateQueries({ queryKey: getListCommunityGigResponsesQueryKey(activeId) });
  };
  const errorAlert = (titleText: string, error: unknown) => Alert.alert(titleText, error instanceof Error ? error.message : 'Please try again.');

  const create = useCreateCommunityGig();
  const respond = useCreateCommunityGigResponse();
  const decide = useDecideCommunityGigResponse();
  const close = useCloseCommunityGig();
  const complete = useCompleteCommunityGig();

  const submitListing = async () => {
    if (title.trim().length < 3 || description.trim().length < 3) return;
    if (dueDate.trim()) {
      const parsedDate = new Date(`${dueDate.trim()}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim()) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dueDate.trim()) {
        Alert.alert('Check the due date', 'Enter a real date in YYYY-MM-DD format, or leave the field empty.');
        return;
      }
    }
    try {
      await create.mutateAsync({ data: {
        kind: draftKind, category: draftCategory, title: title.trim(), description: description.trim(),
        ...(rateNote.trim() ? { rateNote: rateNote.trim() } : {}),
        ...(locationLabel.trim() ? { locationLabel: locationLabel.trim() } : {}),
        ...(dueDate.trim() ? { dueDate: dueDate.trim() } : {}),
      } });
      setModal(null); setTitle(''); setDescription(''); setRateNote(''); setLocationLabel(''); setDueDate('');
      refresh(); Alert.alert('Listing published', 'Members can now respond privately.');
    } catch (error) { errorAlert("Couldn't publish listing", error); }
  };
  const submitResponse = async () => {
    if (!activeGig || responseMessage.trim().length < 2) return;
    try {
      await respond.mutateAsync({ gigId: activeGig.id, data: { message: responseMessage.trim() } });
      setModal(null); setResponseMessage(''); refresh();
      Alert.alert('Response sent', 'Only the listing owner can read it.');
    } catch (error) { errorAlert("Couldn't send response", error); }
  };
  const decideResponse = async (responseId: string, accept: boolean) => {
    if (!activeGig) return;
    try {
      await decide.mutateAsync({ gigId: activeGig.id, responseId, data: { accept } });
      refresh();
    } catch (error) { errorAlert("Couldn't update response", error); }
  };
  const setGigState = (gig: CommunityGig, action: 'close' | 'complete') => {
    const titleText = action === 'close' ? 'Close this listing?' : 'Mark this listing complete?';
    const message = action === 'close' ? 'This stops new responses.' : 'This records that the work is finished.';
    Alert.alert(titleText, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: action === 'close' ? 'Close listing' : 'Mark complete', onPress: () => {
        const request = action === 'close' ? close.mutateAsync({ gigId: gig.id }) : complete.mutateAsync({ gigId: gig.id });
        void request.then(refresh).catch(error => errorAlert("Couldn't update listing", error));
      } },
    ]);
  };

  const inputLabel = (text: string) => <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '700', marginTop: 12 }}>{text}</Text>;
  const openCreate = () => {
    setDraftKind('request'); setDraftCategory('other'); setTitle(''); setDescription('');
    setRateNote(''); setLocationLabel(''); setDueDate(''); setModal('create');
  };
  const renderGig = (gig: CommunityGig) => {
    const isOwner = gig.author.id === profile?.id;
    const canRespond = gig.state === 'open' && !isOwner && !gig.myResponseId;
    const canComplete = gig.state === 'matched' && (isOwner || gig.myResponseState === 'accepted');
    return <View key={gig.id} style={{ padding: 15, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
        <View style={{ ...button(colors, gig.kind === 'request'), minHeight: 28, paddingHorizontal: 10 }}>
          <Text style={{ color: gig.kind === 'request' ? colors.primaryForeground : colors.foreground, fontSize: 11, fontWeight: '800' }}>{gig.kind === 'request' ? 'Help request' : 'Skill or service'}</Text>
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: '700' }}>{labelFor(gig.category)}</Text>
        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800', marginLeft: 'auto' }}>{gig.state.toUpperCase()}</Text>
      </View>
      <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: '800', marginTop: 12 }}>{gig.title}</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 20, marginTop: 5 }}>{gig.description}</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 10 }}>{gig.author.name} · {timeAgo(gig.createdAt)}</Text>
      {gig.locationLabel ? <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 6 }}>⌖ {gig.locationLabel}</Text> : null}
      {gig.dueDate ? <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 5 }}>Needed by {new Date(`${gig.dueDate}T12:00:00`).toLocaleDateString()}</Text> : null}
      {gig.rateNote ? <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '600', marginTop: 6 }}>{gig.rateNote}</Text> : null}
      {gig.myResponseState ? <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700', marginTop: 7 }}>Your response: {gig.myResponseState}</Text> : null}
      {gig.communityName ? <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 6 }}>Legacy group listing · {gig.communityName}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
        {canRespond ? <Pressable accessibilityRole="button" onPress={() => { setActiveGig(gig); setResponseMessage(''); setModal('respond'); }} style={button(colors, true)}><Text style={{ color: colors.primaryForeground, fontSize: 12, fontWeight: '800' }}>Respond privately</Text></Pressable> : null}
        {isOwner ? <Pressable accessibilityRole="button" onPress={() => { setActiveGig(gig); setModal('manage'); }} style={button(colors)}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '700' }}>Responses ({gig.responseCount})</Text></Pressable> : null}
        {canComplete ? <Pressable accessibilityRole="button" onPress={() => setGigState(gig, 'complete')} style={button(colors)}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '700' }}>Mark complete</Text></Pressable> : null}
        {isOwner && gig.state === 'open' ? <Pressable accessibilityRole="button" onPress={() => setGigState(gig, 'close')} style={{ ...button(colors), borderColor: colors.border }}><Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: '700' }}>Close listing</Text></Pressable> : null}
        {!isOwner && gig.state === 'open' && gig.myResponseId ? <Text style={{ color: colors.mutedForeground, alignSelf: 'center', fontSize: 12 }}>Response sent</Text> : null}
      </View>
    </View>;
  };

  return <View style={{ flex: 1, paddingHorizontal: 15, paddingTop: 13, backgroundColor: colors.background }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 }}>LOCAL OPPORTUNITIES</Text>
        <Text style={{ color: colors.foreground, fontSize: 19, fontWeight: '900', marginTop: 3 }}>Ask for help. Offer what you can do.</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Create an opportunity listing" onPress={openCreate} hitSlop={8} style={styles.createIcon}>
        <Feather name="plus" size={21} color={colors.primaryForeground} />
      </Pressable>
    </View>
    <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17, marginTop: 5 }}>Post a task or skill, then review private responses and choose who to work with.</Text>
    <TextInput value={search} onChangeText={setSearch} placeholder="Search tasks, skills, services" placeholderTextColor={colors.mutedForeground} accessibilityLabel="Search opportunities" style={fieldStyle(colors)} />
    <TextInput value={location} onChangeText={setLocation} placeholder="Filter by broad area" placeholderTextColor={colors.mutedForeground} accessibilityLabel="Filter listings by area" style={fieldStyle(colors)} />
    <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15, marginTop: 5 }}>Use a city/state or country only. No street address or IP-based location lookup.</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 10 }}>
      {([['all', 'All'], ['request', 'Help requests'], ['offer', 'Skills & services']] as const).map(([value, label]) =>
        <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: kind === value }} onPress={() => setKind(value)} style={button(colors, kind === value)}>
          <Text style={{ color: kind === value ? colors.primaryForeground : colors.foreground, fontSize: 11, fontWeight: '800' }}>{label}</Text>
        </Pressable>)}
    </ScrollView>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingBottom: 12 }}>
      {([{ id: 'all', label: 'Every category' } as const, ...CATEGORIES]).map(option =>
        <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected: category === option.id }} onPress={() => setCategory(option.id)} style={button(colors, category === option.id)}>
          <Text style={{ color: category === option.id ? colors.primaryForeground : colors.foreground, fontSize: 10, fontWeight: '700' }}>{option.label}</Text>
        </Pressable>)}
    </ScrollView>
    {listings.isLoading ? <View style={{ padding: 30, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.mutedForeground, marginTop: 10 }}>Loading local opportunities…</Text></View> : null}
    {listings.isError ? <Pressable accessibilityRole="button" onPress={() => void listings.refetch()} style={{ padding: 24, alignItems: 'center' }}><Feather name="refresh-cw" size={24} color={colors.primary} /><Text style={{ color: colors.foreground, marginTop: 8 }}>Couldn’t load listings. Tap to retry.</Text></Pressable> : null}
    {!listings.isLoading && !listings.isError && !listings.data?.length ? <View style={{ padding: 28, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.card }}>
      <Feather name="heart" size={28} color={colors.primary} />
      <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: '800', marginTop: 12 }}>No matching listings</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: 'center', marginTop: 5 }}>Try another filter or be the first to post a request or skill.</Text>
    </View> : null}
    <ScrollView style={styles.fill} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomInset + 92 }}>
      {listings.data?.map(renderGig)}
    </ScrollView>

    <Modal visible={modal !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(null)}>
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 18 }}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>COMMUNITY MARKETPLACE</Text>
              <Text style={{ color: colors.foreground, fontSize: 21, fontWeight: '900', marginTop: 4 }}>{modal === 'create' ? 'Create a listing' : modal === 'respond' ? 'Send a private response' : 'Manage responses'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close dialog" onPress={() => setModal(null)} hitSlop={12} style={{ padding: 8 }}><Feather name="x" size={22} color={colors.foreground} /></Pressable>
          </View>
          {modal === 'create' ? <>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
              {([['request', 'I need help'], ['offer', 'I offer a skill or service']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: draftKind === value }} onPress={() => setDraftKind(value)} style={{ ...button(colors, draftKind === value), flex: 1, minHeight: 46 }}>
                <Text style={{ color: draftKind === value ? colors.primaryForeground : colors.foreground, fontSize: 12, fontWeight: '800', textAlign: 'center' }}>{label}</Text>
              </Pressable>)}
            </View>
            {inputLabel('Category')}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 8 }}>
              {CATEGORIES.map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected: draftCategory === option.id }} onPress={() => setDraftCategory(option.id)} style={button(colors, draftCategory === option.id)}>
                <Text style={{ color: draftCategory === option.id ? colors.primaryForeground : colors.foreground, fontSize: 11, fontWeight: '700' }}>{option.label}</Text>
              </Pressable>)}
            </ScrollView>
            {inputLabel('Title')}
            <TextInput value={title} onChangeText={setTitle} maxLength={100} placeholder={draftKind === 'request' ? 'What do you need done?' : 'What skill or service do you offer?'} placeholderTextColor={colors.mutedForeground} style={fieldStyle(colors)} />
            {inputLabel('Details')}
            <TextInput value={description} onChangeText={setDescription} multiline maxLength={2000} textAlignVertical="top" placeholder="Add details, availability, and how members should respond." placeholderTextColor={colors.mutedForeground} style={{ ...fieldStyle(colors), minHeight: 115, paddingTop: 12 }} />
            {inputLabel('Broad area (optional)')}
            <TextInput value={locationLabel} onChangeText={setLocationLabel} maxLength={120} placeholder="City, state or country" placeholderTextColor={colors.mutedForeground} style={fieldStyle(colors)} />
            {inputLabel('Needed by (YYYY-MM-DD, optional)')}
            <TextInput value={dueDate} onChangeText={setDueDate} placeholder="2026-12-31" placeholderTextColor={colors.mutedForeground} style={fieldStyle(colors)} />
            {inputLabel('Rate or reward note (optional)')}
            <TextInput value={rateNote} onChangeText={setRateNote} maxLength={120} placeholder="e.g. $80 fixed, negotiable, or free" placeholderTextColor={colors.mutedForeground} style={fieldStyle(colors)} />
            <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 11 }}>VastMind does not hold or process payment. Agree on terms directly and never post an exact address.</Text>
            <Pressable accessibilityRole="button" disabled={create.isPending || title.trim().length < 3 || description.trim().length < 3} onPress={() => void submitListing()} style={{ ...button(colors, true), minHeight: 48, marginTop: 18, opacity: create.isPending ? 0.6 : 1 }}>
              <Text style={{ color: colors.primaryForeground, fontSize: 14, fontWeight: '900' }}>{create.isPending ? 'Publishing…' : 'Publish listing'}</Text>
            </Pressable>
          </> : null}
          {modal === 'respond' && activeGig ? <>
            <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 13, marginTop: 16 }}>
              <Text style={{ color: colors.foreground, fontWeight: '800' }}>{activeGig.title}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>{activeGig.kind === 'request' ? 'Tell the requester how you can help.' : 'Tell the provider about your needs.'}</Text>
            </View>
            {inputLabel('Your message')}
            <TextInput value={responseMessage} onChangeText={setResponseMessage} multiline maxLength={1200} textAlignVertical="top" placeholder="Share your availability, experience, and estimated completion time." placeholderTextColor={colors.mutedForeground} style={{ ...fieldStyle(colors), minHeight: 120, paddingTop: 12 }} />
            <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 8 }}>Only the listing owner can read this response. VastMind does not process payments.</Text>
            <Pressable accessibilityRole="button" disabled={respond.isPending || responseMessage.trim().length < 2} onPress={() => void submitResponse()} style={{ ...button(colors, true), minHeight: 48, marginTop: 18 }}>
              <Text style={{ color: colors.primaryForeground, fontWeight: '900' }}>{respond.isPending ? 'Sending…' : 'Send private response'}</Text>
            </Pressable>
          </> : null}
          {modal === 'manage' && activeGig ? <>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 12 }}>{activeGig.responseCount} private response{activeGig.responseCount === 1 ? '' : 's'} for {activeGig.title}.</Text>
            {responses.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : null}
            {responses.isError ? <Pressable accessibilityRole="button" onPress={() => void responses.refetch()}><Text style={{ color: colors.primary, marginTop: 12 }}>Couldn’t load responses. Tap to retry.</Text></Pressable> : null}
            {responses.data?.length === 0 ? <Text style={{ color: colors.mutedForeground, marginTop: 14 }}>No responses yet.</Text> : null}
            {responses.data?.map(response => <View key={response.id} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 13, marginTop: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.foreground, fontWeight: '800' }}>{response.author.name}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, textTransform: 'capitalize' }}>{response.state}</Text>
              </View>
              <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19, marginTop: 5 }}>{response.message}</Text>
              {activeGig.state === 'open' && response.state === 'pending' ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 11 }}>
                <Pressable accessibilityRole="button" onPress={() => void decideResponse(response.id, true)} style={button(colors, true)}><Text style={{ color: colors.primaryForeground, fontSize: 12, fontWeight: '800' }}>Accept</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={() => void decideResponse(response.id, false)} style={button(colors)}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '800' }}>Decline</Text></Pressable>
              </View> : null}
            </View>)}
          </> : null}
        </ScrollView>
      </View>
    </Modal>
  </View>;
}
