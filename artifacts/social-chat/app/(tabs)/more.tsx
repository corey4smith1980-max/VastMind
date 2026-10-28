import React from "react";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppHeader, PageFrame, StorageNotice } from "@/components/common";
import { useColors } from "@/hooks/useColors";

const GROUPS = [
  {
    title: "Discover",
    items: [
      { label: "Channels", detail: "Updates from the people you follow", icon: "radio", href: "/(tabs)/channels" },
      { label: "Status & stories", detail: "Photos and moments that expire", icon: "aperture", href: "/stories" },
    ],
  },
  {
    title: "Business",
    items: [
      { label: "Business tools", detail: "Manage your shop and customer inbox", icon: "briefcase", href: "/(tabs)/business" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Alerts", detail: "Messages, reactions and community updates", icon: "bell", href: "/notifications" },
      { label: "VastMind ID", detail: "Passkeys and account security", icon: "lock", href: "/account-security" },
      { label: "Your profile", detail: "Name, bio and privacy", icon: "user", href: "/profile" },
    ],
  },
] as const;

export default function MoreScreen() {
  const colors = useColors();
  const router = useRouter();
  return (
    <PageFrame>
      <AppHeader />
      <StorageNotice />
      <Text style={[styles.title, { color: colors.foreground }]}>More</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Browse tools by what you want to do.</Text>
      <View style={styles.groups}>
        {GROUPS.map((group) => (
          <View key={group.title}>
            <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>{group.title}</Text>
            <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {group.items.map((item, index) => (
                <Pressable
                  key={item.label}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label}. ${item.detail}`}
                  onPress={() => router.push(item.href as never)}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.secondary }]}
                >
                  <View style={[styles.icon, { backgroundColor: colors.secondary }]}>
                    <Feather name={item.icon} size={17} color={colors.primary} />
                  </View>
                  <View style={styles.copy}>
                    <Text style={[styles.label, { color: colors.foreground }]}>{item.label}</Text>
                    <Text style={[styles.detail, { color: colors.mutedForeground }]}>{item.detail}</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  {index < group.items.length - 1 && <View style={[styles.separator, { backgroundColor: colors.border }]} />}
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </View>
    </PageFrame>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: "800", letterSpacing: -0.8 },
  subtitle: { fontSize: 13, marginTop: 4, marginBottom: 20 },
  groups: { gap: 20, paddingBottom: 24 },
  groupTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8, marginLeft: 4 },
  group: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  row: { minHeight: 65, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, paddingVertical: 10 },
  icon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  copy: { flex: 1 },
  label: { fontSize: 14, fontWeight: "700" },
  detail: { fontSize: 11, marginTop: 2 },
  separator: { position: "absolute", bottom: 0, left: 60, right: 12, height: StyleSheet.hairlineWidth },
});
