import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable,
  RefreshControl, ScrollView, Text, TextInput, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  closeCommunityGig, completeCommunityGig, createCommunityGig, createCommunityGigResponse,
  createCommunity, decideCommunityGigResponse, joinCommunity,
  listCommunityGigResponses, listCommunityGigs, getListCommunitiesQueryKey,
  useListCommunities,
  type CommunityGig, type CommunityGigCategory, type CommunityGigCreate, type CommunityInput,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAppStore } from "@/state/AppStore";
import { AlertsButtonNative } from "@/components/common";

const CATEGORIES: { id: CommunityGigCategory; label: string }[] = [
  { id: "home-repairs", label: "Home & repairs" },
  { id: "learning", label: "Learning" },
  { id: "creative", label: "Creative" },
  { id: "technology", label: "Technology" },
  { id: "personal-care", label: "Personal care" },
  { id: "food-events", label: "Food & events" },
  { id: "transport", label: "Transport" },
  { id: "errands", label: "Errands" },
  { id: "childcare", label: "Childcare" },
  { id: "other", label: "Other" },
];
const GROUP_CATEGORIES = ["work", "hobbies", "location", "learning", "neighborhood", "other"];

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const when = (date: string) => {
  const days = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000));
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
};
const fail = (title: string, error: unknown) => Alert.alert(
  title,
  error instanceof Error ? error.message.slice(0, 180) : "Please try again.",
);

