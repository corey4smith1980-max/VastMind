import React from "react";
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppHeader, PageFrame, StorageNotice } from "@/components/common";
import { useColors } from "@/hooks/useColors";
import { useAppStore } from "@/state/AppStore";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListIdentitySessionsQueryKey,
  useListIdentitySessions,
  useRevokeIdentitySession,
} from "@workspace/api-client-react";

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

const webSecurityUrl = () => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) return null;
  const basePath = (process.env.EXPO_PUBLIC_WEB_BASE_PATH ?? "").replace(/\/$/, "");
  return `https://${domain}${basePath}/account-security`;
};

export default function AccountSecurityScreen() {
  const colors = useColors();
  const { profile } = useAppStore();
  const queryClient = useQueryClient();
  const sessionKey = getListIdentitySessionsQueryKey();
  const sessions = useListIdentitySessions({ query: { queryKey: sessionKey, refetchOnWindowFocus: true } });
  const revoke = useRevokeIdentitySession({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: sessionKey });
        Alert.alert("Session ended", "That device must sign in again to access this account.");
      },
      onError: () => Alert.alert("Couldn't end this session", "Refresh the list and try again."),
    },
  });

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

  const confirmRevoke = (sessionId: string, kind: "web" | "mobile") => {
    Alert.alert(
      "End this session?",
      `${kind === "mobile" ? "That VastMind app" : "That browser"} will be signed out and must sign in again.`,
      [
        { text: "Keep session", style: "cancel" },
        { text: "End session", style: "destructive", onPress: () => revoke.mutate({ sessionId }) },
      ],
    );
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

      <View style={{ marginTop: 26 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 21, fontWeight: "800" }}>Signed-in devices</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh signed-in devices"
            accessibilityState={{ disabled: sessions.isFetching }}
            disabled={sessions.isFetching}
            onPress={() => void sessions.refetch()}
            style={{ minWidth: 42, minHeight: 42, alignItems: "center", justifyContent: "center" }}
          >
            {sessions.isFetching
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Feather name="refresh-cw" size={18} color={colors.primary} />}
          </Pressable>
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 19, marginTop: 6 }}>
          Review active VastMind and legacy sign-ins. This list shows only app or browser type and dates—not IP addresses, precise location, browser details, or device fingerprints.
        </Text>

        {sessions.isLoading ? (
          <View accessibilityRole="progressbar" style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 9 }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Loading active sessions…</Text>
          </View>
        ) : sessions.isError ? (
          <View accessibilityRole="alert" style={{ marginTop: 14, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
            <Text style={{ color: colors.foreground, fontWeight: "700" }}>Sessions couldn’t be loaded.</Text>
            <Pressable accessibilityRole="button" onPress={() => void sessions.refetch()} style={{ paddingVertical: 10, alignSelf: "flex-start" }}>
              <Text style={{ color: colors.primary, fontWeight: "700" }}>Try again</Text>
            </Pressable>
          </View>
        ) : (sessions.data?.items.length ?? 0) === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 14 }}>No active sessions were found for this account.</Text>
        ) : (
          <View style={{ gap: 10, marginTop: 14 }}>
            {[...(sessions.data?.items ?? [])]
              .sort((a, b) => Number(b.current) - Number(a.current) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
              .map((session) => (
                <View key={session.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card }}>
                  <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }}>
                    <Feather name={session.kind === "mobile" ? "smartphone" : "globe"} size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <Text style={{ color: colors.foreground, fontWeight: "700" }}>{session.kind === "mobile" ? "VastMind app" : "Web browser"}</Text>
                      {session.current ? <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "800" }}>THIS SESSION</Text> : null}
                    </View>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4 }}>Signed in {formatDate(session.createdAt)}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Expires {formatDate(session.expiresAt)}</Text>
                  </View>
                  {session.current ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>Current</Text>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`End ${session.kind === "mobile" ? "VastMind app" : "web browser"} session`}
                      accessibilityState={{ disabled: revoke.isPending }}
                      disabled={revoke.isPending}
                      onPress={() => confirmRevoke(session.id, session.kind)}
                      style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, opacity: revoke.isPending ? 0.5 : 1 }}
                    >
                      <Text style={{ color: colors.coral, fontSize: 11, fontWeight: "700" }}>End</Text>
                    </Pressable>
                  )}
                </View>
              ))}
          </View>
        )}
      </View>
    </PageFrame>
  );
}
