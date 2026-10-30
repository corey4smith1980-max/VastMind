import React, { useState } from "react";
import * as Linking from "expo-linking";
import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppHeader, PageFrame, StorageNotice } from "@/components/common";
import { useColors } from "@/hooks/useColors";

const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
const webWalletUrl = domain ? `https://${domain}/wallet/` : null;
const metaMaskDappUrl = domain ? `https://metamask.app.link/dapp/${domain}/wallet/` : null;
const testnetContractAddress = process.env.EXPO_PUBLIC_VASTMIND_COIN_TESTNET_ADDRESS?.trim();

export default function VastMindCoinWalletScreen() {
  const colors = useColors();
  const [error, setError] = useState<string | null>(null);

  const openMetaMask = async () => {
    setError(null);
    if (!metaMaskDappUrl) {
      setError("The web wallet address is not configured for this app build.");
      return;
    }
    try {
      await Linking.openURL(metaMaskDappUrl);
    } catch {
      if (webWalletUrl) {
        try {
          await Linking.openURL(webWalletUrl);
          return;
        } catch {
          // Keep the user in this screen and explain the fallback.
        }
      }
      setError("Could not open the external wallet. Open the VastMind web wallet in a Sepolia-compatible wallet browser.");
    }
  };

  return (
    <PageFrame>
      <AppHeader label="VastMind Coin" />
      <StorageNotice />
      <View style={styles.content}>
        <View style={[styles.brandIcon, { backgroundColor: colors.primary + "18" }]}>
          <Feather name="credit-card" size={22} color={colors.primary} />
        </View>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>VASTMIND COIN</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Testnet wallet</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          This prototype uses an external wallet on Ethereum Sepolia. VastMind never stores private keys.
        </Text>

        <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.noticeHeader}>
            <Feather name="alert-triangle" size={17} color={colors.primary} />
            <Text style={[styles.noticeTitle, { color: colors.foreground }]}>Test tokens only</Text>
          </View>
          <Text style={[styles.noticeCopy, { color: colors.mutedForeground }]}>
            VMC on Sepolia has no real-money value. Card purchases, VMC Shop checkout, and fiat cash-outs are not enabled. Testnet transfers are available only after the contract is deployed.
          </Text>
          <Text style={[styles.noticeCopy, { color: colors.mutedForeground }]}>
            {testnetContractAddress ? "A Sepolia contract address is configured." : "The test token contract has not been deployed or configured yet."}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open the VastMind testnet wallet in MetaMask"
          onPress={() => void openMetaMask()}
          style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.86 : 1 }]}
        >
          <Feather name="external-link" size={18} color={colors.primaryForeground} />
          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Open in MetaMask</Text>
        </Pressable>
        {webWalletUrl ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(webWalletUrl).catch(() => setError("Could not open the VastMind web wallet."))}
            style={styles.fallbackButton}
          >
            <Text style={[styles.fallbackText, { color: colors.primary }]}>Open web wallet instead</Text>
          </Pressable>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        <View style={styles.securityRow}>
          <Feather name="lock" size={16} color={colors.mutedForeground} />
          <Text style={[styles.securityText, { color: colors.mutedForeground }]}>
            Confirm transactions in your external wallet. Never share a recovery phrase or private key with VastMind.
          </Text>
        </View>
      </View>
    </PageFrame>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 36 },
  brandIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 16 },
  eyebrow: { marginTop: 20, fontSize: 10, fontWeight: "800", letterSpacing: 1.6 },
  title: { marginTop: 6, fontSize: 30, fontWeight: "800", letterSpacing: -0.8 },
  subtitle: { marginTop: 8, fontSize: 14, lineHeight: 21 },
  notice: { marginTop: 24, borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  noticeHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  noticeTitle: { fontSize: 14, fontWeight: "800" },
  noticeCopy: { fontSize: 12, lineHeight: 19 },
  primaryButton: { marginTop: 22, minHeight: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16 },
  primaryButtonText: { fontSize: 14, fontWeight: "800" },
  fallbackButton: { alignSelf: "center", padding: 12 },
  fallbackText: { fontSize: 13, fontWeight: "700" },
  error: { marginTop: 8, fontSize: 12, lineHeight: 18 },
  securityRow: { marginTop: 20, flexDirection: "row", alignItems: "flex-start", gap: 9 },
  securityText: { flex: 1, fontSize: 11, lineHeight: 17 },
});
