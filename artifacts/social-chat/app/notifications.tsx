import React from "react";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { getListNotificationsQueryKey, useListNotifications, useMarkNotificationRead } from "@workspace/api-client-react";
import { AppHeader, PageFrame, StorageNotice } from "@/components/common";
import { useColors } from "@/hooks/useColors";

const ICONS: Record<string, React.ComponentProps<typeof Feather>["name"]> = {
  message: "message-circle",
  reaction: "heart",
  comment: "message-square",
  community: "users",
  channel: "radio",
};

export default function NotificationsScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const queryKey = getListNotificationsQueryKey();
  const notifications = useListNotifications({ query: { queryKey, refetchInterval: 30_000 } });
  const markRead = useMarkNotificationRead({
    mutation: { onSuccess: () => void queryClient.invalidateQueries({ queryKey }) },
  });

  const openNotification = (item: NonNullable<typeof notifications.data>[number]) => {
    if (!item.read) markRead.mutate({ notificationId: item.id });
    switch (item.type) {
      case "message": router.push("/(tabs)/chats"); break;
      case "community": router.push("/communities"); break;
      case "channel": router.push("/(tabs)/channels"); break;
      default: router.push("/(tabs)/videos"); break;
    }
  };

  return (
    <PageFrame>
      <AppHeader showAlerts={false} />
      <StorageNotice />
      <Text style={{ color: colors.foreground, fontSize: 29, fontWeight: "800", letterSpacing: -0.7 }}>Alerts</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 5, marginBottom: 18 }}>
        Your messages, reactions and community updates.
      </Text>
      {notifications.isLoading ? (
        <View style={{ padding: 30, alignItems: "center" }}><ActivityIndicator color={colors.primary} accessibilityLabel="Loading alerts" /></View>
      ) : notifications.isError ? (
        <Pressable accessibilityRole="button" onPress={() => void notifications.refetch()} style={{ padding: 20, alignItems: "center" }}>
          <Feather name="refresh-cw" size={22} color={colors.primary} />
          <Text style={{ color: colors.foreground, marginTop: 8 }}>Couldn't load alerts. Tap to retry.</Text>
        </Pressable>
      ) : notifications.data?.length ? (
        <View style={{ gap: 8 }}>
          {notifications.data.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.read ? "" : "Unread. "}${item.title}. ${item.body}`}
              onPress={() => openNotification(item)}
              style={{ minHeight: 74, flexDirection: "row", alignItems: "center", gap: 12, padding: 13, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: item.read ? colors.card : colors.secondary }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: item.read ? colors.background : colors.primary }}>
                <Feather name={ICONS[item.type] ?? "bell"} size={18} color={item.read ? colors.mutedForeground : colors.primaryForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 13, fontWeight: item.read ? "600" : "800" }}>{item.title}</Text>
                <Text numberOfLines={2} style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 3 }}>{item.body}</Text>
              </View>
              {!item.read ? <View accessibilityLabel="Unread" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={{ alignItems: "center", paddingVertical: 38 }}>
          <Feather name="bell" size={28} color={colors.mutedForeground} />
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700", marginTop: 10 }}>You're all caught up</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 5 }}>New activity will appear here.</Text>
        </View>
      )}
    </PageFrame>
  );
}
