import { createContext, useContext } from 'react';

export type AppAuthValue = {
  getToken: () => Promise<string | null>;
  userId: string | null;
  signOut: () => Promise<void>;
  forgetTrustedDevice: () => Promise<void>;
};

export const AuthContext = createContext<AppAuthValue | null>(null);

export function useAppAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthGate is missing');
  return auth;
}
