import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useIsFocused, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResetVideoHistory } from "@workspace/api-client-react";
import { ReelPager } from "@/components/VideoReel";
import { usePagedVideos } from "@/components/videoKit";
import { useColors } from "@/hooks/useColors";

const FEEDS = [
  { id: "for-you", label: "For You" },
  { id: "following", label: "Following" },
  { id: "latest", label: "Latest" },
] as const;

export default function VideosScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [feed, setFeed] = useState<(typeof FEEDS)[number]["id"]>("for-you");
  const clips = usePagedVideos({ feed });
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
          <Text style={{ color: "#f6efe4", fontSize: 23, fontWeight: "800" }}>Clips for real life</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Reset video viewing history" disabled={reset.isPending} onPress={confirmReset}>
              <Feather name="rotate-ccw" size={19} color="#f6efe4" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Record or upload a clip" onPress={() => router.push("/video-studio")}>
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
      </View>
      {clips.isLoading && clips.items.length === 0
        ? <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /><Text style={{ marginTop: 12, color: "#f6efe4" }}>Finding clips for your circle…</Text></View>
        : clips.isError && clips.items.length === 0
          ? <Pressable accessibilityRole="button" onPress={clips.retry} style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}><Feather name="refresh-cw" size={28} color="#f6efe4" /><Text style={{ marginTop: 12, color: "#f6efe4", textAlign: "center" }}>Couldn't load videos. Tap to try again.</Text></Pressable>
          : clips.items.length
            ? <ReelPager items={clips.items} focused={focused} onEndReached={clips.loadNext} bottomInset={insets.bottom + 58}
                onRefresh={clips.refresh} refreshing={clips.isFetching && !clips.loadingMore}
                footer={clips.loadingMore ? <ActivityIndicator color="#f6efe4" style={{ padding: 16 }} accessibilityLabel="Loading more clips" /> : null} />
            : <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
                <Feather name="film" size={34} color="#f5c04a" />
                <Text style={{ color: "#f6efe4", fontSize: 20, fontWeight: "700", marginTop: 16 }}>Your circle, in motion</Text>
                <Text style={{ color: "rgba(246,239,228,.75)", textAlign: "center", marginTop: 8 }}>Record a clip, share a tip, or show what is happening near you.</Text>
                <Pressable accessibilityRole="button" onPress={() => router.push("/video-studio")} style={{ marginTop: 18, backgroundColor: colors.primary, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24 }}>
                  <Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>Create a clip</Text>
                </Pressable>
              </View>}
    </View>
  );
}
