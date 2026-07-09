import { useEffect, useState, useRef, useCallback } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLive } from '../context/SocketContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import Avatar from '../components/Avatar.jsx';
import { ROLE_LABELS, timeAgo, displayName } from '../utils.js';

export default function Messages() {
  const { user } = useAuth();
  const { online, subscribeMessages, subscribeMessageDeleted, fetchNotifications, refreshMessageUnread } = useLive();
  const confirm = useConfirm();
  // Admins & supervisors browse the whole directory; everyone else only sees
  // their own conversations and adds new people by matric/name (WhatsApp-style).
  const privileged = user.role === 'admin' || user.role === 'supervisor';

  const [users, setUsers] = useState([]);
  const [unread, setUnread] = useState({}); // userId -> count
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [infoOpen, setInfoOpen] = useState(false); // contact info panel (header click)
  const [replyingTo, setReplyingTo] = useState(null); // message object being replied to
  const [highlightId, setHighlightId] = useState(null); // briefly flashed after a quote-jump
  const msgsRef = useRef(null);
  const msgNodeRefs = useRef({}); // messageId -> DOM node, for quote-jump scrolling

  // New-chat (contact lookup) state — only used by non-privileged users.
  const [newChat, setNewChat] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const loadUsers = useCallback(() => {
    api.get('/users').then((r) => setUsers(r.data)).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    loadUsers();
    api.get('/messages').then((r) => {
      const map = {};
      r.data.forEach((x) => (map[x.from] = x.count));
      setUnread(map);
    });
  }, [loadUsers]);

  // Full-page WhatsApp-style DMs on mobile: drop the home top bar on this route,
  // and the bottom tab bar once a thread is open. (CSS keys off these classes.)
  useEffect(() => {
    document.body.classList.add('route-messages');
    return () => document.body.classList.remove('route-messages', 'dm-chat-open');
  }, []);
  useEffect(() => {
    document.body.classList.toggle('dm-chat-open', !!selected);
  }, [selected]);

  // Debounced contact lookup while the New-chat panel is open.
  useEffect(() => {
    if (!newChat) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/users/lookup', { params: { q: term } });
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, newChat]);

  const loadThread = useCallback(
    async (uid) => {
      setSelected(uid);
      setInfoOpen(false);
      setReplyingTo(null);
      // Instant local feedback — the per-conversation badge disappears the
      // moment the thread opens, without waiting on the network round trip.
      setUnread((u) => ({ ...u, [uid]: 0 }));
      const { data } = await api.get(`/messages/${uid}`); // marks them read server-side
      setMessages(data);
      fetchNotifications();
      refreshMessageUnread(); // re-derive the global Messages-nav badge from the server
    },
    [fetchNotifications, refreshMessageUnread]
  );

  // Pick a looked-up person: drop them into the sidebar and open the thread.
  const addContact = (u) => {
    setUsers((list) => (list.some((x) => x._id === u._id) ? list : [...list, u]));
    setNewChat(false);
    setQuery('');
    setResults([]);
    loadThread(u._id);
  };

  // Move a conversation to the top of the sidebar (most recent activity first).
  const bumpUser = useCallback((uid) => {
    setUsers((list) => {
      const idx = list.findIndex((x) => x._id === uid);
      if (idx <= 0) return list; // absent or already on top
      const copy = [...list];
      const [u] = copy.splice(idx, 1);
      copy.unshift(u);
      return copy;
    });
  }, []);

  // Live incoming messages
  useEffect(() => {
    return subscribeMessages((m) => {
      if (selected && (m.from === selected || m.to === selected)) {
        setMessages((prev) => [...prev, m]);
        // The thread is open right now, so this message is effectively read
        // immediately — mark it so server-side (same call loadThread uses)
        // rather than letting it sit unread until the thread is reopened.
        if (m.from === selected) {
          api.get(`/messages/${selected}`).then(refreshMessageUnread);
        }
      } else {
        setUnread((u) => ({ ...u, [m.from]: (u[m.from] || 0) + 1 }));
        // A message from someone not yet in the sidebar — refresh so the new
        // conversation shows up (the thread now exists server-side).
        setUsers((list) => {
          if (!list.some((x) => x._id === m.from)) loadUsers();
          return list;
        });
      }
      // The newest conversation rises to the top of the list.
      bumpUser(m.from);
    });
  }, [subscribeMessages, selected, loadUsers, bumpUser, refreshMessageUnread]);

  // Live delete: the other participant deleted a message they sent. It's
  // removed outright — no "message deleted" trace is shown on either side.
  useEffect(() => {
    return subscribeMessageDeleted((m) => {
      setMessages((prev) => prev.filter((x) => x._id !== m._id));
    });
  }, [subscribeMessageDeleted]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    const t = text.trim();
    if (!t || !selected) return;
    setText('');
    const replyTo = replyingTo?._id;
    setReplyingTo(null);
    const { data } = await api.post(`/messages/${selected}`, { text: t, replyTo });
    setMessages((prev) => [...prev, data]);
    bumpUser(selected); // my reply moves this chat to the top too
  };

  const deleteMsg = async (m) => {
    if (!(await confirm({ title: 'Delete message?', message: 'This will delete the message for everyone.', confirmText: 'Delete', danger: true }))) return;
    const { data } = await api.delete(`/messages/msg/${m._id}`);
    setMessages((prev) => prev.filter((x) => x._id !== data._id));
    if (replyingTo?._id === data._id) setReplyingTo(null);
  };

  // Jump to (and briefly flash) the original message a quote-preview points at.
  const scrollToMessage = (id) => {
    const node = msgNodeRefs.current[id];
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(id);
    setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 1500);
  };

  const other = users.find((u) => u._id === selected);
  // Students & guests see a privacy-limited contact card (no email / matric).
  const restrictedViewer = user.role === 'student' || user.role === 'observer';

  return (
    <>
      <div className="page-title">Messages</div>
      <div className="card dm-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className={`dm-pane ${selected ? 'show-thread' : ''}`}>
          <div className="dm-sidebar">
            {!privileged && (
              <button className="dm-newchat" onClick={() => { setNewChat((v) => !v); setQuery(''); setResults([]); }}>
                {newChat ? '✕ Cancel' : '✚ New chat'}
              </button>
            )}

            {newChat ? (
              <div className="dm-newchat-panel">
                <div className="dm-search-wrap">
                  <input
                    className="dm-search"
                    placeholder="Matric number or full name"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                  />
                  {query && (
                    <button
                      className="search-clear"
                      onClick={() => { setQuery(''); setResults([]); }}
                      title="Clear search"
                      aria-label="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {searching && <div className="dm-hint">Searching…</div>}
                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <div className="dm-hint">No user found</div>
                )}
                {results.map((u) => (
                  <button key={u._id} className="dm-user" onClick={() => addContact(u)}>
                    <Avatar user={u} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="dm-uname" style={{ fontSize: 12, fontWeight: 500 }}>{displayName(u)}</div>
                      <div style={{ fontSize: 10, color: 'var(--textmuted)' }}>
                        {u.matric || ROLE_LABELS[u.role]}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <>
                {users.length === 0 && (
                  <div className="dm-hint">
                    {privileged ? 'No users yet.' : 'No conversations yet. Start a new chat.'}
                  </div>
                )}
                {users.map((u) => (
                  <button key={u._id} className={`dm-user ${selected === u._id ? 'active' : ''}`} onClick={() => loadThread(u._id)}>
                    <Avatar user={u} size={32} />
                    {online.includes(u._id) && <span className="online-dot" />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="dm-uname" style={{ fontSize: 12, fontWeight: 500 }}>{displayName(u).split(' ').slice(0, 2).join(' ')}</div>
                      <div style={{ fontSize: 10, color: 'var(--textmuted)' }}>{ROLE_LABELS[u.role]}</div>
                    </div>
                    {unread[u._id] > 0 && <span className="nav-count">{unread[u._id]}</span>}
                  </button>
                ))}
              </>
            )}
          </div>

          {selected ? (
            <div className="dm-chat">
              <div className="dm-chat-hdr" style={{ padding: '.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="dm-back" onClick={() => setSelected(null)} aria-label="Back">
                  <i className="bi bi-arrow-left" />
                </button>
                <div className="dm-hdr-id" onClick={() => setInfoOpen((o) => !o)} title="View contact info" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1, minWidth: 0 }}>
                  <Avatar user={other} size={30} />
                  <div style={{ minWidth: 0 }}>
                    <div className="dm-uname" style={{ fontSize: 13, fontWeight: 500 }}>{displayName(other)}</div>
                    <div style={{ fontSize: 11, color: 'var(--textmuted)' }}>
                      {online.includes(selected) ? '🟢 Online' : ROLE_LABELS[other?.role]}
                    </div>
                  </div>
                </div>
              </div>

              {infoOpen && other && (
                <div className="dm-info">
                  <button className="dm-info-x" onClick={() => setInfoOpen(false)} aria-label="Close">✕</button>
                  <Avatar user={other} size={64} />
                  <div className="dm-info-name">{displayName(other)}</div>
                  <span className={`role-badge rb-${other.role}`}>{ROLE_LABELS[other.role]}</span>
                  <div className="dm-info-rows">
                    <div><span>Status</span><b>{online.includes(selected) ? '🟢 Online' : 'Offline'}</b></div>
                    {/* Students & guests get a privacy-limited view: no email / matric. */}
                    {!restrictedViewer && other.email && <div><span>Email</span><b>{other.email}</b></div>}
                    {other.dept && <div><span>Department</span><b>{other.dept}</b></div>}
                    {other.level && <div><span>Level</span><b>{other.level}</b></div>}
                    {!restrictedViewer && other.role === 'student' && other.matric && <div><span>Matric</span><b>{other.matric}</b></div>}
                    {other.role === 'student' && other.set && <div><span>Set</span><b>{other.set}</b></div>}
                    {other.role === 'supervisor' && other.supervisorTag && <div><span>Tag</span><b>{other.supervisorTag}</b></div>}
                  </div>
                </div>
              )}

              <div className="dm-msgs" ref={msgsRef}>
                {messages.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--textmuted)', fontSize: 13 }}>
                    Start a conversation...
                  </div>
                )}
                {messages.map((m) => {
                  const mine = m.from === user._id;
                  return (
                    <div
                      key={m._id}
                      ref={(node) => { if (node) msgNodeRefs.current[m._id] = node; else delete msgNodeRefs.current[m._id]; }}
                      className={`dm-msg ${mine ? 'me' : 'them'}${highlightId === m._id ? ' flash' : ''}`}
                    >
                      <span className="msg-actions">
                        <button className="msg-action" onClick={() => setReplyingTo(m)} title="Reply" aria-label="Reply">
                          <i className="bi bi-reply-fill" />
                        </button>
                        {mine && (
                          <button className="msg-action" onClick={() => deleteMsg(m)} title="Delete" aria-label="Delete">
                            <i className="bi bi-trash3" />
                          </button>
                        )}
                      </span>
                      {m.replyTo && (
                        <div className="msg-reply-quote" onClick={() => scrollToMessage(m.replyTo._id)}>
                          <div className="msg-reply-quote-from">{m.replyTo.from?._id === user._id ? 'You' : displayName(m.replyTo.from)}</div>
                          <div className="msg-reply-quote-text">{m.replyTo.text}</div>
                        </div>
                      )}
                      {m.text}
                      <div style={{ fontSize: 10, opacity: 0.6, marginTop: 3 }}>{timeAgo(m.createdAt)}</div>
                    </div>
                  );
                })}
              </div>
              {replyingTo && (
                <div className="msg-reply-composer">
                  <div className="msg-reply-quote-body">
                    <div className="msg-reply-quote-from">{replyingTo.from === user._id ? 'You' : displayName(other)}</div>
                    <div className="msg-reply-quote-text">{replyingTo.text}</div>
                  </div>
                  <button className="msg-reply-cancel" onClick={() => setReplyingTo(null)} aria-label="Cancel reply">✕</button>
                </div>
              )}
              <div className="dm-input-row">
                <input
                  placeholder="Type a message..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                />
                <button className="btn btn-primary btn-sm" onClick={send}>
                  Send
                </button>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--textmuted)', fontSize: 13 }}>
              Select a conversation to start messaging
            </div>
          )}
        </div>
      </div>

      {/* Mobile-only floating new-chat button (non-privileged users). */}
      {!privileged && !selected && (
        <button
          className="dm-fab"
          onClick={() => { setNewChat((v) => !v); setQuery(''); setResults([]); }}
          aria-label={newChat ? 'Close new chat' : 'New chat'}
        >
          <i className={`bi ${newChat ? 'bi-x-lg' : 'bi-chat-dots-fill'}`} />
        </button>
      )}
    </>
  );
}
