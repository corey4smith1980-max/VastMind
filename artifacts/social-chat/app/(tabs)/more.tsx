import React from "react";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppHeader, PageFrame, StorageNotice } from "@/components/common";
import { useColors } from "@/hooks/useColors";

const ITEMS = [
  { label: "Communities", detail: "Local groups and opportunities", icon: "users", href: "/communities" },
  { label: "Business tools", detail: "Manage your shop and customer inbox", icon: "briefcase", href: "/(tabs)/business" },
  { label: "Channels", detail: "Updates from the people you follow", icon: "radio", href: "/(tabs)/channels" },
  { label: "Status & stories", detail: "Photos and moments that expire", icon: "aperture", href: "/stories" },
  { label: "VastMind ID", detail: "Passkeys and account security", icon: "lock", href: "/account-security" },
  { label: "Your profile", detail: "Name, bio and privacy", icon: "user", href: "/profile" },
  { label: "Alerts", detail: "Messages, reactions and community updates", icon: "bell", href: "/notifications" },
] as const;

export default function MoreScreen() {
  const colors = useColors();
  const router = useRouter();
  return (
    <PageFrame>
      <AppHeader />
      <StorageNotice />
      <Text style={[styles.title, { color: colors.foreground }]}>More</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>The rest of your VastMind tools, together.</Text>
      <View style={styles.list}>
        {ITEMS.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            accessibilityLabel={`${item.label}. ${item.detail}`}
            onPress={() => router.push(item.href as never)}
            style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.icon, { backgroundColor: colors.secondary }]}>
              <Feather name={item.icon} size={18} color={colors.primary} />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.label, { color: colors.foreground }]}>{item.label}</Text>
              <Text style={[styles.detail, { color: colors.mutedForeground }]}>{item.detail}</Text>
            </View>
            <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
          </Pressable>
        ))}
      </View>
    </PageFrame>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: "800", letterSpacing: -0.8 },
  subtitle: { fontSize: 13, marginTop: 4, marginBottom: 18 },
  list: { gap: 9 },
  row: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 10 },
  icon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  copy: { flex: 1 },
  label: { fontSize: 14, fontWeight: "700" },
  detail: { fontSize: 11, marginTop: 3 },
});
