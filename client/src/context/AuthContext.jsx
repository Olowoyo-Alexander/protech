import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client.js';
import { SLUG_BY_ROLE } from '../utils.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

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

  const logout = () => {
    // Remember which role's gateway to return to, so logging out lands on the
    // login page for the account that was just signed out (not the default).
    const slug = user && SLUG_BY_ROLE[user.role];
    if (slug) localStorage.setItem('prostech_last_gateway', slug);
    localStorage.removeItem('prostech_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, verify, resend, logout, updateUser, justLoggedIn, dismissWelcome }}>
      {children}
    </AuthContext.Provider>
  );
}
