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
      <NativeTabs.Trigger name="index" hidden><NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} /><NativeTabs.Trigger.Label>Feed</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="chats"><NativeTabs.Trigger.Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} /><NativeTabs.Trigger.Label>Chats</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="videos"><NativeTabs.Trigger.Icon sf={{ default: 'rectangle.stack', selected: 'rectangle.stack.fill' }} /><NativeTabs.Trigger.Label>Feed</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="shop"><NativeTabs.Trigger.Icon sf={{ default: 'bag', selected: 'bag.fill' }} /><NativeTabs.Trigger.Label>Shop</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="community"><NativeTabs.Trigger.Icon sf={{ default: 'text.bubble', selected: 'text.bubble.fill' }} /><NativeTabs.Trigger.Label>Community</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="more"><NativeTabs.Trigger.Icon sf={{ default: 'ellipsis', selected: 'ellipsis' }} /><NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="channels" hidden><NativeTabs.Trigger.Icon sf={{ default: 'dot.radiowaves.left.and.right', selected: 'dot.radiowaves.left.and.right' }} /><NativeTabs.Trigger.Label>Channels</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="wallet" hidden><NativeTabs.Trigger.Icon sf={{ default: 'creditcard', selected: 'creditcard' }} /><NativeTabs.Trigger.Label>VastMind Coin</NativeTabs.Trigger.Label></NativeTabs.Trigger>
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
       ? <SymbolView name={icon === 'home' ? 'house' : icon === 'message-circle' ? 'bubble.left.and.bubble.right' : icon === 'shield' ? 'lock.shield' : icon === 'mail' ? 'envelope' : icon === 'briefcase' ? 'storefront' : icon === 'shopping-bag' ? 'bag' : icon === 'grid' ? 'rectangle.stack' : icon === 'users' ? 'person.3' : icon === 'more-horizontal' ? 'ellipsis' : 'dot.radiowaves.left.and.right'} tintColor={color} size={21} />
      : <Feather name={icon} size={20} color={color} />,
  });
  return (
    <Tabs initialRouteName="videos" screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.forest,
      tabBarInactiveTintColor: colors.mutedForeground,
      tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      tabBarStyle: { position: 'absolute', left: 12, right: 12, bottom: 10, borderRadius: 26, backgroundColor: isIOS ? 'transparent' : colors.card, borderTopWidth: 0, borderWidth: 1, borderColor: colors.border, elevation: 8, height: 68, ...(isWeb ? { height: 76 } : {}) },
      tabBarBackground: () => isIOS
        ? <BlurView intensity={100} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card, borderRadius: 26 }]} />,
    }}>
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="chats" options={tabOptions('Chats', 'message-circle')} />
      <Tabs.Screen name="videos" options={tabOptions('Feed', 'grid')} />
      <Tabs.Screen name="shop" options={tabOptions('Shop', 'shopping-bag')} />
      <Tabs.Screen name="community" options={tabOptions('Community', 'users')} />
      <Tabs.Screen name="more" options={tabOptions('More', 'more-horizontal')} />
      <Tabs.Screen name="channels" options={{ href: null }} />
      <Tabs.Screen name="mail" options={{ href: null }} />
      <Tabs.Screen name="business" options={{ href: null }} />
      <Tabs.Screen name="wallet" options={{ href: null }} />
    </Tabs>
  );
}

export const unstable_settings = { initialRouteName: 'videos' };

export default function TabLayout() {
  return isLiquidGlassAvailable() ? <NativeTabLayout /> : <ClassicTabLayout />;
}
