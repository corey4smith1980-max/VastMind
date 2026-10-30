import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { COMMUNITY_POST_TOPICS, type CommunityPostTopic } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CreatePostSheet, PostEntry } from "@/components/PostEntry";
import { CommunityMarketplace } from "@/components/CommunityMarketplace";
import { usePagedVideos } from "@/components/videoKit";
import { useColors } from "@/hooks/useColors";

/** Public text, photo and poll discussion feed; this never loads short clips. */
export default function CommunityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const [composerOpen, setComposerOpen] = useState(false);
  const [view, setView] = useState<"posts" | "opportunities">("posts");
  const [topic, setTopic] = useState<CommunityPostTopic | "all">("all");
  const [search, setSearch] = useState("");
  const [settledSearch, setSettledSearch] = useState("");
  useEffect(() => {
    const timeout = setTimeout(() => setSettledSearch(search.trim()), 300);
    return () => clearTimeout(timeout);
  }, [search]);
  const posts = usePagedVideos({ surface: "community", feed: "latest", q: settledSearch, topic: topic === "all" ? undefined : topic });
  const cardHeight = useMemo(() => Math.min(560, Math.max(420, viewportHeight * 0.58)), [viewportHeight]);

  return <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
    <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: "800" }}>Community</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>Find opportunities, get help, offer skills, and connect.</Text>
        </View>
        {view === "posts" ? <Pressable accessibilityRole="button" accessibilityLabel="Create a community post" onPress={() => setComposerOpen(true)} style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary }}>
          <Feather name="plus" size={22} color={colors.primaryForeground} />
        </Pressable> : null}
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12, padding: 4, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
        {([["posts", "Community posts"], ["opportunities", "Help & skills"]] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: view === value }} onPress={() => { setView(value); setComposerOpen(false); }}
          style={{ flex: 1, minHeight: 38, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: view === value ? colors.primary : "transparent" }}>
          <Text style={{ color: view === value ? colors.primaryForeground : colors.mutedForeground, fontSize: 12, fontWeight: "800" }}>{label}</Text>
        </Pressable>)}
      </View>
      {view === "posts" ? <>
      <Pressable accessibilityRole="button" onPress={() => setComposerOpen(true)} style={{ marginTop: 12, minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card, paddingHorizontal: 14, justifyContent: "center" }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Share an opportunity, ask for help, or offer a skill…</Text>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginTop: 10, minHeight: 42, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card, paddingHorizontal: 12 }}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          accessibilityLabel="Search Community posts"
          value={search}
          onChangeText={setSearch}
          placeholder="Search Community posts"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="search"
          autoCapitalize="sentences"
          style={{ flex: 1, minHeight: 40, color: colors.foreground, fontSize: 14 }}
        />
        {search ? <Pressable accessibilityRole="button" accessibilityLabel="Clear Community search" hitSlop={10} onPress={() => setSearch("")}>
          <Feather name="x" size={16} color={colors.foreground} />
        </Pressable> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10, paddingRight: 8 }}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: topic === "all" }} onPress={() => setTopic("all")}
          style={{ minHeight: 34, justifyContent: "center", borderRadius: 18, paddingHorizontal: 12, backgroundColor: topic === "all" ? colors.primary : colors.card, borderWidth: 1, borderColor: topic === "all" ? colors.primary : colors.border }}>
          <Text style={{ color: topic === "all" ? colors.primaryForeground : colors.foreground, fontSize: 11, fontWeight: "700" }}>All</Text>
        </Pressable>
        {COMMUNITY_POST_TOPICS.map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected: topic === option.id }} onPress={() => setTopic(option.id)}
          style={{ minHeight: 34, justifyContent: "center", borderRadius: 18, paddingHorizontal: 12, backgroundColor: topic === option.id ? colors.primary : colors.card, borderWidth: 1, borderColor: topic === option.id ? colors.primary : colors.border }}>
          <Text style={{ color: topic === option.id ? colors.primaryForeground : colors.foreground, fontSize: 11, fontWeight: "700" }}>{option.label}</Text>
        </Pressable>)}
      </ScrollView>
      </> : null}
    </View>

    {view === "posts" ? <FlatList
      data={posts.items}
      keyExtractor={item => item.id}
      renderItem={({ item }) => <PostEntry post={item} height={cardHeight} near bottomInset={0} variant="community" />}
      onEndReached={() => posts.loadNext()}
      onEndReachedThreshold={0.7}
      initialNumToRender={2}
      maxToRenderPerBatch={3}
      windowSize={5}
      refreshControl={<RefreshControl refreshing={posts.isFetching && !posts.loadingMore} onRefresh={posts.refresh} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 82, flexGrow: 1 }}
      ListEmptyComponent={posts.isLoading
        ? <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 36 }}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.mutedForeground, marginTop: 12 }}>Loading Community…</Text></View>
        : posts.isError
          ? <Pressable accessibilityRole="button" onPress={posts.retry} style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 36 }}><Feather name="refresh-cw" size={28} color={colors.primary} /><Text style={{ color: colors.foreground, textAlign: "center", marginTop: 12 }}>Couldn't load posts. Tap to retry.</Text></Pressable>
          : <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 36 }}><Feather name={settledSearch ? "search" : "message-square"} size={32} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 19, fontWeight: "700", marginTop: 14 }}>{settledSearch || topic !== "all" ? "No matching posts" : "Start a connection"}</Text><Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: 6 }}>{settledSearch ? `No Community posts match "${settledSearch}". Try another search.` : topic !== "all" ? `No ${COMMUNITY_POST_TOPICS.find(option => option.id === topic)?.label.toLowerCase()} posts yet.` : "Share an opportunity, ask for help, or offer a skill to get started."}</Text></View>}
      ListFooterComponent={posts.loadingMore ? <ActivityIndicator color={colors.primary} style={{ padding: 18 }} accessibilityLabel="Loading more community posts" /> : null}
    /> : <CommunityMarketplace bottomInset={insets.bottom} />}
    {composerOpen ? <CreatePostSheet surface="community" initialCommunityTopic={topic === "all" ? undefined : topic} onClose={() => setComposerOpen(false)} onPublished={() => { setComposerOpen(false); posts.refresh(); }} /> : null}
  </View>;
}
