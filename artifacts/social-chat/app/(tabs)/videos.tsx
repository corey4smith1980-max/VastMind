import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResetVideoHistory } from "@workspace/api-client-react";
import { ReelPager } from "@/components/VideoReel";
import { usePagedVideos } from "@/components/videoKit";
import { CreatePostSheet } from "@/components/PostEntry";
import { useColors } from "@/hooks/useColors";
import { StatusRing, useActiveStatuses } from "@/components/StatusRing";
import { AlertsButtonNative } from "@/components/common";

const FEEDS = [
  { id: "for-you", label: "For You" },
  { id: "following", label: "Following" },
  { id: "latest", label: "Latest" },
] as const;

export default function VideosScreen() {
  const colors = useColors();
  const router = useRouter();
  const routeParams = useLocalSearchParams<{ communityId?: string }>();
  const communityId = typeof routeParams.communityId === "string" ? routeParams.communityId : undefined;
  const { active: liveStatuses } = useActiveStatuses();
  const statusAuthors = new Set(liveStatuses.map((st) => st.author.id)).size;
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [feed, setFeed] = useState<(typeof FEEDS)[number]["id"]>("for-you");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const [posting, setPosting] = useState(false);
  const clips = usePagedVideos({ feed, includePosts: true, q: dq, communityId });
  const create = () => Alert.alert("Share something", "Pick what to add to Feed.", [
    { text: "Post, photo or poll", onPress: () => setPosting(true) },
    { text: "Clip", onPress: () => router.push("/video-studio") },
    { text: "Cancel", style: "cancel" },
  ]);
  const reset = useResetVideoHistory({ mutation: { onSuccess: clips.refresh } });

  const confirmReset = () => Alert.alert(
    "Reset your recommendations?",
    "This clears your video watch history. Follows and likes stay unchanged.",
    [
      { text: "Keep history", style: "cancel" },
      { text: "Clear history", style: "destructive", onPress: () => reset.mutate() },
    ],
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#10262b", paddingTop: insets.top }}>
      <View style={{ minHeight: 98, paddingHorizontal: 15, paddingTop: 5, paddingBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: "#f6efe4", fontSize: 23, fontWeight: "800" }}>{communityId ? "Community posts" : "Your feed"}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <AlertsButtonNative dark />
            <Pressable accessibilityRole="button" accessibilityLabel="Reset video viewing history" disabled={reset.isPending} onPress={confirmReset}>
              <Feather name="rotate-ccw" size={19} color="#f6efe4" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={statusAuthors ? `Open stories. ${statusAuthors} ${statusAuthors === 1 ? "person has" : "people have"} an active status` : "Open stories"} onPress={() => router.push("/stories")} hitSlop={6}>
              <StatusRing size={32} active={statusAuthors > 0} stroke={2}>
                <Feather name="aperture" size={17} color="#f6efe4" />
              </StatusRing>
              {statusAuthors ? <View pointerEvents="none" style={{ position: "absolute", top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: "#3B82F6", alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}><Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{statusAuthors}</Text></View> : null}
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Open communities and local opportunities" onPress={() => router.push("/communities")} hitSlop={6}>
              <Feather name="users" size={19} color="#f6efe4" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Create a post, photo, poll, or clip" onPress={create}>
              <Feather name="plus-circle" size={24} color="#f5c04a" />
            </Pressable>
          </View>
        </View>
        <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          {FEEDS.map(option => (
            <Pressable key={option.id} accessibilityRole="tab" accessibilityState={{ selected: feed === option.id }}
              onPress={() => setFeed(option.id)} style={{ borderRadius: 18, paddingHorizontal: 13, paddingVertical: 7, backgroundColor: feed === option.id ? "#f6efe4" : "rgba(255,255,255,.12)" }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: feed === option.id ? "#10262b" : "#f6efe4" }}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, backgroundColor: "rgba(255,255,255,.1)", borderRadius: 18, paddingHorizontal: 12 }}>
          <Feather name="search" size={14} color="rgba(246,239,228,.6)" />
          <TextInput accessibilityLabel="Search posts and clips" value={q} onChangeText={setQ} placeholder="Search posts and clips" placeholderTextColor="rgba(246,239,228,.5)" returnKeyType="search" style={{ flex: 1, minHeight: 36, color: "#f6efe4", fontSize: 13 }} />
          {q ? <Pressable accessibilityLabel="Clear search" onPress={() => setQ("")}><Feather name="x" size={14} color="#f6efe4" /></Pressable> : null}
        </View>
        {communityId ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Show all posts and clips" onPress={() => router.replace("/(tabs)/videos")}
            style={{ alignSelf: "flex-start", marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: "rgba(255,255,255,.12)", flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Feather name="users" size={12} color="#f6efe4" />
            <Text style={{ color: "#f6efe4", fontSize: 10, fontWeight: "700" }}>Community posts · Show all</Text>
          </Pressable>
        ) : null}
      </View>
      {clips.isLoading && clips.items.length === 0
        ? <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /><Text style={{ marginTop: 12, color: "#f6efe4" }}>Finding clips for your circle…</Text></View>
        : clips.isError && clips.items.length === 0
          ? <Pressable accessibilityRole="button" onPress={clips.retry} style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}><Feather name="refresh-cw" size={28} color="#f6efe4" /><Text style={{ marginTop: 12, color: "#f6efe4", textAlign: "center" }}>Couldn't load your feed. Tap to try again.</Text></Pressable>
          : clips.items.length
            ? <ReelPager items={clips.items} focused={focused} onEndReached={clips.loadNext} bottomInset={insets.bottom + 58}
                onRefresh={clips.refresh} refreshing={clips.isFetching && !clips.loadingMore}
                footer={clips.loadingMore ? <ActivityIndicator color="#f6efe4" style={{ padding: 16 }} accessibilityLabel="Loading more clips" /> : null} />
            : <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
                <Feather name="film" size={34} color="#f5c04a" />
                <Text style={{ color: "#f6efe4", fontSize: 20, fontWeight: "700", marginTop: 16 }}>{dq ? "Nothing matches" : "Your circle, in motion"}</Text>
                <Text style={{ color: "rgba(246,239,228,.75)", textAlign: "center", marginTop: 8 }}>{dq ? `No posts or clips mention "${dq}".` : "Post a thought, ask a poll, or record a clip."}</Text>
                <Pressable accessibilityRole="button" onPress={create} style={{ marginTop: 18, backgroundColor: colors.primary, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24 }}>
                  <Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>Share something</Text>
                </Pressable>
              </View>}
      {posting ? <CreatePostSheet onClose={() => setPosting(false)} onPublished={() => { setPosting(false); clips.refresh(); }} /> : null}
    </View>
  );
}
