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
import { canAccessPos, isPosRole } from '../domain/roles';
import type { PosRole } from '../domain/types';
import { auth } from '../firebase';

interface AuthState {
  user: User | null;
  posRole: PosRole | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

async function readPosRole(user: User): Promise<PosRole | null> {
  const token = await user.getIdTokenResult(true);
  const claim = token.claims.posRole;
  return isPosRole(claim) ? claim : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [posRole, setPosRole] = useState<PosRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (next) => {
      if (!next) {
        setUser(null);
        setPosRole(null);
        setLoading(false);
        return;
      }

      try {
        const role = await readPosRole(next);
        if (!canAccessPos(role)) {
          await signOut(auth);
          setUser(null);
          setPosRole(null);
          setError(
            'This account has no POS access. Ask an owner to grant a posRole claim.',
          );
        } else {
          setUser(next);
          setPosRole(role);
          setError(null);
        }
      } catch {
        setUser(null);
        setPosRole(null);
        setError('Could not verify POS access.');
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
      const role = await readPosRole(cred.user);
      if (!canAccessPos(role)) {
        await signOut(auth);
        setError(
          'This account has no POS access. Ask an owner to grant a posRole claim.',
        );
        throw new Error('not-pos-user');
      }
      setPosRole(role);
    } catch (err) {
      if (err instanceof Error && err.message === 'not-pos-user') {
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
    () => ({ user, posRole, loading, error, login, logout, clearError }),
    [user, posRole, loading, error, login, logout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
