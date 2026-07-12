import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import api from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext(null);
export const useLive = () => useContext(SocketContext);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [online, setOnline] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [toasts, setToasts] = useState([]);
  // Actual unread direct-message count — deliberately separate from the
  // notification-bell unreadCount below. A "message" notification and its
  // underlying Message are two different records with two different `read`
  // flags; opening a thread marks the messages read but not the notification,
  // so a badge driven by unreadCount would never clear on its own.
  const [messageUnreadTotal, setMessageUnreadTotal] = useState(0);
  const socketRef = useRef(null);
  const msgListeners = useRef(new Set());
  const groupMsgListeners = useRef(new Set());
  const msgDeletedListeners = useRef(new Set());
  const groupMsgDeletedListeners = useRef(new Set());

  const toast = useCallback((text) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data);
    } catch {
      /* ignore */
    }
  }, []);

  // Re-derives the true unread-message total from the server. Called on
  // login, on every incoming live message, and explicitly by Messages.jsx
  // right after it marks a thread read — so the badge reflects reality
  // instantly rather than waiting on the next unrelated re-render.
  const refreshMessageUnread = useCallback(async () => {
    try {
      const { data } = await api.get('/messages');
      setMessageUnreadTotal(data.reduce((sum, x) => sum + x.count, 0));
    } catch {
      /* ignore */
    }
  }, []);

  // Connect socket + load notifications when logged in
  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setNotifications([]);
      setOnline([]);
      setMessageUnreadTotal(0);
      return;
    }

    fetchNotifications();
    refreshMessageUnread();

    const token = sessionStorage.getItem('prostech_token');
    const socket = io(import.meta.env.VITE_API_URL || '/', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('presence', ({ online }) => setOnline(online));
    socket.on('notification', (n) => {
      setNotifications((prev) => [n, ...prev]);
      toast(n.text);
    });
    socket.on('message', (m) => {
      msgListeners.current.forEach((fn) => fn(m));
      refreshMessageUnread();
    });
    socket.on('groupMessage', (payload) => {
      groupMsgListeners.current.forEach((fn) => fn(payload));
    });
    socket.on('messageDeleted', (m) => {
      msgDeletedListeners.current.forEach((fn) => fn(m));
    });
    socket.on('groupMessageDeleted', (payload) => {
      groupMsgDeletedListeners.current.forEach((fn) => fn(payload));
    });

    return () => socket.disconnect();
  }, [user, fetchNotifications, refreshMessageUnread, toast]);

  const subscribeMessages = useCallback((fn) => {
    msgListeners.current.add(fn);
    return () => msgListeners.current.delete(fn);
  }, []);

  // Live group-chat messages: payload is { groupId, message }.
  const subscribeGroupMessages = useCallback((fn) => {
    groupMsgListeners.current.add(fn);
    return () => groupMsgListeners.current.delete(fn);
  }, []);

  // Live delete notifications — payload is the updated (now-deleted) message.
  const subscribeMessageDeleted = useCallback((fn) => {
    msgDeletedListeners.current.add(fn);
    return () => msgDeletedListeners.current.delete(fn);
  }, []);

  // Live group-chat delete notifications: payload is { groupId, message, unpinned }.
  const subscribeGroupMessageDeleted = useCallback((fn) => {
    groupMsgDeletedListeners.current.add(fn);
    return () => groupMsgDeletedListeners.current.delete(fn);
  }, []);

  const markRead = async (id) => {
    setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    try {
      await api.patch(`/notifications/${id}/read`);
    } catch {
      /* ignore */
    }
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await api.patch('/notifications/read-all');
    } catch {
      /* ignore */
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <SocketContext.Provider
      value={{
        online,
        notifications,
        unreadCount,
        messageUnreadTotal,
        refreshMessageUnread,
        fetchNotifications,
        markRead,
        markAllRead,
        toast,
        toasts,
        subscribeMessages,
        subscribeGroupMessages,
        subscribeMessageDeleted,
        subscribeGroupMessageDeleted,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}
