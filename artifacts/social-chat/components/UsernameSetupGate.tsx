import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGetMyProfile, useUpdateMyProfile } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

const generatedUsername = /^member_[a-f0-9]{24}$/i;

/** New and legacy auto-named accounts must choose their own unique handle before using the app. */
export function UsernameSetupGate({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const profile = useGetMyProfile();
  const update = useUpdateMyProfile();
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const value = username.trim().toLowerCase();
  const valid = /^[a-z0-9_]{3,32}$/.test(value) && !generatedUsername.test(value);

  useEffect(() => {
    if (profile.data) setUsername(generatedUsername.test(profile.data.username) ? "" : profile.data.username);
  }, [profile.data]);

  if (profile.isPending) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} accessibilityLabel="Loading profile" />
    </View>;
  }
  if (profile.isError || !profile.data) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.background }}>
      <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700", textAlign: "center" }}>Couldn’t load your profile</Text>
      <Text style={{ color: colors.mutedForeground, marginTop: 8, textAlign: "center" }}>Check your connection and try again.</Text>
      <Pressable accessibilityRole="button" onPress={() => void profile.refetch()} style={{ marginTop: 18, padding: 12 }}>
        <Text style={{ color: colors.primary, fontWeight: "700" }}>Retry</Text>
      </Pressable>
    </View>;
  }

  if (profile.data.username && !generatedUsername.test(profile.data.username)) return children;

  async function submit() {
    if (!valid || update.isPending) return;
    setError("");
    try {
      await update.mutateAsync({ data: { username: value } });
      await profile.refetch();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setError(/taken|already exists|conflict/i.test(message)
        ? "That username is already taken. Choose another."
        : message || "Couldn’t save your username. Please try again.");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "center", padding: 24 }}>
        <View style={{ width: "100%", maxWidth: 440, alignSelf: "center", borderRadius: 26, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 24 }}>
          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "800", letterSpacing: 2, textTransform: "uppercase" }}>One-time setup</Text>
          <Text style={{ color: colors.foreground, fontSize: 28, fontWeight: "800", marginTop: 8 }}>Choose your username</Text>
          <Text style={{ color: colors.mutedForeground, lineHeight: 21, marginTop: 8 }}>Hi {profile.data.name || "there"} — choose a unique name people can use to find and mention you.</Text>
          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "700", marginTop: 24, marginBottom: 7 }}>Your username</Text>
          <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: error ? colors.destructive : colors.border, borderRadius: 14, paddingHorizontal: 14 }}>
            <Text style={{ color: colors.mutedForeground, fontWeight: "700" }}>@</Text>
            <TextInput accessibilityLabel="Choose a username" accessibilityHint="Use 3 to 32 lowercase letters, numbers, or underscores" autoCapitalize="none" autoCorrect={false}
              value={username} onChangeText={(next) => { setUsername(next.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32)); setError(""); }}
              maxLength={32} placeholder="yourname" placeholderTextColor={colors.mutedForeground}
              style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 8, color: colors.foreground }} />
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 17, marginTop: 7 }}>3–32 lowercase letters, numbers, or underscores. Each username can belong to only one account.</Text>
          {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12, marginTop: 8 }}>{error}</Text> : null}
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 17, marginTop: 14 }}>Your username is public; your email address stays private.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Continue as ${value || "yourname"}`} disabled={!valid || update.isPending} onPress={() => void submit()}
            style={{ marginTop: 20, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: colors.primary, opacity: !valid || update.isPending ? 0.55 : 1 }}>
            {update.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>Continue as @{value || "yourname"}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
