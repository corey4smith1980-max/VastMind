import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { useAuth, useClerk, useSession } from '@clerk/expo';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { useQueryClient } from '@tanstack/react-query';
import {
  setAuthTokenGetter,
  useExchangeMobileSession,
  useGetMyProfile,
  getGetMyProfileQueryKey,
  useRevokeMobileSession,
} from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { AppBrand } from '@/components/common';
import { AuthContext, type AppAuthValue } from '@/state/AuthContext';

WebBrowser.maybeCompleteAuthSession();

type MobileSession = { accessToken: string; userId: string; expiresAt: string };
type AuthMethod = 'signin' | 'signup' | 'recover' | 'legacy';
const SESSION_KEY = 'vastmind.native-session.v1';

function validSession(value: unknown): value is MobileSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<MobileSession>;
  return typeof session.accessToken === 'string'
    && session.accessToken.length >= 40
    && typeof session.userId === 'string'
    && typeof session.expiresAt === 'string'
    && Date.parse(session.expiresAt) > Date.now();
}

function httpStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') return error.status;
  return undefined;
}

/** Shared auth state: new mobile sign-ins use the same passkeys and recovery
 * phrase as web, while existing Clerk sessions remain usable during migration. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken, userId: clerkUserId } = useAuth();
  const { session } = useSession();
  const { signOut: clerkSignOut } = useClerk();
  const colors = useColors();
  const client = useQueryClient();
  const exchange = useExchangeMobileSession();
  const revoke = useRevokeMobileSession();
  const [mobileSession, setMobileSession] = useState<MobileSession | null>(null);
  const [storedSessionLoaded, setStoredSessionLoaded] = useState(false);
  const [readyUser, setReadyUser] = useState<string | null | undefined>(undefined);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const activeUserId = mobileSession?.userId ?? (isSignedIn ? clerkUserId ?? null : null);
  const getActiveToken = useCallback(
    () => mobileSession && Date.parse(mobileSession.expiresAt) > Date.now()
      ? Promise.resolve(mobileSession.accessToken)
      : getToken(),
    [getToken, mobileSession],
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      setStoredSessionLoaded(true);
      return;
    }
    let alive = true;
    void SecureStore.getItemAsync(SESSION_KEY).then(async (raw) => {
      if (!alive) return;
      if (raw) {
        try {
          const parsed: unknown = JSON.parse(raw);
          if (validSession(parsed)) setMobileSession(parsed);
          else await SecureStore.deleteItemAsync(SESSION_KEY);
        } catch {
          await SecureStore.deleteItemAsync(SESSION_KEY);
        }
      }
    }).catch(() => {
      if (alive) setAuthError('Secure sign-in storage is unavailable on this device.');
    }).finally(() => {
      if (alive) setStoredSessionLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    // Native requests use a revocable bearer session; legacy Clerk users keep
    // their existing token. Clear cached data whenever the active identity changes.
    setAuthTokenGetter(() => getActiveToken());
    client.clear();
    setReadyUser(activeUserId);
    return () => { setAuthTokenGetter(null); client.clear(); };
  }, [activeUserId, client, getActiveToken]);

  const profileCheck = useGetMyProfile({
    query: {
      queryKey: getGetMyProfileQueryKey(),
      enabled: !!mobileSession && readyUser === mobileSession.userId,
      retry: false,
    },
  });
  useEffect(() => {
    if (!mobileSession || httpStatus(profileCheck.error) !== 401) return;
    void SecureStore.deleteItemAsync(SESSION_KEY).catch(() => undefined);
    setMobileSession(null);
    setAuthError('This mobile session expired. Sign in again to continue.');
  }, [mobileSession, profileCheck.error]);

  const signOut = useCallback(async () => {
    if (mobileSession) {
      try { await revoke.mutateAsync(); } catch { /* The local sign-out still removes this device's token. */ }
      if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => undefined);
      setMobileSession(null);
    }
    if (isSignedIn) await clerkSignOut();
    client.clear();
  }, [client, clerkSignOut, isSignedIn, mobileSession, revoke]);
  const contextValue = useMemo<AppAuthValue>(
    () => ({ getToken: getActiveToken, userId: activeUserId, signOut }),
    [activeUserId, getActiveToken, signOut],
  );

  const authenticateInBrowser = useCallback(async (method: AuthMethod) => {
    setAuthBusy(true);
    setAuthError('');
    try {
      const configuredDomain = process.env.EXPO_PUBLIC_DOMAIN?.replace(/^https?:\/\//, '').split('/')[0];
      if (!configuredDomain) throw new Error('The VastMind sign-in service is not configured for this build.');
      const redirectUri = AuthSession.makeRedirectUri({ path: 'auth/callback' });
      const verifier = `${Crypto.randomUUID().replace(/-/g, '')}${Crypto.randomUUID().replace(/-/g, '')}`;
      const digest = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        verifier,
        { encoding: Crypto.CryptoEncoding.BASE64 },
      );
      const codeChallenge = digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      const state = Crypto.randomUUID();
      const webBasePath = (process.env.EXPO_PUBLIC_WEB_BASE_PATH ?? '').replace(/\/+$/, '');
      const authUrl = new URL(`https://${configuredDomain}${webBasePath}/mobile-auth`);
      authUrl.searchParams.set('mode', method);
      authUrl.searchParams.set('redirectUri', redirectUri);
      authUrl.searchParams.set('codeChallenge', codeChallenge);
      authUrl.searchParams.set('state', state);

      const browser = await WebBrowser.openAuthSessionAsync(authUrl.toString(), redirectUri);
      if (browser.type !== 'success' || !browser.url) return;
      const callback = new URL(browser.url);
      const expected = new URL(redirectUri);
      if (callback.protocol !== expected.protocol || callback.host !== expected.host || callback.pathname !== expected.pathname) {
        throw new Error('VastMind returned to an unexpected app address.');
      }
      if (callback.searchParams.get('state') !== state) throw new Error('The sign-in could not be verified. Please try again.');
      const ticket = callback.searchParams.get('ticket');
      if (!ticket) throw new Error('VastMind did not finish the sign-in. Please try again.');

      const session = await exchange.mutateAsync({
        data: { ticket, verifier, redirectUri, state },
      });
      const nextSession: MobileSession = {
        accessToken: session.accessToken,
        userId: session.userId,
        expiresAt: session.expiresAt,
      };
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(nextSession));
      setMobileSession(nextSession);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  }, [exchange]);

  if (!isLoaded || !storedSessionLoaded || readyUser !== activeUserId) {
    return <ActivityIndicator accessibilityLabel="Loading secure session" color={colors.primary} />;
  }
  if (!mobileSession && session?.currentTask) {
    return <View style={{ flex: 1, padding: 32, justifyContent: 'center', backgroundColor: colors.background }}>
      <Text style={{ color: colors.foreground }}>Complete account setup in the web app, then sign in here.</Text>
      <Pressable onPress={() => void clerkSignOut()}><Text style={{ color: colors.primary, paddingVertical: 20 }}>Sign out and try again</Text></Pressable>
    </View>;
  }
  if (!activeUserId) return <AuthForm busy={authBusy} error={authError} onAuthenticate={authenticateInBrowser} />;

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

