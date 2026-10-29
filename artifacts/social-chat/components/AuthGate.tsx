import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth, useClerk, useSession } from '@clerk/expo';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { useQueryClient } from '@tanstack/react-query';
import {
  setAuthTokenGetter,
  setTrustedDeviceTokenGetter,
  useExchangeMobileSession,
  useStartIdentityDeviceLink,
  useGetIdentityDeviceLinkStatus,
  useCompleteIdentityDeviceLink,
  useGetMyProfile,
  getGetMyProfileQueryKey,
  useRevokeMobileSession,
  type IdentityDeviceLinkRequest,
  type IdentityDeviceLinkStatus,
  type IdentityDeviceLinkComplete,
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
const TRUSTED_DEVICE_KEY = 'vastmind.native-trusted-device.v1';

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
  const { isSignedIn, getToken, userId: clerkUserId } = useAuth();
  const { session } = useSession();
  const { signOut: clerkSignOut } = useClerk();
  const colors = useColors();
  const client = useQueryClient();
  const exchange = useExchangeMobileSession();
  const revoke = useRevokeMobileSession();
  const [mobileSession, setMobileSession] = useState<MobileSession | null>(null);
  const [trustedDeviceToken, setTrustedDeviceToken] = useState<string | null>(null);
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
    void Promise.all([
      SecureStore.getItemAsync(SESSION_KEY),
      SecureStore.getItemAsync(TRUSTED_DEVICE_KEY),
    ]).then(async ([raw, trustedToken]) => {
      if (!alive) return;
      if (trustedToken && /^[A-Za-z0-9_-]{43}$/.test(trustedToken)) setTrustedDeviceToken(trustedToken);
      else if (trustedToken) await SecureStore.deleteItemAsync(TRUSTED_DEVICE_KEY);
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
    setTrustedDeviceTokenGetter(() => trustedDeviceToken);
    client.clear();
    setReadyUser(activeUserId);
    return () => { setAuthTokenGetter(null); setTrustedDeviceTokenGetter(null); client.clear(); };
  }, [activeUserId, client, getActiveToken, trustedDeviceToken]);

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
  const forgetTrustedDevice = useCallback(async () => {
    await SecureStore.deleteItemAsync(TRUSTED_DEVICE_KEY);
    setTrustedDeviceToken(null);
  }, []);
  const acceptDeviceLink = useCallback(async (result: IdentityDeviceLinkComplete) => {
    if (!result.accessToken || !result.userId || !result.expiresAt || !result.deviceTrustToken) {
      throw new Error('VastMind did not return a complete mobile session.');
    }
    const nextSession: MobileSession = {
      accessToken: result.accessToken,
      userId: result.userId,
      expiresAt: result.expiresAt,
    };
    await SecureStore.setItemAsync(TRUSTED_DEVICE_KEY, result.deviceTrustToken);
    setTrustedDeviceToken(result.deviceTrustToken);
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(nextSession));
    setMobileSession(nextSession);
    client.clear();
  }, [client]);

  const contextValue = useMemo<AppAuthValue>(
    () => ({ getToken: getActiveToken, userId: activeUserId, signOut, forgetTrustedDevice }),
    [activeUserId, forgetTrustedDevice, getActiveToken, signOut],
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
      await SecureStore.setItemAsync(TRUSTED_DEVICE_KEY, session.deviceTrustToken);
      setTrustedDeviceToken(session.deviceTrustToken);
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(nextSession));
      setMobileSession(nextSession);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  }, [exchange]);

  const signInWithPassword = useCallback(async (username: string, password: string) => {
    if (!trustedDeviceToken) throw new Error("This device is not trusted yet. Sign in with a passkey or recovery phrase.");
    const domain = process.env.EXPO_PUBLIC_DOMAIN?.replace(/^https?:\/\//, '').split('/')[0];
    if (!domain) throw new Error("The VastMind sign-in service is not configured for this build.");
    const response = await fetch(`https://${domain}/api/identity/password-sign-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VastMind-Client': 'mobile',
        'X-VastMind-Device-Trust': trustedDeviceToken,
      },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json().catch(() => null) as Partial<MobileSession> & { error?: string; signedIn?: boolean } | null;
    if (!response.ok || !data?.accessToken || !data.userId || !data.expiresAt) {
      throw new Error(data?.error ?? "Username or password sign-in failed.");
    }
    const nextSession: MobileSession = {
      accessToken: data.accessToken,
      userId: data.userId,
      expiresAt: data.expiresAt,
    };
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(nextSession));
    setMobileSession(nextSession);
    client.clear();
  }, [client, trustedDeviceToken]);

  if (!storedSessionLoaded || readyUser !== activeUserId) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: colors.background }}>
      <ActivityIndicator accessibilityLabel="Loading secure session" color={colors.primary} />
      <Text accessibilityLabel="Checking your secure VastMind sign-in" style={{ color: colors.mutedForeground, textAlign: 'center' }}>Checking your secure VastMind sign-in…</Text>
    </View>;
  }
  if (!mobileSession && session?.currentTask) {
    return <View style={{ flex: 1, padding: 32, justifyContent: 'center', backgroundColor: colors.background }}>
      <Text style={{ color: colors.foreground }}>Complete account setup in the web app, then sign in here.</Text>
      <Pressable onPress={() => void clerkSignOut()}><Text style={{ color: colors.primary, paddingVertical: 20 }}>Sign out and try again</Text></Pressable>
    </View>;
  }

  if (!activeUserId) return <AuthForm
    busy={authBusy}
    error={authError}
    trustedDevice={!!trustedDeviceToken}
    onAuthenticate={authenticateInBrowser}
    onPasswordSignIn={signInWithPassword}
    onDeviceLinkComplete={acceptDeviceLink}
  />;

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

function AuthForm({
  busy,
  error,
  trustedDevice,
  onAuthenticate,
  onPasswordSignIn,
  onDeviceLinkComplete,
}: {
  busy: boolean;
  error: string;
  trustedDevice: boolean;
  onAuthenticate: (method: AuthMethod) => Promise<void>;
  onPasswordSignIn: (username: string, password: string) => Promise<void>;
  onDeviceLinkComplete: (result: IdentityDeviceLinkComplete) => Promise<void>;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkRequest, setLinkRequest] = useState<IdentityDeviceLinkRequest | null>(null);
  const [linkStatus, setLinkStatus] = useState<IdentityDeviceLinkStatus['status']>('pending');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkError, setLinkError] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const startLink = useStartIdentityDeviceLink();
  const checkLink = useGetIdentityDeviceLinkStatus();
  const completeLink = useCompleteIdentityDeviceLink();
  const checkLinkStatus = checkLink.mutateAsync;

  useEffect(() => {
    if (!linkOpen || !linkRequest || linkStatus !== 'pending') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await checkLinkStatus({ data: { requestId: linkRequest.requestId, token: linkRequest.token } });
        if (cancelled) return;
        setLinkStatus(next.status);
        if (next.status === 'pending') timer = setTimeout(() => void poll(), 5000);
      } catch {
        if (!cancelled) timer = setTimeout(() => void poll(), 7000);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [checkLinkStatus, linkOpen, linkRequest, linkStatus]);

  const createLinkRequest = async () => {
    setLinkBusy(true);
    setLinkError('');
    try {
      const request = await startLink.mutateAsync();
      setLinkRequest(request);
      setLinkStatus('pending');
      setLinkPassword('');
    } catch (cause) {
      setLinkError(cause instanceof Error ? cause.message : 'Could not create a QR request.');
    } finally {
      setLinkBusy(false);
    }
  };

  const finishDeviceLink = async () => {
    if (!linkRequest || !linkPassword) return;
    setLinkBusy(true);
    setLinkError('');
    try {
      const result = await completeLink.mutateAsync({
        data: { requestId: linkRequest.requestId, token: linkRequest.token, password: linkPassword },
      });
      await onDeviceLinkComplete(result);
    } catch (cause) {
      setLinkError(cause instanceof Error ? cause.message : 'Could not finish device sign-in.');
    } finally {
      setLinkBusy(false);
    }
  };
  const button = { padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.card };
  return <KeyboardAwareScrollViewCompat
    contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32, gap: 16 }}
    style={{ backgroundColor: colors.background }}
  >
    <AppBrand size={44} fontSize={29} />
    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' }}>All your socials · One mind</Text>
    <Text style={{ color: colors.foreground, fontSize: 25, fontWeight: '700' }}>Sign in to VastMind</Text>
    <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>Use your password on a trusted device. To add another device while this account is active elsewhere, scan its QR from a signed-in device and verify your password here.</Text>
    {trustedDevice ? <>
      <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '700' }}>Trusted device sign-in</Text>
      <TextInput
        accessibilityLabel="VastMind username"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        placeholder="Username"
        placeholderTextColor={colors.mutedForeground}
        value={username}
        onChangeText={setUsername}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.foreground, padding: 14 }}
      />
      <TextInput
        accessibilityLabel="Password"
        secureTextEntry
        autoComplete="current-password"
        placeholder="Password"
        placeholderTextColor={colors.mutedForeground}
        value={password}
        onChangeText={setPassword}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.foreground, padding: 14 }}
      />
      <Pressable
        accessibilityRole="button"
        disabled={busy || passwordBusy || !username.trim() || !password}
        onPress={() => {
          setPasswordBusy(true); setPasswordError('');
          void onPasswordSignIn(username.trim(), password).catch((cause) => {
            setPasswordError(cause instanceof Error ? cause.message : 'Sign-in failed. Try again.');
          }).finally(() => setPasswordBusy(false));
        }}
        style={{ ...button, backgroundColor: colors.primary, borderColor: colors.primary, opacity: busy || passwordBusy ? 0.6 : 1 }}
      >
        <Text style={{ color: colors.primaryForeground, fontWeight: '700', textAlign: 'center' }}>{passwordBusy ? 'Signing in…' : 'Sign in with password'}</Text>
      </Pressable>
      {!!passwordError && <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{passwordError}</Text>}
    </> : <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 20 }}>This device has not been added yet. Use a passkey or recovery phrase to add it securely.</Text>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void onAuthenticate('signin')} style={{ ...button, backgroundColor: colors.primary, borderColor: colors.primary }}>
      <Text style={{ color: colors.primaryForeground, fontWeight: '700', textAlign: 'center' }}>{busy ? 'Waiting for secure sign-in…' : 'Add or sign in with a passkey'}</Text>
    </Pressable>
    <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>
      Forgot your password? Sign in with a passkey, then reset it in Account Security.
    </Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void onAuthenticate('signup')} style={button}>
      <Text style={{ color: colors.foreground, fontWeight: '600', textAlign: 'center' }}>Create a VastMind ID</Text>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void onAuthenticate('recover')}>
      <Text style={{ color: colors.primary, textAlign: 'center', paddingVertical: 8 }}>Recover with my phrase</Text>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void onAuthenticate('legacy')}>
      <Text style={{ color: colors.mutedForeground, textAlign: 'center', paddingVertical: 4 }}>Move an older account to VastMind login</Text>
    </Pressable>
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 15, gap: 10 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: linkOpen }} onPress={() => { setLinkOpen((value) => !value); setLinkError(''); }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.foreground, fontWeight: '700' }}>Link this device with QR</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 3 }}>Approve on a device already signed in</Text>
        </View>
        <Feather name={linkOpen ? 'minus' : 'plus'} size={18} color={colors.primary} />
      </Pressable>
      {linkOpen && (!linkRequest || linkStatus === 'expired') ? (
        <View style={{ gap: 8 }}>
          {linkStatus === 'expired' ? <Text style={{ color: colors.destructive, fontSize: 12 }}>This QR expired. Create a fresh one to continue.</Text> : null}
          <Pressable accessibilityRole="button" disabled={linkBusy} onPress={() => void createLinkRequest()} style={{ ...button, opacity: linkBusy ? 0.6 : 1 }}>
            <Text style={{ color: colors.foreground, fontWeight: '700', textAlign: 'center' }}>{linkBusy ? 'Creating QR…' : linkRequest ? 'Create a new QR' : 'Show pairing QR'}</Text>
          </Pressable>
        </View>
      ) : null}
      {linkOpen && linkRequest && linkStatus === 'pending' ? (
        <View style={{ alignItems: 'center', gap: 9, paddingVertical: 8 }}>
          <View style={{ padding: 10, borderRadius: 16, backgroundColor: '#ffffff' }}>
            <Image source={{ uri: linkRequest.qrDataUrl }} accessibilityLabel="QR code to link this VastMind device" style={{ width: 210, height: 210 }} resizeMode="contain" />
          </View>
          <Text accessibilityRole="text" style={{ color: colors.mutedForeground, textAlign: 'center', fontSize: 12, lineHeight: 18 }}>Scan this QR with a device already signed in. It expires in three minutes.</Text>
        </View>
      ) : null}
      {linkOpen && linkRequest && linkStatus === 'approved' ? (
        <View style={{ gap: 9 }}>
          <Text style={{ color: colors.primary, fontSize: 13, lineHeight: 19 }}>Approved by your signed-in device. Enter your account password to finish linking.</Text>
          <TextInput accessibilityLabel="VastMind account password" secureTextEntry autoComplete="current-password" placeholder="Account password" placeholderTextColor={colors.mutedForeground} value={linkPassword} onChangeText={setLinkPassword} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.foreground, padding: 14 }} />
          <Pressable accessibilityRole="button" disabled={linkBusy || !linkPassword} onPress={() => void finishDeviceLink()} style={{ ...button, backgroundColor: colors.primary, borderColor: colors.primary, opacity: linkBusy || !linkPassword ? 0.6 : 1 }}>
            <Text style={{ color: colors.primaryForeground, fontWeight: '700', textAlign: 'center' }}>{linkBusy ? 'Verifying…' : 'Verify password and sign in'}</Text>
          </Pressable>
        </View>
      ) : null}
      {linkError ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12 }}>{linkError}</Text> : null}
    </View>
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.destructive, lineHeight: 20 }}>{error}</Text>}
  </KeyboardAwareScrollViewCompat>;
}
