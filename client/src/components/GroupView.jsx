import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/client.js';
import { useUI } from '../context/UIContext.jsx';
import { useLive } from '../context/SocketContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_LABELS, timeAgo, groupColor, groupInitials, isValidMatric, fileToResizedDataURL, groupTheme, recoMeta, displayName } from '../utils.js';
import Avatar from './Avatar.jsx';
import ColorPicker from './ColorPicker.jsx';

// Full-page WhatsApp-style view of a single group: a Chat tab and an Info/manage
// tab. Lives inside the Groups page's right pane.
export default function GroupView({ id, onChanged, onPatched, onBack, onActivity }) {
  const { triggerRefresh, openNewForGroup, openProject, refreshKey } = useUI();
  const { toast, subscribeGroupMessages } = useLive();
  const { user } = useAuth();
  const confirm = useConfirm();

  const [group, setGroup] = useState(null);
  // The info panel opens alongside the chat (desktop) / over it (mobile).
  const [infoOpen, setInfoOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Group-leader editing of the name + description/info.
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  // Unified add-participant field (matric OR supervisor name) + suggestions.
  const [showAdd, setShowAdd] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [supResults, setSupResults] = useState([]);
  const [supOpen, setSupOpen] = useState(false);

  // Snippet + chat
  const [snippetText, setSnippetText] = useState('');
  const [snippetPhotos, setSnippetPhotos] = useState([]); // up to 4 data URLs
  const [grpProjects, setGrpProjects] = useState([]);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatText, setChatText] = useState('');
  const chatRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/groups/${id}`);
      setGroup(data);
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    setInfoOpen(false);
    setGroup(null);
    load();
  }, [load]);

  const isMemberView = group && (group.myRole === 'admin' || group.myRole === 'member');
  const isAdmin = group?.myRole === 'admin';

  // Chat history + live updates
  useEffect(() => {
    if (!isMemberView) return;
    api.get(`/groups/${id}/messages`).then((r) => setChatMsgs(r.data.messages)).catch(() => setChatMsgs([]));
  }, [isMemberView, id]);

  // Projects posted under this group. Members see them even before approval, so
  // a freshly submitted group project shows up here right away. refreshKey makes
  // it reload after a new project (or snippet) is posted.
  useEffect(() => {
    if (!isMemberView) { setGrpProjects([]); return; }
    api.get(`/projects/group/${id}`).then((r) => setGrpProjects(r.data)).catch(() => setGrpProjects([]));
  }, [isMemberView, id, refreshKey]);

  useEffect(() => {
    if (!isMemberView || !subscribeGroupMessages) return;
    return subscribeGroupMessages(({ groupId, message }) => {
      if (String(groupId) === String(id)) setChatMsgs((prev) => [...prev, message]);
    });
  }, [isMemberView, id, subscribeGroupMessages]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMsgs]);

  // While the info panel is open, flag the body so a narrow (half-screen) desktop
  // can hide the app's side nav — letting the chat + info fill the width nicely.
  useEffect(() => {
    document.body.classList.toggle('group-info-open', infoOpen);
    return () => document.body.classList.remove('group-info-open');
  }, [infoOpen]);

  // Pin (or unpin, with null) a chat message — admins only.
  const pinMessage = (messageId) =>
    act(async () => (await api.patch(`/groups/${id}/pin`, { messageId })).data);

  // Supervisor suggestions — only while the text isn't a matric number.
  useEffect(() => {
    if (!supOpen || !addQuery.trim() || isValidMatric(addQuery)) {
      setSupResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/users/supervisors', { params: { q: addQuery.trim() } });
        setSupResults(data);
      } catch {
        setSupResults([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [addQuery, supOpen]);

  const act = async (fn) => {
    setBusy(true);
    setError('');
    try {
      const updated = await fn();
      if (updated) setGroup(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addParticipant = () =>
    act(async () => {
      const { data } = await api.post(`/groups/${id}/invite`, { query: addQuery.trim() });
      toast('Invitation sent.');
      setAddQuery('');
      setSupResults([]);
      return data;
    });

  const removeMember = async (m) => {
    if (!(await confirm({ title: 'Remove participant?', message: `Remove ${m.name} from “${group.name}”?`, confirmText: 'Remove', danger: true }))) return;
    act(async () => (await api.delete(`/groups/${id}/members/${m._id}`)).data);
  };

  const setAdmin = (m, makeAdmin) =>
    act(async () => (await api.patch(`/groups/${id}/members/${m._id}/admin`, { admin: makeAdmin })).data);

  const startEdit = () => {
    setEditName(group.name);
    setEditDesc(group.description || '');
    setEditing(true);
  };

  const saveEdit = () =>
    act(async () => {
      const name = editName.trim();
      if (!name) {
        setError('Please give the group a name.');
        return null;
      }
      const { data } = await api.patch(`/groups/${id}`, { name, description: editDesc.trim() });
      toast('Group updated.');
      setEditing(false);
      onPatched?.({ _id: id, name: data.name }); // sync the left sidebar instantly
      triggerRefresh();
      return data;
    });

  const toggleChat = () => act(async () => (await api.patch(`/groups/${id}/chat`)).data);

  // Debounce the theme PATCH — the full-spectrum picker fires on every drag, so
  // we update the accent optimistically at once but only persist the final
  // colour a moment after the user settles. We deliberately DON'T triggerRefresh
  // here — that reloads the Groups page and would bounce the view back to chat.
  const themeTimer = useRef(null);
  const setTheme = (color) => {
    if (group?.theme === color) return;
    setGroup((g) => (g ? { ...g, theme: color } : g));
    onPatched?.({ _id: id, theme: color }); // sync the left sidebar instantly
    clearTimeout(themeTimer.current);
    themeTimer.current = setTimeout(() => {
      act(async () => (await api.patch(`/groups/${id}/theme`, { theme: color })).data);
    }, 400);
  };

  const MAX_SNIPPET_PHOTOS = 4;

  const addSnippetPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-picking the same file
    if (!files.length) return;
    const room = MAX_SNIPPET_PHOTOS - snippetPhotos.length;
    if (room <= 0) {
      toast(`You can attach at most ${MAX_SNIPPET_PHOTOS} photos.`);
      return;
    }
    try {
      const added = await Promise.all(files.slice(0, room).map((f) => fileToResizedDataURL(f)));
      setSnippetPhotos((prev) => [...prev, ...added].slice(0, MAX_SNIPPET_PHOTOS));
      if (files.length > room) toast(`Only ${MAX_SNIPPET_PHOTOS} photos allowed — extras were skipped.`);
    } catch (err) {
      toast(err.message || 'Could not add that photo.');
    }
  };

  const removeSnippetPhoto = (i) =>
    setSnippetPhotos((prev) => prev.filter((_, idx) => idx !== i));

  const postSnippet = () => {
    const text = snippetText.trim();
    if (!text) return;
    act(async () => {
      await api.post(`/groups/${id}/snippets`, { text, photos: snippetPhotos });
      toast('Snippet posted to the feed.');
      setSnippetText('');
      setSnippetPhotos([]);
      triggerRefresh();
      return null;
    });
  };

  const deleteGroup = async () => {
    if (!(await confirm({ title: 'Delete group?', message: `This permanently deletes “${group.name}” for everyone.`, confirmText: 'Delete', danger: true }))) return;
    act(async () => {
      await api.delete(`/groups/${id}`);
      toast('Group deleted.');
      onChanged?.(null);
      return null;
    });
  };

  const sendChat = async () => {
    const text = chatText.trim();
    if (!text) return;
    setChatText('');
    try {
      const { data } = await api.post(`/groups/${id}/messages`, { text });
      setChatMsgs((prev) => [...prev, data]);
      onActivity?.(id); // my message moves this group to the top of the list
    } catch (e) {
      setError(e.message);
    }
  };

  if (!group) return <div className="group-placeholder"><div className="spinner" /></div>;

  // The group's chosen theme drives the chat accent (header bar, avatar, my
  // message bubbles, Send button) as well as its tags/cards on the feed.
  const theme = groupTheme(group.theme);

  const pinnedId = group.pinnedMessage ? String(group.pinnedMessage._id) : null;

  return (
    <div className="group-view">
      <div className="group-conv">
        <div className="group-hdr" style={{ borderTop: `3px solid ${theme.dot}` }}>
          {onBack && (
            <button className="gh-back" onClick={onBack} aria-label="Back">
              <i className="bi bi-arrow-left" />
            </button>
          )}
          <div className="gh-id" onClick={() => setInfoOpen((o) => !o)} title="View group info">
            <div className="group-ava lg" style={{ background: theme.dot }}>{groupInitials(group.name)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="gh-title">{group.name}</div>
              <div className="gh-sub">
                {group.dept ? `${group.dept} · ` : ''}
                {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
                {group.chatEnabled ? '' : ' · chat off'}
              </div>
            </div>
          </div>
          <button
            className={`gh-info-btn ${infoOpen ? 'active' : ''}`}
            onClick={() => setInfoOpen((o) => !o)}
            title="Group info"
            aria-label="Group info"
          >
            <i className="bi bi-info-circle" />
          </button>
        </div>

        {group.pinnedMessage && (
          <div className="grp-pinned">
            <span className="grp-pinned-ic"><i className="bi bi-pin-angle-fill" /></span>
            <div className="grp-pinned-body">
              <div className="grp-pinned-from">{displayName(group.pinnedMessage.from)}</div>
              <div className="grp-pinned-text">{group.pinnedMessage.text}</div>
            </div>
            {isAdmin && (
              <button className="grp-pinned-x" onClick={() => pinMessage(null)} disabled={busy} title="Unpin" aria-label="Unpin message">✕</button>
            )}
          </div>
        )}

        <div className="group-chat">
          <div className="dm-msgs" ref={chatRef}>
            {chatMsgs.length === 0 ? (
              <div style={{ textAlign: 'center', margin: 'auto', color: 'var(--textmuted)', fontSize: 13 }}>
                No messages yet — say hello 👋
              </div>
            ) : (
              chatMsgs.map((m) => {
                const mine = m.from?._id === user._id;
                const isPinned = pinnedId === String(m._id);
                return (
                  <div
                    key={m._id}
                    className={`dm-msg ${mine ? 'me' : 'them'}${isPinned ? ' pinned' : ''}`}
                    style={mine ? { background: theme.dot } : undefined}
                  >
                    {!mine && <div className="grp-author">{displayName(m.from)}</div>}
                    {m.text}
                    <div style={{ fontSize: 10, opacity: 0.65, marginTop: 3 }}>{timeAgo(m.createdAt)}</div>
                    {isAdmin && (
                      <button
                        className="grp-msg-pin"
                        onClick={() => pinMessage(isPinned ? null : m._id)}
                        disabled={busy}
                        title={isPinned ? 'Unpin message' : 'Pin message'}
                        aria-label={isPinned ? 'Unpin message' : 'Pin message'}
                      >
                        <i className={isPinned ? 'bi bi-pin-angle-fill' : 'bi bi-pin-angle'} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {group.chatEnabled ? (
            <div className="dm-input-row">
              <input
                placeholder="Type a message..."
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
              />
              <button className="btn btn-sm" style={{ background: theme.dot, color: '#fff' }} onClick={sendChat}>Send</button>
            </div>
          ) : (
            <div className="chat-disabled-note">An admin has disabled chat for this group.</div>
          )}
        </div>
      </div>

      {infoOpen && (
        <aside className="group-info-panel">
          <div className="group-info-hdr">
            <span>Group info</span>
            <button className="gh-close" onClick={() => setInfoOpen(false)} title="Close" aria-label="Close group info">✕</button>
          </div>
          <div className="group-info">
          <div className="group-about" style={{ borderLeftColor: theme.dot }}>
            <div className="ga-hdr">
              <span className="ga-ic" style={{ background: theme.bg, color: theme.fg }}>ℹ️</span>
              <span className="ga-title">About this group</span>
              {isAdmin && !editing && (
                <button className="ga-edit" onClick={startEdit} title="Edit group name & info" aria-label="Edit group name & info">
                  <i className="bi bi-pencil-square" />
                </button>
              )}
            </div>
            {editing ? (
              <div className="ga-edit-form">
                <div className="fg">
                  <label>Group name</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Group name"
                  />
                </div>
                <div className="fg">
                  <label>Description / info</label>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="What is this group about?"
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={busy || !editName.trim()}>Save</button>
                </div>
              </div>
            ) : (
              <div className={`ga-desc ${group.description ? '' : 'empty'}`}>
                {group.description || 'No description has been added for this group yet.'}
              </div>
            )}
            <div className="ga-meta">
              {group.dept && <span className="ga-chip">🏷️ {group.dept}</span>}
              <span className="ga-chip">👥 {group.memberCount} member{group.memberCount === 1 ? '' : 's'}</span>
              {group.createdAt && (
                <span className="ga-chip">📅 {new Date(group.createdAt).toLocaleDateString()}</span>
              )}
            </div>
          </div>

          {isAdmin && (
            <>
              <div className="label">Group post</div>
              <div className="snippet-box">
                <div className="sb-hdr">📣 Post a snippet to the feed</div>
                <textarea
                  value={snippetText}
                  onChange={(e) => setSnippetText(e.target.value)}
                  placeholder="Share an update with everyone…"
                />

                {snippetPhotos.length > 0 && (
                  <div className="sb-photos">
                    {snippetPhotos.map((src, i) => (
                      <div className="sb-thumb" key={i}>
                        <img src={src} alt={`Progress photo ${i + 1}`} />
                        <button
                          type="button"
                          className="sb-thumb-x"
                          onClick={() => removeSnippetPhoto(i)}
                          aria-label="Remove photo"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="sb-actions">
                  <label className={`sb-photo-btn ${snippetPhotos.length >= MAX_SNIPPET_PHOTOS ? 'disabled' : ''}`}>
                    <span className="sb-photo-ic">＋</span> Add photos {snippetPhotos.length > 0 ? `(${snippetPhotos.length}/${MAX_SNIPPET_PHOTOS})` : ''}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: 'none' }}
                      disabled={snippetPhotos.length >= MAX_SNIPPET_PHOTOS}
                      onChange={addSnippetPhotos}
                    />
                  </label>
                  <button className="btn btn-primary btn-sm" onClick={postSnippet} disabled={busy || !snippetText.trim()}>
                    Post snippet
                  </button>
                </div>
              </div>

              <div className="label">Group colour</div>
              <ColorPicker value={groupTheme(group.theme).dot} onChange={setTheme} />
            </>
          )}

          <div className="label">Participants ({group.memberCount})</div>
          {group.members.map((m) => (
            <div className="list-row" key={m._id}>
              <Avatar user={m} size={30} />
              <div className="meta" style={{ flex: 1 }}>
                <div className="title">{displayName(m)}{m.isCreator && ' · creator'}</div>
                <div className="sub">{ROLE_LABELS[m.role]}{m.matric ? ` · ${m.matric}` : ''}</div>
              </div>
              {m.isAdmin && <span className="role-badge rb-admin">Group Admin</span>}
              {isAdmin && !m.isCreator && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {m.role !== 'supervisor' &&
                    (m.isAdmin ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => setAdmin(m, false)} disabled={busy}>Remove admin</button>
                    ) : (
                      <button className="btn btn-outline btn-sm" onClick={() => setAdmin(m, true)} disabled={busy}>Make admin</button>
                    ))}
                  <button className="btn btn-danger btn-sm" onClick={() => removeMember(m)} disabled={busy}>Remove</button>
                </div>
              )}
            </div>
          ))}

          <div className="label">Group projects{grpProjects.length ? ` (${grpProjects.length})` : ''}</div>
          {grpProjects.length === 0 ? (
            <div className="gp-empty">No projects under this group yet.</div>
          ) : (
            grpProjects.map((p) => (
              <div className="gp-row" key={p._id} onClick={() => openProject(p._id)}>
                <span className="gp-medal">{recoMeta(p)?.emoji || '📁'}</span>
                <div className="gp-meta">
                  <div className="gp-title">{p.title}</div>
                  <div className="gp-sub">{p.authors?.map((a) => a.name).join(', ')}</div>
                </div>
                {p.status === 'approved' ? (
                  <span className="gp-live">● Published</span>
                ) : (
                  <span className={`tag tag-${p.status}`}>{p.status}</span>
                )}
              </div>
            ))
          )}

          {isAdmin && (
            <>
              {/* WhatsApp-style "Add member" — icon + label, no write-up. */}
              <button className="add-row" onClick={() => setShowAdd((s) => !s)}>
                <span className="add-ic green">＋</span>
                <span className="add-lbl">Add member</span>
              </button>
              {showAdd && (
                <div className="add-input-row">
                  <div className="autocomplete" style={{ position: 'relative', flex: 1 }}>
                    <input
                      value={addQuery}
                      autoFocus
                      onChange={(e) => { setAddQuery(e.target.value); setSupOpen(true); }}
                      onFocus={() => setSupOpen(true)}
                      onBlur={() => setTimeout(() => setSupOpen(false), 150)}
                      onKeyDown={(e) => e.key === 'Enter' && addQuery.trim() && addParticipant()}
                      placeholder=""
                      autoComplete="off"
                    />
                    {supOpen && supResults.length > 0 && (
                      <ul className="autocomplete-list">
                        {supResults.map((s) => (
                          <li key={s._id} onMouseDown={() => { setAddQuery(s.name); setSupResults([]); setSupOpen(false); }}>
                            <span className="ac-name">{displayName(s)}</span>
                            {s.dept && <span className="ac-meta">{s.dept}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button className="btn btn-primary" onClick={addParticipant} disabled={busy || !addQuery.trim()}>Invite</button>
                </div>
              )}

              {/* New group project — opens the project form pre-tagged to this group. */}
              <button className="add-row" onClick={() => openNewForGroup(group._id)}>
                <span className="add-ic amber">＋</span>
                <span className="add-lbl">New project</span>
              </button>

              {group.invites.length > 0 && (
                <>
                  <div className="label">Pending invitations</div>
                  {group.invites.map((iv) => (
                    <div className="list-row" key={iv._id}>
                      <Avatar user={iv.user} size={28} />
                      <div className="meta" style={{ flex: 1 }}>
                        <div className="title">{displayName(iv.user)}</div>
                        <div className="sub">{ROLE_LABELS[iv.user.role]}{iv.user.matric ? ` · ${iv.user.matric}` : ''} · awaiting response</div>
                      </div>
                      <span className="tag tag-pending">pending</span>
                    </div>
                  ))}
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: '1.25rem' }}>
                <button
                  className={`btn btn-sm ${group.chatEnabled ? 'btn-amber' : 'btn-success'}`}
                  onClick={toggleChat}
                  disabled={busy}
                >
                  {group.chatEnabled ? 'Disable group chat' : 'Enable group chat'}
                </button>
                <button className="btn btn-danger btn-sm" onClick={deleteGroup} disabled={busy}>Delete group</button>
              </div>
            </>
          )}

          {error && <div className="auth-error" style={{ marginTop: '1rem' }}>{error}</div>}
          </div>
        </aside>
      )}
    </div>
  );
}
