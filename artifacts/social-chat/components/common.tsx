import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAppStore } from '@/state/AppStore';
import { useRouter } from 'expo-router';

export function VastMindMark({ size = 30 }: { size?: number }) {
  return (
    <Image
      source={require('../assets/images/vastmind-mark.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      {...(Platform.OS === 'web' ? {} : { accessibilityElementsHidden: true })}
    />
  );
}

export function AppBrand({ size = 30, fontSize = 19 }: { size?: number; fontSize?: number }) {
  return (
    <View style={styles.brandRow} accessibilityRole="header" accessibilityLabel="VastMind. All your socials, one mind.">
      <VastMindMark size={size} />
      <Image
        source={require('../assets/images/vastmind-wordmark.png')}
        style={{ width: fontSize * 5.9, height: fontSize }}
        resizeMode="contain"
        accessibilityLabel="VastMind"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

export function PageFrame({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.frame, { backgroundColor: colors.background }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: Platform.OS === 'web' ? 67 : insets.top + 12,
          paddingBottom: Platform.OS === 'web' ? 118 : insets.bottom + 92,
          paddingHorizontal: 20,
        }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function AppHeader({ label, action, onAction }: { label?: string; action?: React.ComponentProps<typeof Feather>['name']; onAction?: () => void }) {
  const colors = useColors();
  const router = useRouter();
  return (
    <View style={styles.header}>
      <AppBrand />
      {action && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={label ?? action} onPress={onAction} style={styles.iconPress}>
          <Feather name={action} size={21} color={colors.forest} />
        </Pressable>
      ) : <Pressable accessibilityLabel="Profile settings" onPress={() => router.push('/profile')}><Feather name="user" size={20} color={colors.foreground} /></Pressable>}
    </View>
  );
}

export function Avatar({ initials, size = 48, tone = 'forest', online = false }: { initials: string; size?: number; tone?: 'forest' | 'coral' | 'blue' | 'gold' | 'lime'; online?: boolean }) {
  const colors = useColors();
  const tones = { forest: colors.forest, coral: colors.coral, blue: colors.blue, gold: colors.gold, lime: colors.lime };
  const foreground = tone === 'lime' ? colors.forest : colors.primaryForeground;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: tones[tone] }]}>
      <Text style={{ color: foreground, fontSize: Math.max(11, size * 0.29), fontWeight: '700' }}>{initials}</Text>
      {online ? <View style={[styles.onlineDot, { borderColor: colors.card }]} /> : null}
    </View>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>{children}</Text>;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={[styles.sectionTitle, { color: colors.forest }]}>{title}</Text>
      {action && onAction ? <Pressable onPress={onAction}><Text style={[styles.actionText, { color: colors.forest }]}>{action}</Text></Pressable> : null}
    </View>
  );
}

export function StorageNotice() {
  const { error, loading, refresh } = useAppStore();
  const colors = useColors();
  if (!error && !loading) return null;
  return (
    <View style={[styles.storageNotice, { backgroundColor: colors.coral }]}>
      <Feather name="alert-circle" size={15} color={colors.primaryForeground} />
      <Pressable onPress={() => void refresh()}><Text style={[styles.storageText, { color: colors.primaryForeground }]}>{error ? `${error} Tap to retry.` : 'Loading your account…'}</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { height: 30, width: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 19, fontWeight: '800', letterSpacing: -1 },
  headerLabel: { fontSize: 13, marginLeft: 4 },
  iconPress: { padding: 7 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  onlineDot: { position: 'absolute', width: 12, height: 12, right: -1, bottom: 0, borderRadius: 7, borderWidth: 2, backgroundColor: '#6ABF79' },
  eyebrow: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: '700' },
  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5 },
  actionText: { fontSize: 13, fontWeight: '700' },
  storageNotice: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  storageText: { fontSize: 12, fontWeight: '600' },
});
