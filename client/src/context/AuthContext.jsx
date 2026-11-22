import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from '../lib/api.js';

const Ctx = createContext(null);

/**
 * The signed-in user comes from GET /api/auth/me (the session is an httpOnly cookie the
 * browser sends automatically). `user` is null when logged out; `ready` turns true after the first check.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { user: u } = await api.get('/auth/me');
      setUser(u);
      return u;
    } catch (e) {
      // 401 = not signed in. Anything else (server down) also leaves us logged out, but we don't hang.
      if (e.status !== 401) console.warn('Could not check the session:', e.message);
      setUser(null);
      return null;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Any API call that finds the session gone drops the user; AppLayout then redirects to /login.
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  const login = useCallback(async (email, password, remember) => {
    const { user: u } = await api.post('/auth/login', { email, password, remember });
    setUser(u);
    return u;
  }, []);

  // Sign-up doesn't sign in: it returns { needsVerification, email, resendIn } and a code is emailed.
  const register = useCallback(
    (full_name, email, password, confirmPassword, remember) => api.post('/auth/register', { full_name, email, password, confirmPassword, remember }),
    []
  );

  const verifyEmail = useCallback(async (email, code, remember) => {
    const { user: u } = await api.post('/auth/verify-email', { email, code, remember });
    setUser(u);
    return u;
  }, []);

  const resendCode = useCallback((email) => api.post('/auth/resend-code', { email }), []);

  const loginWithGoogle = useCallback(async (credential, remember) => {
    const { user: u } = await api.post('/auth/google', { credential, remember });
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } finally { setUser(null); }
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, register, verifyEmail, resendCode, loginWithGoogle, logout, refresh, setUser }),
    [user, ready, login, register, verifyEmail, resendCode, loginWithGoogle, logout, refresh]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