export default function CommunitiesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAppStore();
  const [scope, setScope] = useState<"community" | "mine">("community");
  const [area, setArea] = useState<"opportunities" | "communities">("opportunities");
  const [groupCategory, setGroupCategory] = useState("all");
  const [memberGroupsOnly, setMemberGroupsOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [kind, setKind] = useState<"offer" | "request" | "all">("all");
  const [category, setCategory] = useState<CommunityGigCategory | "all">("all");
  const [communityId, setCommunityId] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupDraft, setGroupDraft] = useState<CommunityInput>({
    name: "", description: "", category: "neighborhood", isPrivate: false,
  });
  const [responseGig, setResponseGig] = useState<CommunityGig | null>(null);
  const [responsesGig, setResponsesGig] = useState<CommunityGig | null>(null);
  const [responseText, setResponseText] = useState("");
  const [draft, setDraft] = useState<CommunityGigCreate>({
    communityId: "", kind: "offer", title: "", description: "", category: "other", rateNote: "",
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 280);
    return () => clearTimeout(timer);
  }, [query]);

  const communities = useListCommunities();
  const joined = (communities.data ?? []).filter((group) => group.membership === "member");
  const groupResults = (communities.data ?? []).filter((group) =>
    (!debouncedQuery || `${group.name} ${group.description} ${group.category}`.toLowerCase().includes(debouncedQuery.toLowerCase())) &&
    (groupCategory === "all" || group.category.toLowerCase() === groupCategory) &&
    (!memberGroupsOnly || group.membership === "member"));
  const params = useMemo(() => ({
    scope,
    ...(debouncedQuery ? { q: debouncedQuery } : {}),
    ...(kind !== "all" ? { kind } : {}),
    ...(category !== "all" ? { category } : {}),
    ...(communityId !== "all" ? { communityId } : {}),
  }), [scope, debouncedQuery, kind, category, communityId]);
  const listings = useQuery({
    queryKey: ["community-gigs", params],
    queryFn: () => listCommunityGigs(params),
    staleTime: 15_000,
  });
  const responses = useQuery({
    queryKey: ["community-gig-responses", responsesGig?.id],
    queryFn: () => listCommunityGigResponses(responsesGig!.id),
    enabled: !!responsesGig,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["community-gigs"] });
  const refreshResponses = () => {
    void refresh();
    if (responsesGig) void queryClient.invalidateQueries({ queryKey: ["community-gig-responses", responsesGig.id] });
  };

  const createListing = useMutation({
    mutationFn: (data: CommunityGigCreate) => createCommunityGig(data),
    onSuccess: () => {
      setCreateOpen(false);
      setScope("mine");
      setQuery(""); setDebouncedQuery(""); setKind("all"); setCategory("all"); setCommunityId("all");
      setDraft({ communityId: joined[0]?.id ?? "", kind: "offer", title: "", description: "", category: "other", rateNote: "" });
      void refresh();
      Alert.alert("Listing posted", "Community members can now see your listing.");
    },
    onError: (error) => fail("Could not publish listing", error),
  });
  const createGroup = useMutation({
    mutationFn: (data: CommunityInput) => createCommunity(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: getListCommunitiesQueryKey() });
      setCreateGroupOpen(false);
      setArea("communities");
      setGroupDraft({ name: "", description: "", category: "neighborhood", isPrivate: false });
      Alert.alert("Community created", "Your community is ready. You are its first member and admin.");
    },
    onError: (error) => fail("Could not create community", error),
  });
  const joinGroup = useMutation({
    mutationFn: (id: string) => joinCommunity(id),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListCommunitiesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: ["community-gigs"] }),
      ]);
      Alert.alert(result.membership === "requested" ? "Request sent" : "You joined", result.membership === "requested"
        ? "The community admins will review your request."
        : "You can now share and respond to opportunities in this community.");
    },
    onError: (error) => fail("Could not join community", error),
  });
  const sendResponse = useMutation({
    mutationFn: ({ gigId, message }: { gigId: string; message: string }) =>
      createCommunityGigResponse(gigId, { message }),
    onSuccess: () => {
      setResponseGig(null); setResponseText(""); void refresh();
      Alert.alert("Introduction sent", "Your private response was sent to the listing author.");
    },
    onError: (error) => fail("Could not send response", error),
  });
  const decide = useMutation({
    mutationFn: ({ gigId, responseId, accept }: { gigId: string; responseId: string; accept: boolean }) =>
      decideCommunityGigResponse(gigId, responseId, { accept }),
    onSuccess: refreshResponses,
    onError: (error) => fail("Could not update response", error),
  });
  const complete = useMutation({
    mutationFn: (gigId: string) => completeCommunityGig(gigId),
    onSuccess: () => { refreshResponses(); Alert.alert("Opportunity completed", "The community listing is marked complete."); },
    onError: (error) => fail("Could not complete listing", error),
  });
  const close = useMutation({
    mutationFn: (gigId: string) => closeCommunityGig(gigId),
    onSuccess: () => { refreshResponses(); Alert.alert("Listing closed", "It is no longer accepting responses."); },
    onError: (error) => fail("Could not close listing", error),
  });

  const openCreate = () => {
    if (!joined.length) {
      Alert.alert("Join a community first", "Listings are shared within communities you have joined.");
      return;
    }
    setDraft({ communityId: joined[0].id, kind: "offer", title: "", description: "", category: "other", rateNote: "" });
    setCreateOpen(true);
  };
  const showButton = (label: string, action: () => void, icon?: keyof typeof Feather.glyphMap, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={action}
      style={{
        minHeight: 42, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1,
        borderColor: colors.border, backgroundColor: colors.card,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon ? <Feather name={icon} size={15} color={colors.primary} /> : null}
      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
  const chip = (label: string, selected: boolean, action: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={action}
      style={{
        minHeight: 36, borderRadius: 18, paddingHorizontal: 13,
        borderWidth: 1, borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primary : colors.card,
        justifyContent: "center",
      }}
    >
      <Text style={{ color: selected ? colors.primaryForeground : colors.foreground, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
  const field = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    placeholder: string,
    options: { multiline?: boolean; maxLength?: number } = {},
  ) => (
    <View style={{ gap: 7, marginTop: 14 }}>
      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700" }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        maxLength={options.maxLength}
        multiline={options.multiline}
        textAlignVertical={options.multiline ? "top" : "center"}
        style={{
          minHeight: options.multiline ? 98 : 46, borderRadius: 14, padding: 12,
          borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
          color: colors.foreground, fontSize: 14,
        }}
      />
    </View>
  );

  const updateCommunity = (id: string) => setDraft((old) => ({ ...old, communityId: id }));
  const updateCategory = (id: CommunityGigCategory) => setDraft((old) => ({ ...old, category: id }));
  const submitDraft = () => {
    if (!draft.communityId || draft.title.trim().length < 3 || draft.description.trim().length < 3) {
      Alert.alert("Complete the listing", "Choose a community and add a title and description.");
      return;
    }
    createListing.mutate({ ...draft, title: draft.title.trim(), description: draft.description.trim(), rateNote: draft.rateNote?.trim() ?? "" });
  };

  const renderGig = (gig: CommunityGig) => {
    const isOwner = gig.author.id === profile?.id;
    const canComplete = gig.state === "matched" && (isOwner || gig.myResponseState === "accepted");
    const stateColor = gig.state === "open" ? colors.primary : colors.mutedForeground;
    return (
      <View
        key={gig.id}
        style={{
          padding: 16, marginBottom: 12, borderRadius: 20, borderWidth: 1,
          borderColor: colors.border, backgroundColor: colors.card,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.7 }}>
              {gig.kind === "offer" ? "Skill offered" : "Help requested"} · {gig.communityName}
            </Text>
            <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "800", marginTop: 5 }}>{gig.title}</Text>
          </View>
          <View style={{ borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: colors.background }}>
            <Text style={{ color: stateColor, fontSize: 10, fontWeight: "800" }}>{titleCase(gig.state)}</Text>
          </View>
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 8 }}>
          {gig.author.name} · {when(gig.createdAt)} · {CATEGORIES.find((entry) => entry.id === gig.category)?.label ?? "Other"}
        </Text>
        <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 20, marginTop: 12 }}>{gig.description}</Text>
        {gig.rateNote ? (
          <View style={{ marginTop: 12, padding: 11, borderRadius: 12, backgroundColor: colors.background }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 10, fontWeight: "700" }}>RATE / BUDGET NOTE</Text>
            <Text style={{ color: colors.foreground, fontSize: 12, marginTop: 4 }}>{gig.rateNote}</Text>
          </View>
        ) : null}
        {gig.myResponseState ? (
          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700", marginTop: 12 }}>
            Your response: {titleCase(gig.myResponseState)}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {isOwner ? showButton(`Responses · ${gig.responseCount}`, () => setResponsesGig(gig), "users")
            : gig.state === "open" && !gig.myResponseId
              ? showButton(gig.kind === "offer" ? "Ask about this skill" : "Offer help", () => { setResponseGig(gig); setResponseText(""); }, "message-circle")
              : null}
          {canComplete ? showButton("Mark complete", () => complete.mutate(gig.id), "check-circle", complete.isPending) : null}
          {isOwner && gig.state === "open" ? showButton("Close listing", () => close.mutate(gig.id), "x-circle", close.isPending) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 18, paddingBottom: 13, borderBottomWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} hitSlop={10}>
            <Feather name="arrow-left" size={21} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "800" }}>Communities</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2 }}>Find nearby help. Share what you know.</Text>
          </View>
          <AlertsButtonNative />
          <Pressable accessibilityRole="button" accessibilityLabel="Create a skill offer or help request" onPress={openCreate}
            style={{ minHeight: 40, borderRadius: 14, paddingHorizontal: 12, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="plus" size={16} color={colors.primaryForeground} />
            <Text style={{ color: colors.primaryForeground, fontWeight: "800", fontSize: 11 }}>Post</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 15, paddingBottom: insets.bottom + 120 }}
        refreshControl={<RefreshControl refreshing={listings.isRefetching && !listings.isLoading} onRefresh={() => void refresh()} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ padding: 14, borderRadius: 17, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "800" }}>A community for skills and help</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 17, marginTop: 5 }}>
            Ask your community for help or offer a skill to neighbors. Listings are scoped to groups you join; no precise location is collected.
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15, marginTop: 8 }}>
            Payment is arranged between members. VastMind checkout and payouts are not enabled.
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 15 }}>
          {chip("Opportunities", area === "opportunities", () => setArea("opportunities"))}
          {chip("Discover communities", area === "communities", () => setArea("communities"))}
        </View>

        {area === "communities" ? (
          <View style={{ marginTop: 13 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "800" }}>Find your people</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 3 }}>Explore work, hobby, learning, and neighborhood groups.</Text>
              </View>
              {showButton("Create", () => {
                setGroupDraft({ name: "", description: "", category: "neighborhood", isPrivate: false });
                setCreateGroupOpen(true);
              }, "plus")}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 13 }}>
              {chip("All groups", groupCategory === "all", () => setGroupCategory("all"))}
              {GROUP_CATEGORIES.map((tag) => chip(titleCase(tag), groupCategory === tag, () => setGroupCategory(tag)))}
              {chip("Joined", memberGroupsOnly, () => setMemberGroupsOnly((value) => !value))}
            </View>
            {communities.isPending ? (
              <View style={{ alignItems: "center", paddingVertical: 36 }}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.mutedForeground, marginTop: 10 }}>Finding communities…</Text></View>
            ) : communities.isError ? (
              <Pressable accessibilityRole="button" onPress={() => void communities.refetch()} style={{ alignItems: "center", paddingVertical: 34 }}>
                <Text style={{ color: colors.foreground }}>Couldn’t load communities. Tap to retry.</Text>
              </Pressable>
            ) : groupResults.length ? groupResults.map((group) => (
              <View key={group.id} style={{ padding: 15, marginTop: 11, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 9 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }}>
                    <Feather name={group.isPrivate ? "lock" : "users"} size={17} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "800" }}>{group.name}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 10, marginTop: 3 }}>
                      {titleCase(group.category)} · {group.memberCount} member{group.memberCount === 1 ? "" : "s"} · {group.isPrivate ? "Private" : "Public"}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 18, marginTop: 12 }}>{group.description}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 13 }}>
                  {group.membership === "member" ? (
                    <>
                      {showButton("Community posts", () => router.push({ pathname: "/(tabs)/videos", params: { communityId: group.id } }), "message-circle")}
                      {showButton("Opportunities", () => { setArea("opportunities"); setScope("community"); setCommunityId(group.id); }, "briefcase")}
                    </>
                  ) : group.membership === "requested" ? (
                    showButton("Request pending", () => {}, "clock", true)
                  ) : (
                    showButton(group.isPrivate ? "Request to join" : "Join community", () => joinGroup.mutate(group.id), "user-plus", joinGroup.isPending)
                  )}
                </View>
              </View>
            )) : (
              <View style={{ alignItems: "center", padding: 24, marginTop: 12, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                <Feather name="users" size={24} color={colors.primary} />
                <Text style={{ color: colors.foreground, fontWeight: "800", marginTop: 10 }}>No matching communities</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 5, textAlign: "center" }}>Try another category or start a community of your own.</Text>
              </View>
            )}
          </View>
        ) : (
        <>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
          {chip("Community", scope === "community", () => setScope("community"))}
          {chip("My opportunities", scope === "mine", () => setScope("mine"))}
        </View>

        <View style={{
          flexDirection: "row", alignItems: "center", gap: 8, marginTop: 13, paddingHorizontal: 12,
          minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
        }}>
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            accessibilityLabel="Search community offers and requests"
            value={query}
            onChangeText={setQuery}
            placeholder="Search skills and requests"
            placeholderTextColor={colors.mutedForeground}
            style={{ flex: 1, color: colors.foreground, fontSize: 13, minHeight: 40 }}
            returnKeyType="search"
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
          {chip("All communities", communityId === "all", () => setCommunityId("all"))}
          {joined.map((group) => chip(group.name, communityId === group.id, () => setCommunityId(group.id)))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
          {chip("All types", kind === "all", () => setKind("all"))}
          {chip("Skills offered", kind === "offer", () => setKind("offer"))}
          {chip("Help requested", kind === "request", () => setKind("request"))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
          {chip("All skills", category === "all", () => setCategory("all"))}
          {CATEGORIES.map((option) => chip(option.label, category === option.id, () => setCategory(option.id)))}
        </ScrollView>

        {listings.isLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 42 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.mutedForeground, marginTop: 10, fontSize: 12 }}>Loading community opportunities…</Text>
          </View>
        ) : listings.isError ? (
          <Pressable accessibilityRole="button" onPress={() => void listings.refetch()} style={{ alignItems: "center", paddingVertical: 36 }}>
            <Feather name="refresh-cw" size={22} color={colors.primary} />
            <Text style={{ color: colors.foreground, fontWeight: "700", marginTop: 10 }}>Couldn’t load listings. Tap to retry.</Text>
          </Pressable>
        ) : listings.data?.length ? listings.data.map(renderGig) : (
          <View style={{ alignItems: "center", paddingVertical: 30, paddingHorizontal: 24, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
            <Feather name="map" size={25} color={colors.primary} />
            <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "800", marginTop: 10 }}>
              {scope === "mine" ? "Your opportunities will show here" : "No matching opportunities yet"}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 6 }}>
              {scope === "mine" ? "Post a skill you can share or ask for help in one of your communities." : "Try a different filter or post a skill offer or help request."}
            </Text>
          </View>
        )}
        </>
        )}
      </ScrollView>

      <Modal visible={createOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
          <View style={{ paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 21, fontWeight: "800" }}>New opportunity</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 3 }}>Offer a skill or ask your community for help.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close form" onPress={() => setCreateOpen(false)}><Feather name="x" size={22} color={colors.foreground} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 28 }} keyboardShouldPersistTaps="handled">
            <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700" }}>What do you need?</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              {chip("Offer a skill", draft.kind === "offer", () => setDraft((old) => ({ ...old, kind: "offer" })))}
              {chip("Request help", draft.kind === "request", () => setDraft((old) => ({ ...old, kind: "request" })))}
            </View>
            <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700", marginTop: 16 }}>Community</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
              {joined.map((group) => chip(group.name, draft.communityId === group.id, () => updateCommunity(group.id)))}
            </ScrollView>
            {field("Title", draft.title, (title) => setDraft((old) => ({ ...old, title })), draft.kind === "offer" ? "What can you help with?" : "What help do you need?", { maxLength: 100 })}
            <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700", marginTop: 14 }}>Skill category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
              {CATEGORIES.map((option) => chip(option.label, draft.category === option.id, () => updateCategory(option.id)))}
            </ScrollView>
            {field("Details", draft.description, (description) => setDraft((old) => ({ ...old, description })), "Describe the work, skills, timing, and expectations. Keep personal contact details private.", { multiline: true, maxLength: 2000 })}
            {field("Rate or budget note (optional)", draft.rateNote ?? "", (rateNote) => setDraft((old) => ({ ...old, rateNote })), "Add a rate, estimate, or say it is negotiable.", { maxLength: 120 })}
            <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15, marginTop: 8 }}>
              Share only the details needed to discuss the work. VastMind does not process this listing’s payment.
            </Text>
            <View style={{ marginTop: 18 }}>{showButton(createListing.isPending ? "Posting…" : "Publish opportunity", submitDraft, "arrow-up-right", createListing.isPending || joined.length === 0)}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={createGroupOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCreateGroupOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
          <View style={{ paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 21, fontWeight: "800" }}>Create a community</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 3 }}>Bring people together around a shared place or interest.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close community form" onPress={() => setCreateGroupOpen(false)}><Feather name="x" size={22} color={colors.foreground} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
            {field("Community name", groupDraft.name, (name) => setGroupDraft((old) => ({ ...old, name })), "A clear name for your group", { maxLength: 80 })}
            {field("About this community", groupDraft.description, (description) => setGroupDraft((old) => ({ ...old, description })), "Share what the group is for and who should join.", { multiline: true, maxLength: 500 })}
            <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700", marginTop: 14 }}>Category</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {GROUP_CATEGORIES.map((tag) => chip(titleCase(tag), groupDraft.category === tag, () => setGroupDraft((old) => ({ ...old, category: tag }))))}
            </View>
            <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700", marginTop: 16 }}>Membership</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              {chip("Public", !groupDraft.isPrivate, () => setGroupDraft((old) => ({ ...old, isPrivate: false })))}
              {chip("Private · approval required", groupDraft.isPrivate, () => setGroupDraft((old) => ({ ...old, isPrivate: true })))}
            </View>
            <View style={{ marginTop: 18 }}>{showButton(createGroup.isPending ? "Creating…" : "Create community", () => {
              if (groupDraft.name.trim().length < 2 || groupDraft.description.trim().length < 2) {
                Alert.alert("Complete the community details", "Add a name and a short description.");
                return;
              }
              createGroup.mutate({ ...groupDraft, name: groupDraft.name.trim(), description: groupDraft.description.trim() });
            }, "users", createGroup.isPending)}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!responseGig} transparent animationType="fade" onRequestClose={() => setResponseGig(null)}>
        <View style={{ flex: 1, justifyContent: "center", padding: 18, backgroundColor: "rgba(0,0,0,.55)" }}>
          <View style={{ padding: 18, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "800" }}>Send a private introduction</Text>
            <Text style={{ color: colors.mutedForeground, marginTop: 6, fontSize: 12 }}>{responseGig?.title}</Text>
            <View style={{ marginTop: 14 }}>
              {field("Your message", responseText, setResponseText, "Briefly explain how you can help. Avoid private contact details.", { multiline: true, maxLength: 1200 })}
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              <View style={{ flex: 1 }}>{showButton("Cancel", () => setResponseGig(null))}</View>
              <View style={{ flex: 1 }}>
                {showButton(sendResponse.isPending ? "Sending…" : "Send response", () => {
                  if (responseGig && responseText.trim().length >= 2) sendResponse.mutate({ gigId: responseGig.id, message: responseText.trim() });
                }, "send", sendResponse.isPending || responseText.trim().length < 2)}
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!responsesGig} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setResponsesGig(null)}>
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
          <View style={{ paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "800" }}>Responses</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 3 }}>{responsesGig?.title}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close responses" onPress={() => setResponsesGig(null)}><Feather name="x" size={22} color={colors.foreground} /></Pressable>
          </View>
          {responses.isLoading ? <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} /> : responses.isError ? (
            <Pressable accessibilityRole="button" onPress={() => void responses.refetch()} style={{ alignItems: "center", padding: 24 }}>
              <Text style={{ color: colors.foreground }}>Couldn’t load private responses. Tap to retry.</Text>
            </Pressable>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
              {!responses.data?.length ? <Text style={{ color: colors.mutedForeground, padding: 20, textAlign: "center" }}>No visible responses yet.</Text> : null}
              {responses.data?.map((response) => (
                <View key={response.id} style={{ borderRadius: 18, padding: 15, marginBottom: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "800" }}>{response.author.name}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 10, marginTop: 3 }}>{titleCase(response.state)} · {when(response.createdAt)}</Text>
                  <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 20, marginTop: 12 }}>{response.message}</Text>
                  {response.state === "pending" && responsesGig?.state === "open" ? (
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 13 }}>
                      <View style={{ flex: 1 }}>{showButton(decide.isPending ? "Saving…" : "Accept", () => {
                        if (responsesGig) decide.mutate({ gigId: responsesGig.id, responseId: response.id, accept: true });
                      }, "check", decide.isPending)}</View>
                      <View style={{ flex: 1 }}>{showButton("Decline", () => {
                        if (responsesGig) decide.mutate({ gigId: responsesGig.id, responseId: response.id, accept: false });
                      }, "x", decide.isPending)}</View>
                    </View>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}
