import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api from '../api/client.js';
import { SLUG_BY_ROLE } from '../utils.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// Auto sign-out after this long with no genuine user interaction, regardless
// of how long the underlying JWT itself remains valid for.
const IDLE_LIMIT_MS = 15 * 60 * 1000;
const IDLE_CHECK_MS = 30 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'wheel'];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Set right after a successful sign-in so we can show a brief welcome splash.
  // (Not set when restoring an existing session on page reload.)
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  // Restore session on load
  useEffect(() => {
    const token = localStorage.getItem('prostech_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => localStorage.removeItem('prostech_token'))
      .finally(() => setLoading(false));
  }, []);

  const finishAuth = ({ token, user }) => {
    localStorage.setItem('prostech_token', token);
    setUser(user);
    setJustLoggedIn(true); // trigger the welcome splash
  };

  const dismissWelcome = () => setJustLoggedIn(false);

  // Update the cached user after a profile edit.
  const updateUser = (u) => setUser(u);

  const login = async (email, password, expectedRole) => {
    const { data } = await api.post('/auth/login', { email, password, expectedRole });
    finishAuth(data);
    return data;
  };

  const register = async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    if (!data.needsVerification) finishAuth(data);
    return data; // may contain needsVerification / devCode
  };

  const verify = async (email, code) => {
    const { data } = await api.post('/auth/verify', { email, code });
    finishAuth(data);
    return data;
  };

  const resend = async (email) => (await api.post('/auth/resend', { email })).data;

  const logout = useCallback((reason) => {
    // Remember which role's gateway to return to, so logging out lands on the
    // login page for the account that was just signed out (not the default).
    setUser((u) => {
      const slug = u && SLUG_BY_ROLE[u.role];
      if (slug) localStorage.setItem('prostech_last_gateway', slug);
      return null;
    });
    localStorage.removeItem('prostech_token');
    if (reason === 'idle') localStorage.setItem('prostech_idle_logout', '1');
  }, []);

  // Auto sign-out after 15 minutes with no mouse/keyboard/touch/scroll activity,
  // independent of how long the JWT itself is still valid for. Uses a cheap
  // timestamp ref (no re-renders on every mousemove) checked on an interval,
  // rather than resetting a setTimeout on every single activity event.
  const lastActivityRef = useRef(Date.now());
  useEffect(() => {
    if (!user) return undefined;
    lastActivityRef.current = Date.now();
    const markActive = () => { lastActivityRef.current = Date.now(); };
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, markActive, { passive: true }));
    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= IDLE_LIMIT_MS) logout('idle');
    }, IDLE_CHECK_MS);
    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActive));
      clearInterval(interval);
    };
  }, [user, logout]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, verify, resend, logout, updateUser, justLoggedIn, dismissWelcome }}>
      {children}
    </AuthContext.Provider>
  );
}
