import React, { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getGetCreatorQueryKey, useGetCreator, useToggleUserFollow } from "@workspace/api-client-react";
import { ReelPager } from "@/components/VideoReel";
import { usePagedVideos } from "@/components/videoKit";
import { useAppStore, initials } from "@/state/AppStore";
import { useColors } from "@/hooks/useColors";

export default function CreatorScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const cache = useQueryClient();
  const { profile } = useAppStore();
  const creator = useGetCreator(id, { query: { queryKey: getGetCreatorQueryKey(id), enabled: !!id } });
  const clips = usePagedVideos({ creatorId: creator.data?.user.id ?? "" }, !!creator.data?.user.id);
  const [playing, setPlaying] = useState<string | null>(null);
  const follow = useToggleUserFollow({ mutation: { onSuccess: () => { void cache.invalidateQueries({ queryKey: getGetCreatorQueryKey(id) }); } } });
  const page = creator.data;
  const isMe = profile?.id === page?.user.id;
  const user = page?.user;

  if (creator.isLoading) return <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>;
  if (!user || creator.isError) return <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 28 }}>
    <Feather name="user-x" size={30} color={colors.mutedForeground} />
    <Text style={{ color: colors.foreground, marginTop: 14, textAlign: "center" }}>This creator profile is unavailable or private.</Text>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ padding: 14 }}><Text style={{ color: colors.primary, fontWeight: "700" }}>Go back</Text></Pressable>
  </View>;

  const clipItem = ({ item }: { item: (typeof clips.items)[number] }) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`Play ${item.content}`} onPress={() => setPlaying(item.id)}
      style={{ width: "48%", minHeight: 102, marginBottom: 10, padding: 14, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
      <Feather name="play-circle" size={24} color={colors.primary} />
      <Text style={{ color: colors.foreground, fontWeight: "600", marginTop: 10 }} numberOfLines={3}>{item.content}</Text>
    </Pressable>
  );

  return <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 12 }}>
    <View style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 12 }}>
      <Pressable accessibilityLabel="Back" onPress={() => router.back()}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable>
      <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.primaryForeground, fontSize: 16, fontWeight: "700" }}>{initials(user.name)}</Text>
      </View>
      <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: "800", fontSize: 18 }}>{user.name}</Text><Text style={{ color: colors.mutedForeground }}>@{user.username}</Text></View>
      {!isMe ? <Pressable accessibilityRole="button" accessibilityLabel={user.following ? "Unfollow creator" : "Follow creator"} onPress={() => follow.mutate({ userId: user.id })} disabled={follow.isPending}
        style={{ backgroundColor: user.following ? colors.secondary : colors.primary, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9 }}><Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>{user.following ? "Following" : "Follow"}</Text></Pressable> : null}
    </View>
    {!!page.bio && <Text style={{ color: colors.foreground, paddingHorizontal: 22, paddingBottom: 16 }}>{page.bio}</Text>}
    <View style={{ flexDirection: "row", justifyContent: "space-around", borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 14 }}>
      {[[page.clipsCount, "Clips"], [page.followersCount, "Followers"], [page.followingCount, "Following"]].map(([value, label]) => <View key={String(label)} style={{ alignItems: "center" }}><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 17 }}>{value}</Text><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{label}</Text></View>)}
    </View>
    {clips.isError ? <Pressable onPress={clips.retry} style={{ padding: 20 }}><Text style={{ color: colors.destructive }}>Couldn't load this creator's clips. Tap to retry.</Text></Pressable>
      : clips.items.length ? <FlatList data={clips.items} keyExtractor={post => post.id} numColumns={2} columnWrapperStyle={{ justifyContent: "space-between", paddingHorizontal: 14, gap: 8 }}
          contentContainerStyle={{ paddingTop: 18, paddingBottom: 28 }} renderItem={clipItem}
          onEndReached={() => { if (clips.hasMore) clips.loadNext(); }} onEndReachedThreshold={0.4} />
        : <View style={{ alignItems: "center", padding: 34 }}><Feather name="film" size={26} color={colors.mutedForeground} /><Text style={{ color: colors.mutedForeground, marginTop: 10 }}>No clips to see yet</Text></View>}
    {playing ? <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "#10262b" }}>
      <Pressable accessibilityRole="button" onPress={() => setPlaying(null)} style={{ height: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 10 }}><Feather name="x" size={22} color="#f6efe4" /><Text style={{ color: "#f6efe4", fontWeight: "700" }}>Close clips</Text></Pressable>
      <ReelPager items={clips.items} focused onEndReached={clips.loadNext} initialIndex={Math.max(0, clips.items.findIndex(p => p.id === playing))} bottomInset={28} />
    </View> : null}
  </View>;
}
