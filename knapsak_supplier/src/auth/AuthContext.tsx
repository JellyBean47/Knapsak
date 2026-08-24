import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from '../firebase';

interface AuthState {
  user: User | null;
  isSupplier: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

async function checkSupplier(user: User): Promise<boolean> {
  const token = await user.getIdTokenResult(true);
  return token.claims.role === 'supplier';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isSupplier, setIsSupplier] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (next) => {
      if (!next) {
        setUser(null);
        setIsSupplier(false);
        setLoading(false);
        return;
      }

      try {
        const supplier = await checkSupplier(next);
        if (!supplier) {
          await signOut(auth);
          setUser(null);
          setIsSupplier(false);
          setError('This account is not a supplier. Ask an admin to grant access.');
        } else {
          setUser(next);
          setIsSupplier(true);
          setError(null);
        }
      } catch {
        setUser(null);
        setIsSupplier(false);
        setError('Could not verify supplier access.');
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const supplier = await checkSupplier(cred.user);
      if (!supplier) {
        await signOut(auth);
        setError('This account is not a supplier. Ask an admin to grant access.');
        throw new Error('not-supplier');
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'not-supplier') {
        throw err;
      }
      const code = (err as { code?: string }).code;
      if (
        code === 'auth/invalid-credential'
        || code === 'auth/wrong-password'
        || code === 'auth/user-not-found'
        || code === 'auth/invalid-email'
      ) {
        setError('Invalid email or password.');
      } else {
        setError('Sign-in failed. Try again.');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({ user, isSupplier, loading, error, login, logout, clearError }),
    [user, isSupplier, loading, error, login, logout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
