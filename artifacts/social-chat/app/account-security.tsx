import React from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppHeader, PageFrame, StorageNotice } from "@/components/common";
import { useColors } from "@/hooks/useColors";
import { useAppStore } from "@/state/AppStore";

const webSecurityUrl = () => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) return null;
  const basePath = (process.env.EXPO_PUBLIC_WEB_BASE_PATH ?? "").replace(/\/$/, "");
  return `https://${domain}${basePath}/account-security`;
};

export default function AccountSecurityScreen() {
  const colors = useColors();
  const { profile } = useAppStore();

  const manageSecurity = async () => {
    const url = webSecurityUrl();
    if (!url) {
      Alert.alert("Security settings unavailable", "The secure web sign-in service is not configured for this build.");
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Couldn't open security settings", "Try again when your device has an internet connection.");
    }
  };

  return (
    <PageFrame>
      <AppHeader />
      <StorageNotice />
      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginTop: 8 }}>
        Sign-in and recovery
      </Text>
      <Text style={{ color: colors.foreground, fontSize: 30, fontWeight: "800", letterSpacing: -0.8, marginTop: 5 }}>
        Your VastMind ID
      </Text>
      <View style={{ marginTop: 18, padding: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
          <View style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.secondary }}>
            <Feather name="shield" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700" }}>Passkey sign-in</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 3 }}>Same secure sign-in method as VastMind on the web</Text>
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 16 }} />
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Your VastMind address</Text>
        <Text selectable style={{ color: colors.foreground, fontSize: 18, fontWeight: "700", marginTop: 4 }}>
          {profile?.username ? `${profile.username}@vastmind.com` : "Loading your VastMind ID…"}
        </Text>
      </View>

      <View style={{ marginTop: 12, padding: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 20 }}>
        <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700" }}>Recovery stays in your hands</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 20, marginTop: 8 }}>
          Your recovery phrase is shown only when it is created. Keep it somewhere private; it cannot be retrieved from your account later.
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 20, marginTop: 8 }}>
          Add or manage passkeys and review account migration in the secure web settings. Your browser may ask you to sign in again.
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Manage passkeys and recovery settings on the web"
        onPress={() => void manageSecurity()}
        style={{ marginTop: 16, minHeight: 52, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9, borderRadius: 16, backgroundColor: colors.primary, paddingHorizontal: 16 }}
      >
        <Feather name="external-link" size={17} color={colors.primaryForeground} />
        <Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>Manage sign-in on web</Text>
      </Pressable>
    </PageFrame>
  );
}
