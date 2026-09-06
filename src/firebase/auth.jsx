import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { getFirebaseApp } from './init.js';
import { isFirebaseConfigured, isInventoryMockMode, KLFS_EMAIL_SUFFIX } from './config.js';

const AuthContext = createContext(null);

function isAllowedEmail(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith(KLFS_EMAIL_SUFFIX);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const mockMode = isInventoryMockMode();
  const configured = isFirebaseConfigured();

  useEffect(() => {
    if (mockMode) {
      setUser({ email: 'mock@klfs.ca', displayName: 'Mock Operator', mock: true });
      setLoading(false);
      return undefined;
    }

    if (!configured) {
      setLoading(false);
      return undefined;
    }

    const auth = getAuth(getFirebaseApp());
    setPersistence(auth, browserLocalPersistence).catch(() => {});

    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      if (nextUser && !isAllowedEmail(nextUser.email)) {
        setError(`Only ${KLFS_EMAIL_SUFFIX} accounts are allowed.`);
        await signOut(auth).catch(() => {});
        setUser(null);
      } else {
        setError('');
        setUser(nextUser);
      }
      setLoading(false);
    });

    return unsub;
  }, [mockMode, configured]);

  const signIn = useCallback(async () => {
    setError('');
    if (mockMode) {
      setUser({ email: 'mock@klfs.ca', displayName: 'Mock Operator', mock: true });
      return;
    }
    if (!configured) {
      setError('Firebase is not configured. Copy .env.example to .env and set VITE_FIREBASE_* vars.');
      return;
    }

    const auth = getAuth(getFirebaseApp());
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ hd: 'klfs.ca' });

    try {
      const cred = await signInWithPopup(auth, provider);
      if (!isAllowedEmail(cred.user.email)) {
        await signOut(auth);
        throw new Error(`Only ${KLFS_EMAIL_SUFFIX} Google accounts can sign in.`);
      }
    } catch (err) {
      setError(err.message || 'Sign-in failed');
      throw err;
    }
  }, [mockMode, configured]);

  const signOutUser = useCallback(async () => {
    if (mockMode) {
      setUser(null);
      return;
    }
    if (configured) {
      await signOut(getAuth(getFirebaseApp()));
    }
    setUser(null);
  }, [mockMode, configured]);

  const value = useMemo(() => ({
    user,
    loading,
    error,
    configured,
    mockMode,
    isSignedIn: Boolean(user),
    signIn,
    signOut: signOutUser,
  }), [user, loading, error, configured, mockMode, signIn, signOutUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
