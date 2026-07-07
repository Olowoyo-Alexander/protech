import { useEffect, useState, useCallback } from 'react';
import api from '../api/client.js';
import { useUI } from '../context/UIContext.jsx';
import { useLive } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { groupInitials, groupTheme } from '../utils.js';
import GroupView from '../components/GroupView.jsx';

export default function Groups() {
  const { openNewGroup, openGroup, selectedGroupId, refreshKey } = useUI();
  const { toast, subscribeGroupMessages } = useLive();
  const { user } = useAuth();
  // Guests (observers) can neither create groups nor be added to one.
  const canCreateGroup = user.role === 'student' || user.role === 'supervisor';
  const [groups, setGroups] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openInvite, setOpenInvite] = useState(null); // invite whose details are expanded
  // Mobile only: WhatsApp-style two-screen flow — the group list, then the chat.
  // `showChat` decides which screen is on top; desktop shows both panes at once.
  const [showChat, setShowChat] = useState(false);

  // Full-page groups on mobile: drop the home top bar while on this route, and
  // the bottom tab bar once a chat is open. (CSS keys off these body classes.)
  useEffect(() => {
    document.body.classList.add('route-groups');
    return () => document.body.classList.remove('route-groups', 'group-chat-open');
  }, []);
  useEffect(() => {
    document.body.classList.toggle('group-chat-open', showChat);
  }, [showChat]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/groups');
      setGroups(data.groups);
      setInvites(data.invites);
      return data.groups;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Keep a valid selection; default to the first group.
  useEffect(() => {
    if (loading) return;
    const valid = groups.some((g) => g._id === selectedGroupId);
    if (!valid) openGroup(groups[0]?._id || null);
  }, [groups, loading, selectedGroupId, openGroup]);

  // Move a group to the top of the list (most recent activity first), optionally
  // bumping its unread badge.
  const bumpGroup = useCallback((groupId, incUnread) => {
    setGroups((gs) => {
      const idx = gs.findIndex((g) => g._id === groupId);
      if (idx < 0) return gs;
      const copy = [...gs];
      const [g] = copy.splice(idx, 1);
      copy.unshift(incUnread ? { ...g, unreadCount: (g.unreadCount || 0) + 1 } : g);
      return copy;
    });
  }, []);

  // Live: a new group message rises that group to the top; badge it unless it's
  // the one already open.
  useEffect(() => {
    if (!subscribeGroupMessages) return;
    return subscribeGroupMessages(({ groupId }) => {
      bumpGroup(groupId, String(groupId) !== String(selectedGroupId));
    });
  }, [subscribeGroupMessages, selectedGroupId, bumpGroup]);

  const select = (id) => {
    openGroup(id);
    setGroups((gs) => gs.map((g) => (g._id === id ? { ...g, unreadCount: 0 } : g))); // clear badge
  };

  // Mobile: open the chat screen for a group; the back arrow returns to the list.
  const openChat = (id) => { select(id); setShowChat(true); };
  const backToList = () => setShowChat(false);

  const accept = async (gid) => {
    try {
      await api.post(`/groups/${gid}/accept`);
      toast('You joined the group!');
      await load();
      openGroup(gid);
    } catch (e) {
      toast(e.message);
    }
  };

  const decline = async (gid) => {
    try {
      await api.post(`/groups/${gid}/decline`);
      toast('Invitation declined.');
      await load();
    } catch (e) {
      toast(e.message);
    }
  };

  const onChanged = async () => {
    const remaining = await load();
    openGroup(remaining?.[0]?._id || null);
    setShowChat(false); // back to the list after a group is deleted/left
  };

  // In-place merge of a single group's changed fields (e.g. theme) into the list,
  // so the sidebar updates instantly without a reload (which would remount the
  // open group and bounce it back to chat).
  const patchGroupInList = useCallback((patch) => {
    if (!patch?._id) return;
    setGroups((gs) => gs.map((g) => (g._id === patch._id ? { ...g, ...patch } : g)));
  }, []);

  return (
    <>
      <div className="dash-head">
        <div>
          <div className="page-title" style={{ margin: 0 }}>Groups</div>
        </div>
        {canCreateGroup && (
          <button className="btn btn-primary btn-sm new-group-btn" onClick={openNewGroup}>+ New Group</button>
        )}
      </div>

      {invites.length > 0 && (
        <div className="section-card" style={{ marginBottom: '1rem' }}>
          <div className="section-title">Pending Invitations</div>
          {invites.map((g) => {
            const open = openInvite === g._id;
            return (
              <div key={g._id}>
                <div className="list-row">
                  {/* The group identity area folds/unfolds the details on click —
                      no separate "Details" button needed. */}
                  <div
                    className="invite-id"
                    onClick={() => setOpenInvite(open ? null : g._id)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpenInvite(open ? null : g._id)}
                  >
                    <div className="group-ava" style={{ background: groupTheme(g.theme).dot }}>{groupInitials(g.name)}</div>
                    <div className="meta" style={{ flex: 1 }}>
                      <div className="title">{g.name}</div>
                      <div className="sub">{g.dept ? `${g.dept} · ` : ''}invited by {g.creator?.name}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => accept(g._id)}>Accept</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => decline(g._id)}>Decline</button>
                  </div>
                </div>
                {open && (
                  <div className="invite-details">
                    <div className={`invite-desc ${g.description ? '' : 'empty'}`}>
                      {g.description || 'No description has been added for this group yet.'}
                    </div>
                    <div className="invite-chips">
                      {g.dept && <span className="ga-chip">🏷️ {g.dept}</span>}
                      <span className="ga-chip">👥 {g.memberCount} member{g.memberCount === 1 ? '' : 's'}</span>
                      <span className="ga-chip">👑 Created by {g.creator?.name || 'Unknown'}</span>
                      {g.createdAt && <span className="ga-chip">📅 {new Date(g.createdAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="spinner" />
      ) : groups.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">👥</div>
          <div>{canCreateGroup ? 'You’re not in any groups yet.' : 'You’re not in any groups.'}</div>
          {canCreateGroup && (
            <button className="btn btn-primary btn-sm" style={{ marginTop: '1rem' }} onClick={openNewGroup}>
              + Create your first group
            </button>
          )}
        </div>
      ) : (
        <div className={`card group-pane ${showChat ? 'show-chat' : ''}`}>
          <div className="group-sidebar">
            <div className="group-sidebar-hdr">Your groups</div>
            {groups.map((g) => {
              const active = g._id === selectedGroupId;
              const accent = groupTheme(g.theme).dot;
              return (
              <button
                key={g._id}
                className={`group-item ${active ? 'active' : ''}`}
                style={active ? { boxShadow: `inset 3px 0 0 ${accent}` } : undefined}
                onClick={() => openChat(g._id)}
              >
                <div className="group-ava" style={{ background: accent }}>{groupInitials(g.name)}</div>
                <div className="gi-meta">
                  <div className="gi-name">{g.name}</div>
                  <div className="gi-sub">
                    {g.memberCount} member{g.memberCount === 1 ? '' : 's'}
                    {g.myRole === 'admin' ? ' · admin' : ''}
                  </div>
                </div>
                {g.unreadCount > 0 && <span className="group-unread">{g.unreadCount}</span>}
              </button>
              );
            })}
          </div>

          <div className="group-main">
            {selectedGroupId ? (
              <GroupView id={selectedGroupId} onChanged={onChanged} onPatched={patchGroupInList} onBack={backToList} onActivity={(gid) => bumpGroup(gid, false)} />
            ) : (
              <div className="group-placeholder">Select a group to open its chat</div>
            )}
          </div>
        </div>
      )}

      {/* Mobile-only floating "+" to create a group (WhatsApp-style FAB). */}
      {canCreateGroup && !showChat && (
        <button className="group-fab" onClick={openNewGroup} aria-label="New group">
          <i className="bi bi-plus-lg" />
        </button>
      )}
    </>
  );
}
