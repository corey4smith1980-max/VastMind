import React, { useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { AppHeader, PageFrame, StorageNotice } from "@/components/common";
import { useColors } from "@/hooks/useColors";
import { useAppStore } from "@/state/AppStore";
import { useAppAuth } from "@/state/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListIdentityTrustedDevicesQueryKey,
  getListIdentitySessionsQueryKey,
  useListIdentityTrustedDevices,
  useListIdentitySessions,
  useRevokeIdentitySession,
  useRevokeIdentityTrustedDevice,
  useApproveIdentityDeviceLink,
  useResetIdentityPasswordWithPasskey,
} from "@workspace/api-client-react";

type PairingProof = { requestId: string; token: string };

function parsePairingQr(raw: string): PairingProof | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      value.app === "VastMind"
      && value.action === "device-link"
      && value.version === 1
      && typeof value.requestId === "string"
      && /^[0-9a-f-]{36}$/i.test(value.requestId)
      && typeof value.token === "string"
      && /^[A-Za-z0-9_-]{43}$/.test(value.token)
    ) return { requestId: value.requestId, token: value.token };
  } catch {
    return null;
  }
  return null;
}

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
  const { forgetTrustedDevice } = useAppAuth();
  const queryClient = useQueryClient();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pairingProof, setPairingProof] = useState<PairingProof | null>(null);
  const [pairingNotice, setPairingNotice] = useState("");
  const approveDeviceLink = useApproveIdentityDeviceLink();
  const resetPassword = useResetIdentityPasswordWithPasskey();
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordResetNotice, setPasswordResetNotice] = useState("");
  const sessionKey = getListIdentitySessionsQueryKey();
  const sessions = useListIdentitySessions({ query: { queryKey: sessionKey, refetchOnWindowFocus: true } });
  const trustedKey = getListIdentityTrustedDevicesQueryKey();
  const trustedDevices = useListIdentityTrustedDevices({ query: { queryKey: trustedKey, refetchOnWindowFocus: true } });
  const revoke = useRevokeIdentitySession({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: sessionKey });
        Alert.alert("Session ended", "That device must sign in again to access this account.");
      },
      onError: () => Alert.alert("Couldn't end this session", "Refresh the list and try again."),
    },
  });
  const revokeTrusted = useRevokeIdentityTrustedDevice();

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

  const openPairingScanner = async () => {
    setPairingNotice("");
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert(
          "Camera access needed",
          "VastMind needs camera access to scan the pairing QR.",
          result.canAskAgain
            ? [{ text: "OK" }]
            : [{ text: "Cancel", style: "cancel" }, { text: "Open settings", onPress: () => void Linking.openSettings() }],
        );
        return;
      }
    }
    setScannerOpen(true);
  };

  const confirmDeviceLink = (proof: PairingProof) => {
    Alert.alert(
      "Critical security approval",
      "Approve only if you started this request and can see this QR on the device you are adding. The new device must still enter your password.",
      [
        { text: "Not me", style: "cancel", onPress: () => setPairingProof(null) },
        {
          text: "Approve device",
          style: "destructive",
          onPress: () => {
            void approveDeviceLink.mutateAsync({ data: proof }).then(() => {
              setPairingProof(null);
              setPairingNotice("Approved. VastMind sent a critical security alert to your account.");
              Alert.alert("Device approved", "A critical security message was sent to your VastMind account. The new device still needs your password.");
            }).catch(() => {
              setPairingNotice("This QR request could not be approved. It may have expired; ask the new device to create another.");
            });
          },
        },
      ],
    );
  };

  const submitPasswordReset = async () => {
    if (newPassword.length < 12 || newPassword !== confirmNewPassword) return;
    setPasswordResetNotice("");
    try {
      await resetPassword.mutateAsync({ data: { newPassword } });
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordResetNotice("Password reset. Other sessions were ended; trusted-device access was not changed.");
      await queryClient.invalidateQueries({ queryKey: sessionKey });
    } catch (error) {
      setPasswordResetNotice(error instanceof Error ? error.message : "Could not reset the password. Sign in with your passkey and try again.");
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

  const confirmTrustedRevoke = (deviceId: string, kind: "web" | "mobile", current: boolean) => {
    Alert.alert(
      "Revoke password sign-in?",
      current
        ? "This device will no longer sign in with a password. Its current session will remain open."
        : `${kind === "mobile" ? "That VastMind app" : "That browser"} will lose password access and its active session will be ended.`,
      [
        { text: "Keep device", style: "cancel" },
        {
          text: "Revoke access",
          style: "destructive",
          onPress: () => {
            void revokeTrusted.mutateAsync({ deviceId }).then(async () => {
              if (current) {
                await forgetTrustedDevice();
              }
              await queryClient.invalidateQueries({ queryKey: trustedKey });
              await queryClient.invalidateQueries({ queryKey: sessionKey });
              Alert.alert("Device access revoked", current ? "Password sign-in is disabled on this device." : "The device session has been ended.");
            }).catch(() => Alert.alert("Couldn't revoke device access", "Refresh the list and try again."));
          },
        },
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
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700" }}>VastMind sign-in</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 3 }}>Password on trusted devices; QR approval and password for additional devices</Text>
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
          Your 24-word recovery phrase is shown only when created. The web security page lets you create and download a replacement .txt file; replacing it disables the old phrase.
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 20, marginTop: 8 }}>
          Add passkeys, set a trusted-device password, download or replace your phrase, and review trusted-device access in the secure web settings. Your browser may ask you to sign in again.
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Manage VastMind sign-in and recovery on the web"
        onPress={() => void manageSecurity()}
        style={{ marginTop: 16, minHeight: 52, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9, borderRadius: 16, backgroundColor: colors.primary, paddingHorizontal: 16 }}
      >
        <Feather name="external-link" size={17} color={colors.primaryForeground} />
        <Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>Manage sign-in and recovery</Text>
      </Pressable>

      <View style={{ marginTop: 14, padding: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 20 }}>
        <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700" }}>Forgot your password?</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 19, marginTop: 6 }}>
          Set a new one from a passkey-verified VastMind session. Resetting does not add this device to password-trusted devices.
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 14 }}>New password (at least 12 characters)</Text>
        <TextInput accessibilityLabel="New VastMind password" secureTextEntry autoComplete="new-password" value={newPassword} onChangeText={setNewPassword} placeholder="New password" placeholderTextColor={colors.mutedForeground} style={{ marginTop: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.foreground, padding: 13 }} />
        <TextInput accessibilityLabel="Confirm new VastMind password" secureTextEntry autoComplete="new-password" value={confirmNewPassword} onChangeText={setConfirmNewPassword} placeholder="Confirm new password" placeholderTextColor={colors.mutedForeground} style={{ marginTop: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.foreground, padding: 13 }} />
        <Pressable accessibilityRole="button" disabled={resetPassword.isPending || newPassword.length < 12 || newPassword !== confirmNewPassword} onPress={() => void submitPasswordReset()} style={{ marginTop: 12, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.primary, paddingHorizontal: 16, opacity: resetPassword.isPending || newPassword.length < 12 || newPassword !== confirmNewPassword ? 0.55 : 1 }}>
          <Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>{resetPassword.isPending ? "Resetting…" : "Reset password with passkey"}</Text>
        </Pressable>
        {passwordResetNotice ? <Text accessibilityRole="alert" style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 10 }}>{passwordResetNotice}</Text> : null}
      </View>

      <View style={{ marginTop: 14, padding: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: colors.secondary }}>
            <Feather name="grid" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.foreground, fontWeight: "700" }}>Link another device</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 3 }}>Scan its QR, confirm the request, and send a critical security alert.</Text>
          </View>
        </View>
        {scannerOpen ? (
          <View style={{ marginTop: 14, overflow: "hidden", borderRadius: 16 }}>
            <CameraView
              style={{ height: 250, width: "100%" }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={({ data }) => {
                if (pairingProof) return;
                const parsed = parsePairingQr(data);
                setScannerOpen(false);
                if (!parsed) {
                  setPairingNotice("That QR is not a VastMind device-link request.");
                  return;
                }
                setPairingProof(parsed);
                confirmDeviceLink(parsed);
              }}
            />
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => void openPairingScanner()} style={{ marginTop: 12, minHeight: 44, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, borderRadius: 13, borderWidth: 1, borderColor: colors.border }}>
            <Feather name="camera" size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: "700" }}>Scan device QR</Text>
          </Pressable>
        )}
        {scannerOpen ? (
          <Pressable accessibilityRole="button" onPress={() => setScannerOpen(false)} style={{ paddingTop: 10, alignSelf: "center" }}>
            <Text style={{ color: colors.mutedForeground, fontWeight: "600" }}>Cancel scan</Text>
          </Pressable>
        ) : null}
        {pairingNotice ? <Text accessibilityRole="alert" style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 10 }}>{pairingNotice}</Text> : null}
      </View>

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

      <View style={{ marginTop: 26 }}>
        <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 21, fontWeight: "800" }}>Password-trusted devices</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 19, marginTop: 6 }}>
          These devices can use your password. Revoking one also ends its linked session, except for this device.
        </Text>
        {trustedDevices.isLoading ? (
          <View accessibilityRole="progressbar" style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 9 }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Loading trusted devices…</Text>
          </View>
        ) : trustedDevices.isError ? (
          <View accessibilityRole="alert" style={{ marginTop: 14 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Trusted devices couldn’t be loaded.</Text>
            <Pressable accessibilityRole="button" onPress={() => void trustedDevices.refetch()} style={{ paddingVertical: 10, alignSelf: "flex-start" }}>
              <Text style={{ color: colors.primary, fontWeight: "700" }}>Try again</Text>
            </Pressable>
          </View>
        ) : (trustedDevices.data?.items.length ?? 0) === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 14 }}>No password-trusted devices are active.</Text>
        ) : (
          <View style={{ gap: 10, marginTop: 14 }}>
            {trustedDevices.data?.items.map((device) => (
              <View key={device.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card }}>
                <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }}>
                  <Feather name={device.kind === "mobile" ? "smartphone" : "globe"} size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.foreground, fontWeight: "700" }}>{device.kind === "mobile" ? "VastMind app" : "Web browser"}{device.current ? " · This device" : ""}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4 }}>Added {formatDate(device.createdAt)}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Last used {device.lastUsedAt ? formatDate(device.lastUsedAt) : "not yet"} · Expires {formatDate(device.expiresAt)}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Revoke password access for ${device.kind === "mobile" ? "VastMind app" : "web browser"}`}
                  disabled={revokeTrusted.isPending}
                  onPress={() => confirmTrustedRevoke(device.id, device.kind, device.current)}
                  style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, opacity: revokeTrusted.isPending ? 0.5 : 1 }}
                >
                  <Text style={{ color: colors.coral, fontSize: 11, fontWeight: "700" }}>Revoke</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>
    </PageFrame>
  );
}
