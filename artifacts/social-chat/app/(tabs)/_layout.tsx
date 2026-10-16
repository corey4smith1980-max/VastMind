import React from 'react';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { ColorValue, Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index"><NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} /><NativeTabs.Trigger.Label>Feed</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="chats"><NativeTabs.Trigger.Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} /><NativeTabs.Trigger.Label>Chats</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="business"><NativeTabs.Trigger.Icon sf={{ default: 'storefront', selected: 'storefront.fill' }} /><NativeTabs.Trigger.Label>Business</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="channels"><NativeTabs.Trigger.Icon sf={{ default: 'dot.radiowaves.left.and.right', selected: 'dot.radiowaves.left.and.right' }} /><NativeTabs.Trigger.Label>Channels</NativeTabs.Trigger.Label></NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const isDark = useColorScheme() === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const tabOptions = (title: string, icon: React.ComponentProps<typeof Feather>['name']) => ({
    title,
    tabBarIcon: ({ color }: { color: ColorValue }) => isIOS
      ? <SymbolView name={icon === 'home' ? 'house' : icon === 'message-circle' ? 'bubble.left.and.bubble.right' : icon === 'briefcase' ? 'storefront' : 'dot.radiowaves.left.and.right'} tintColor={color} size={21} />
      : <Feather name={icon} size={20} color={color} />,
  });
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.forest,
      tabBarInactiveTintColor: colors.mutedForeground,
      tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      tabBarStyle: { position: 'absolute', backgroundColor: isIOS ? 'transparent' : colors.card, borderTopWidth: isWeb ? 1 : StyleSheet.hairlineWidth, borderTopColor: colors.border, elevation: 0, ...(isWeb ? { height: 84 } : {}) },
      tabBarBackground: () => isIOS
        ? <BlurView intensity={100} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        : isWeb ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} /> : null,
    }}>
      <Tabs.Screen name="index" options={tabOptions('Feed', 'home')} />
      <Tabs.Screen name="chats" options={tabOptions('Chats', 'message-circle')} />
      <Tabs.Screen name="business" options={tabOptions('Business', 'briefcase')} />
      <Tabs.Screen name="channels" options={tabOptions('Channels', 'radio')} />
    </Tabs>
  );
}

export default function TabLayout() {
  return isLiquidGlassAvailable() ? <NativeTabLayout /> : <ClassicTabLayout />;
}
