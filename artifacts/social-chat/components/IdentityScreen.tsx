import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAppStore } from '@/state/AppStore';

/** Internal identifiers are not email mailboxes; keep existing native access during migration. */
export default function IdentityScreen() {
  const colors = useColors();
  const { profile } = useAppStore();
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }} style={{ flex: 1, backgroundColor: colors.background }}>
      <Feather name="shield" size={36} color={colors.primary} />
      <Text style={{ color: colors.foreground, fontSize: 28, fontWeight: '700' }}>VastMind ID</Text>
      <View style={{ padding: 20, borderRadius: 20, borderWidth: 1, borderColor: colors.border, gap: 10 }}>
        <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: '600' }}>
          {profile?.username ? `${profile.username}@vastmind.com` : 'Choose a username in your profile'}
        </Text>
        <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>
          This is your identity inside VastMind, not an email address or inbox.
        </Text>
      </View>
      <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '600' }}>Moving to passkeys</Text>
      <Text style={{ color: colors.mutedForeground, lineHeight: 23 }}>
        Your existing native sign-in continues to work during migration. You can enroll a passkey and user-held recovery phrase in Account security on the web app, keeping the same account and social history.
      </Text>
      <Text style={{ color: colors.mutedForeground, lineHeight: 23 }}>
        Native passkey sign-in is not available in this build. Passkeys protect account access; they do not yet encrypt all existing social data. Self-hosted storage is not available yet.
      </Text>
    </ScrollView>
  );
}
