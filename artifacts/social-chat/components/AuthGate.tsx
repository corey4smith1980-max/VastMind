import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useAuth, useSignIn, useSignUp, useClerk, useSession } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth();
  const { session } = useSession();
  const { signOut } = useClerk();
  const colors = useColors();
  const client = useQueryClient();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Expo Web lives on a different hostname from the API, so it also needs
    // bearer transport; same-origin sibling web remains cookie authenticated.
    setAuthTokenGetter(() => getToken());
    client.clear();
    setReady(true);
    return () => { setAuthTokenGetter(null); client.clear(); };
  }, [getToken, userId, client]);
  if (!isLoaded || !ready) return <ActivityIndicator accessibilityLabel="Loading session" />;
  if (session?.currentTask) return <View style={{ flex: 1, padding: 32, justifyContent: 'center', backgroundColor: colors.background }}><Text style={{ color: colors.foreground }}>Your account requires an additional step ({session.currentTask.key}). Complete account setup on the web app, then sign in again here.</Text><Pressable onPress={() => void signOut()}><Text style={{ color: colors.primary, paddingVertical: 20 }}>Sign out and try again</Text></Pressable></View>;
  return isSignedIn ? children : <AuthForm />;
}

function AuthForm() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [verify, setVerify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const check = (result: { error?: { message?: string } | null }) => { if (result.error) throw new Error(result.error.message || 'Authentication failed'); };
  const execute = async (resend = false) => {
    setBusy(true); setError('');
    try {
      if (register) {
        if (resend) check(await signUp.verifications.sendEmailCode());
        else if (verify) {
          check(await signUp.verifications.verifyEmailCode({ code }));
          if (signUp.status !== 'complete') throw new Error(`Additional account requirements: ${signUp.missingFields.join(', ') || signUp.status}. Please complete these on the web app.`);
          check(await signUp.finalize());
        } else {
          check(await signUp.password({ emailAddress: email, password }));
          check(await signUp.verifications.sendEmailCode()); setVerify(true);
        }
      } else {
        if (resend) check(await signIn.mfa.sendEmailCode());
        else {
          check(verify ? await signIn.mfa.verifyEmailCode({ code }) : await signIn.password({ emailAddress: email, password }));
          if (signIn.status === 'complete') check(await signIn.finalize());
          else if (signIn.supportedSecondFactors?.some(f => f.strategy === 'email_code')) {
            check(await signIn.mfa.sendEmailCode()); setVerify(true);
          } else throw new Error(`Sign-in requires ${signIn.status}. Complete this account's additional verification on the web app.`);
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in. Try again.'); }
    finally { setBusy(false); }
  };
  const input = { padding: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 14, color: colors.foreground, backgroundColor: colors.card };
  return <KeyboardAwareScrollViewCompat contentContainerStyle={{ padding: 24, paddingTop: Platform.OS === 'web' ? 80 : insets.top + 40, paddingBottom: insets.bottom + 34, gap: 18 }} style={{ backgroundColor: colors.background }}>
    <Text style={{ fontSize: 27, fontWeight: '700', color: colors.foreground }}>NeuraCoreConnect</Text>
    <Text style={{ color: colors.mutedForeground }}>Your people, conversations and communities. One account across web and mobile.</Text>
    <Text style={{ color: colors.foreground, fontSize: 20 }}>{verify ? 'Verify your email' : register ? 'Create your account' : 'Welcome back'}</Text>
    {verify ? <TextInput accessibilityLabel="Verification code" style={input} value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="Email verification code" placeholderTextColor={colors.mutedForeground} /> : <>
      <TextInput accessibilityLabel="Email" style={input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email address" placeholderTextColor={colors.mutedForeground} />
      <TextInput accessibilityLabel="Password" style={input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" placeholderTextColor={colors.mutedForeground} />
    </>}
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text>}
    <Pressable disabled={busy} onPress={() => void execute()} style={{ padding: 16, backgroundColor: colors.primary, borderRadius: 14 }}><Text style={{ color: colors.primaryForeground }}>{busy ? 'Please wait…' : verify ? 'Verify' : register ? 'Create account' : 'Sign in'}</Text></Pressable>
    {verify && <Pressable disabled={busy} onPress={() => void execute(true)}><Text style={{ color: colors.primary }}>Resend code</Text></Pressable>}
    <Pressable disabled={busy} onPress={async () => { await signIn.reset(); await signUp.reset(); setVerify(false); setRegister(!register); setError(''); }}><Text style={{ color: colors.primary }}>{register ? 'Already a member? Sign in' : 'New here? Create an account'}</Text></Pressable>
    <View nativeID="clerk-captcha" />
  </KeyboardAwareScrollViewCompat>;
}