function AuthForm({
  busy,
  error,
  onAuthenticate,
}: {
  busy: boolean;
  error: string;
  onAuthenticate: (method: AuthMethod) => Promise<void>;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const button = { padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.card };
  return <KeyboardAwareScrollViewCompat
    contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32, gap: 16 }}
    style={{ backgroundColor: colors.background }}
  >
    <AppBrand size={44} fontSize={29} />
    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' }}>All your socials · One mind</Text>
    <Text style={{ color: colors.foreground, fontSize: 25, fontWeight: '700' }}>Sign in to VastMind</Text>
    <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>Use the same passkey, recovery phrase, and account you use on the web. Sign-in opens a secure browser, then returns here.</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void onAuthenticate('signin')} style={{ ...button, backgroundColor: colors.primary, borderColor: colors.primary }}>
      <Text style={{ color: colors.primaryForeground, fontWeight: '700', textAlign: 'center' }}>{busy ? 'Waiting for secure sign-in…' : 'Sign in with passkey'}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void onAuthenticate('signup')} style={button}>
      <Text style={{ color: colors.foreground, fontWeight: '600', textAlign: 'center' }}>Create a VastMind ID</Text>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void onAuthenticate('recover')}>
      <Text style={{ color: colors.primary, textAlign: 'center', paddingVertical: 8 }}>Recover with my phrase</Text>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void onAuthenticate('legacy')}>
      <Text style={{ color: colors.mutedForeground, textAlign: 'center', paddingVertical: 4 }}>Move an older account to VastMind login</Text>
    </Pressable>
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.destructive, lineHeight: 20 }}>{error}</Text>}
  </KeyboardAwareScrollViewCompat>;
}
