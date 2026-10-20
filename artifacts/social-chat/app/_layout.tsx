import '@/lib/mail-random';
import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AppStoreProvider } from '@/state/AppStore';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { setBaseUrl } from '@workspace/api-client-react';
import { AuthGate } from '@/components/AuthGate';
import { UsernameSetupGate } from '@/components/UsernameSetupGate';
import { MobileRealtimeProvider } from '@/state/Realtime';
import { Text } from 'react-native';

const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (domain) setBaseUrl(`https://${domain}`);
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, headerBackTitle: 'Back' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="channel/[id]" options={{ headerShown: false, presentation: 'card', animation: 'slide_from_right' }} />
      <Stack.Screen name="creator/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="video-studio" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;
  if (!publishableKey || !domain) return <Text>Missing authentication or API configuration. Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY and EXPO_PUBLIC_DOMAIN, then rebuild.</Text>;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ClerkProvider publishableKey={publishableKey} proxyUrl={proxyUrl} tokenCache={tokenCache}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <AuthGate><UsernameSetupGate><MobileRealtimeProvider><AppStoreProvider>
                <RootLayoutNav />
              </AppStoreProvider></MobileRealtimeProvider></UsernameSetupGate></AuthGate>
            </KeyboardProvider>
          </GestureHandlerRootView>
          </ClerkProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
