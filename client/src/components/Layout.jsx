import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLive } from '../context/SocketContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import api from '../api/client.js';
import { ROLE_LABELS, timeAgo } from '../utils.js';
import Avatar from './Avatar.jsx';
import SearchBox from './SearchBox.jsx';
import ProjectModal from './ProjectModal.jsx';
import NewProjectModal from './NewProjectModal.jsx';
import NewGroupModal from './NewGroupModal.jsx';

function NotifPanel({ onClose }) {
  const { notifications, markRead, markAllRead } = useLive();
  const { openProject } = useUI();
  return (
    <div className="notif-panel" onClick={(e) => e.stopPropagation()}>
      <div className="notif-hdr">
        Notifications
        <button className="btn btn-ghost btn-sm" onClick={markAllRead}>
          Mark all read
        </button>
      </div>
      <div className="notif-list">
        {notifications.length === 0 && (
          <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--textmuted)', fontSize: 12 }}>
            No notifications
          </div>
        )}
        {notifications.map((n) => (
          <div
            key={n._id}
            className={`notif-item ${n.read ? '' : 'unread'}`}
            onClick={() => {
              markRead(n._id);
              if (n.project) {
                openProject(typeof n.project === 'string' ? n.project : n.project._id);
                onClose();
              }
            }}
          >
            {n.read ? <div style={{ width: 6 }} /> : <div className="notif-dot" />}
            <div style={{ flex: 1 }}>
              {n.text}
              <div style={{ fontSize: 10, color: 'var(--textmuted)', marginTop: 2 }}>
                {timeAgo(n.createdAt)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Mobile bottom tab bar (X/Twitter-style): a small, fixed set of primary
// destinations per role shown as evenly-spread icon-only tabs, with everything
// else tucked into a slide-up "More" sheet. `active` is the filled icon variant
// swapped in when the tab is selected; `badge` shows the unread-message count.
const MOBILE_TABS = {
  admin: {
    primary: [
      { path: '/', label: 'Dashboard', icon: 'bi-speedometer2' },
      { path: '/admin/moderation', label: 'Moderation', icon: 'bi-shield-check', active: 'bi-shield-fill-check' },
      { path: '/feed', label: 'Feed', icon: 'bi-house-door', active: 'bi-house-door-fill' },
      { path: '/messages', label: 'Messages', icon: 'bi-envelope', active: 'bi-envelope-fill', badge: true },
    ],
    more: [
      { path: '/admin/users', label: 'Users', icon: 'bi-people' },
      { path: '/admin/settings', label: 'Settings', icon: 'bi-gear' },
      { path: '/leaderboard', label: 'Leaderboard', icon: 'bi-trophy' },
      { path: '/analytics', label: 'Analytics', icon: 'bi-graph-up-arrow' },
    ],
  },
  supervisor: {
    primary: [
      { path: '/', label: 'Dashboard', icon: 'bi-speedometer2' },
      { path: '/approvals', label: 'Approvals', icon: 'bi-check2-circle', active: 'bi-check-circle-fill' },
      { path: '/feed', label: 'Feed', icon: 'bi-house-door', active: 'bi-house-door-fill' },
      { path: '/messages', label: 'Messages', icon: 'bi-envelope', active: 'bi-envelope-fill', badge: true },
    ],
    more: [
      { path: '/my-projects', label: 'My Projects', icon: 'bi-file-earmark-text' },
      { path: '/groups', label: 'Groups', icon: 'bi-people-fill' },
      { path: '/leaderboard', label: 'Leaderboard', icon: 'bi-trophy' },
      { path: '/analytics', label: 'Analytics', icon: 'bi-graph-up-arrow' },
      { path: '/saved', label: 'Saved', icon: 'bi-bookmark' },
    ],
  },
  student: {
    primary: [
      { path: '/', label: 'Feed', icon: 'bi-house-door', active: 'bi-house-door-fill' },
      { path: '/my-projects', label: 'My Projects', icon: 'bi-file-earmark-text', active: 'bi-file-earmark-text-fill' },
      { path: '/groups', label: 'Groups', icon: 'bi-people', active: 'bi-people-fill' },
      { path: '/messages', label: 'Messages', icon: 'bi-envelope', active: 'bi-envelope-fill', badge: true },
    ],
    more: [
      { path: '/leaderboard', label: 'Leaderboard', icon: 'bi-trophy' },
      { path: '/analytics', label: 'Analytics', icon: 'bi-graph-up-arrow' },
      { path: '/saved', label: 'Saved', icon: 'bi-bookmark' },
    ],
  },
  observer: {
    primary: [
      { path: '/', label: 'Feed', icon: 'bi-house-door', active: 'bi-house-door-fill' },
      { path: '/leaderboard', label: 'Leaderboard', icon: 'bi-trophy', active: 'bi-trophy-fill' },
      { path: '/analytics', label: 'Analytics', icon: 'bi-graph-up-arrow' },
      { path: '/messages', label: 'Messages', icon: 'bi-envelope', active: 'bi-envelope-fill', badge: true },
    ],
    more: [
      { path: '/saved', label: 'Saved', icon: 'bi-bookmark' },
    ],
  },
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { unreadCount } = useLive();
  const { openNew, openProject, selectedProjectId, showNew, showNewGroup } = useUI();
  const { theme, toggleTheme } = useTheme();
  const { departments: DEPTS } = useSettings();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const notifRef = useRef(null);

  // Close notifications on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifOpen && notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [notifOpen]);

  // Lock background scrolling while any overlay is open, and hide the home top
  // bar behind full-screen overlays (project detail, new-item forms, search) so
  // they read as their own page. The bottom "More" sheet keeps the top bar.
  useEffect(() => {
    const fsOverlay = !!(selectedProjectId || showNew || showNewGroup || searchOpen);
    const anyOverlay = fsOverlay || moreOpen;
    document.body.classList.toggle('no-scroll', anyOverlay);
    document.body.classList.toggle('fs-overlay', fsOverlay);
    return () => {
      document.body.classList.remove('no-scroll', 'fs-overlay');
    };
  }, [selectedProjectId, showNew, showNewGroup, searchOpen, moreOpen]);

  const canCreate = user.role === 'student' || user.role === 'supervisor';
  const isAdmin = user.role === 'admin';
  const isSupervisor = user.role === 'supervisor';
  const go = (path) => navigate(path);
  const active = (path) => location.pathname === path;

  // Confirm before signing out so an accidental click doesn't drop the session.
  const confirmLogout = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You’ll be returned to the sign-in page.',
      confirmText: 'Sign Out',
    });
    if (ok) logout();
  };

  const submitSearch = (term) => {
    if (term.trim()) navigate('/?q=' + encodeURIComponent(term.trim()));
  };
  const clearSearch = () => {
    setSearch('');
    navigate('/'); // also clears any active search results
  };

  // Smart autocomplete for the global search: matching project titles (fuzzy,
  // server-ranked) plus any department names that match the query. Picking a
  // project opens it directly; picking a department runs a scoped search.
  const suggestSearch = useCallback(
    async (term) => {
      const lower = term.toLowerCase();
      const deptItems = DEPTS.filter((d) => d.toLowerCase().includes(lower))
        .slice(0, 3)
        .map((d) => ({
          key: 'dept-' + d,
          label: d,
          sub: 'Department',
          icon: <i className="bi bi-tag" />,
          onPick: () => {
            setSearch(d);
            setSearchOpen(false);
            navigate('/?q=' + encodeURIComponent(d));
          },
        }));
      const { data } = await api.get('/projects', { params: { q: term } });
      const projItems = data.slice(0, 6).map((p) => ({
        key: 'proj-' + p._id,
        label: p.title,
        sub: [p.dept, p.set].filter(Boolean).join(' · ') || 'Project',
        icon: <i className="bi bi-file-earmark-text" />,
        onPick: () => {
          setSearch('');
          setSearchOpen(false);
          openProject(p._id);
        },
      }));
      return [...deptItems, ...projItems];
    },
    [DEPTS, navigate, openProject]
  );

  const NavItem = ({ path, icon, label }) => (
    <button className={`nav-item ${active(path) ? 'active' : ''}`} onClick={() => go(path)}>
      <span>{icon}</span> <span className="nav-label">{label}</span>
    </button>
  );

  return (
    <div id="main-screen">
      <div className="topbar">
        <div className="logo" onClick={() => go('/')}>
          PROTECH
        </div>
        {/* Mobile-only greeting header (reference-style): avatar + "Hey, name".
            Shown only on phones via CSS; taps through to the profile. */}
        <div className="topbar-greeting" onClick={() => go('/profile')} role="button" aria-label="Your profile">
          <Avatar user={user} size={40} />
          <div className="tg-text">
            <div className="tg-hi">Hey, {user.name.split(' ')[0]}</div>
          </div>
        </div>
        <SearchBox
          wrapClassName="topbar-search"
          placeholder="Search projects, topics, departments..."
          value={search}
          onChange={setSearch}
          onClear={clearSearch}
          onEnter={submitSearch}
          suggest={suggestSearch}
        />
        <div className="topbar-actions">
          {canCreate && (
            <button className="btn btn-primary btn-sm" onClick={openNew} aria-label="New project">
              + <span className="btn-txt">New Project</span>
            </button>
          )}
          <button
            className="icon-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle colour theme"
          >
            <i className={theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars'} />
          </button>
          <div className="notif-rel" ref={notifRef}>
            <button className="icon-btn" onClick={() => setNotifOpen((o) => !o)} title="Notifications" aria-label="Notifications">
              <i className="bi bi-bell" />{unreadCount > 0 && <span className="badge">{unreadCount}</span>}
            </button>
            {notifOpen && <NotifPanel onClose={() => setNotifOpen(false)} />}
          </div>
          <button className="icon-btn" onClick={() => go('/messages')} title="Messages" aria-label="Messages">
            <i className="bi bi-envelope" />
          </button>
          <div className="user-chip" onClick={() => go('/profile')} title="View your profile" style={{ cursor: 'pointer' }}>
            <Avatar user={user} size={28} />
            <span className="uname">{user.title ? `${user.title} ` : ''}{user.name.split(' ')[0]}</span>
            <span className={`role-badge rb-${user.role}`}>{ROLE_LABELS[user.role]}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={confirmLogout}>
            Sign Out
          </button>
        </div>
      </div>

      <div className="content-area">
        <div className="sidenav">
          {isAdmin ? (
            <>
              <NavItem path="/" icon={<i className="bi bi-speedometer2" />} label="Dashboard" />
              <NavItem path="/admin/moderation" icon={<i className="bi bi-shield-check" />} label="Moderation" />
              <NavItem path="/admin/users" icon={<i className="bi bi-people" />} label="Users" />
              <NavItem path="/admin/settings" icon={<i className="bi bi-gear" />} label="Settings" />
              <div className="nav-divider" />
              <NavItem path="/feed" icon={<i className="bi bi-house-door" />} label="Feed" />
              <NavItem path="/leaderboard" icon={<i className="bi bi-trophy" />} label="Leaderboard" />
              <NavItem path="/analytics" icon={<i className="bi bi-graph-up-arrow" />} label="Analytics" />
              <NavItem path="/messages" icon={<i className="bi bi-envelope" />} label="Messages" />
            </>
          ) : isSupervisor ? (
            <>
              <NavItem path="/" icon={<i className="bi bi-speedometer2" />} label="Dashboard" />
              <NavItem path="/approvals" icon={<i className="bi bi-check2-circle" />} label="Approvals" />
              <NavItem path="/feed" icon={<i className="bi bi-house-door" />} label="Feed" />
              <NavItem path="/leaderboard" icon={<i className="bi bi-trophy" />} label="Leaderboard" />
              <NavItem path="/analytics" icon={<i className="bi bi-graph-up-arrow" />} label="Analytics" />
              <div className="nav-divider" />
              <div className="nav-section">My Space</div>
              <NavItem path="/my-projects" icon={<i className="bi bi-file-earmark-text" />} label="My Projects" />
              <NavItem path="/groups" icon={<i className="bi bi-people-fill" />} label="Groups" />
              <NavItem path="/saved" icon={<i className="bi bi-bookmark" />} label="Saved" />
              <NavItem path="/messages" icon={<i className="bi bi-envelope" />} label="Messages" />
            </>
          ) : (
            <>
              <NavItem path="/" icon={<i className="bi bi-house-door" />} label="Feed" />
              <NavItem path="/leaderboard" icon={<i className="bi bi-trophy" />} label="Leaderboard" />
              <NavItem path="/analytics" icon={<i className="bi bi-graph-up-arrow" />} label="Analytics" />
              <div className="nav-divider" />
              <div className="nav-section">My Space</div>
              {/* Guests can't own projects or join groups, so those are hidden for them. */}
              {user.role === 'student' && (
                <>
                  <NavItem path="/my-projects" icon={<i className="bi bi-file-earmark-text" />} label="My Projects" />
                  <NavItem path="/groups" icon={<i className="bi bi-people-fill" />} label="Groups" />
                </>
              )}
              <NavItem path="/saved" icon={<i className="bi bi-bookmark" />} label="Saved" />
              <NavItem path="/messages" icon={<i className="bi bi-envelope" />} label="Messages" />
            </>
          )}
          {/* Sign out lives in the topbar on desktop; on phones it moves into the
              bottom tab bar's "More" sheet below. */}
          <div className="nav-spacer" />
        </div>
        <div className="main-content">{children}</div>
      </div>

      {/* Phone-only bottom tab bar. Hidden on desktop via CSS.
          Layout: [tab][tab][ Search (centered, elevated) ][tab][More].
          Search opens a full-screen sheet; the demoted 4th destination
          (Messages) and secondary links live in the "More" sheet. */}
      {(() => {
        const cfg = MOBILE_TABS[user.role] || MOBILE_TABS.observer;
        const barTabs = cfg.primary.slice(0, 3);          // three flanking tabs
        const overflow = [...cfg.primary.slice(3), ...cfg.more]; // demoted tab + secondary
        const inMore = overflow.some((m) => active(m.path));
        const overflowUnread = cfg.primary.slice(3).some((t) => t.badge) && unreadCount > 0;

        const renderTab = (t) => {
          if (!t) return null;
          const on = active(t.path);
          return (
            <button
              key={t.path}
              className={`tabbar-btn ${on ? 'active' : ''}`}
              onClick={() => go(t.path)}
              aria-label={t.label}
              aria-current={on ? 'page' : undefined}
            >
              <i className={`bi ${on && t.active ? t.active : t.icon}`} />
              {t.badge && unreadCount > 0 && (
                <span className="tabbar-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </button>
          );
        };

        return (
          <>
            <nav className="tabbar" aria-label="Primary">
              {renderTab(barTabs[0])}
              {renderTab(barTabs[1])}
              {/* Centered Search button — a normal tab, highlighted only while
                  the search sheet is open (not permanently "on"). */}
              <button
                className={`tabbar-btn ${searchOpen ? 'active' : ''}`}
                onClick={(e) => { e.currentTarget.blur(); setSearchOpen(true); }}
                aria-label="Search"
                aria-expanded={searchOpen}
              >
                <i className="bi bi-search" />
              </button>
              {renderTab(barTabs[2])}
              <button
                className={`tabbar-btn ${inMore || moreOpen ? 'active' : ''}`}
                onClick={() => setMoreOpen(true)}
                aria-label="More"
                aria-haspopup="true"
                aria-expanded={moreOpen}
              >
                <i className="bi bi-three-dots" />
                {overflowUnread && (
                  <span className="tabbar-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
              </button>
            </nav>

            {moreOpen && (
              <div className="sheet-overlay" onClick={() => setMoreOpen(false)}>
                <div className="more-sheet" onClick={(e) => e.stopPropagation()} role="menu">
                  <div className="more-sheet-grip" />
                  <div className="more-sheet-list">
                    {overflow.map((m) => (
                      <button
                        key={m.path}
                        className={`more-sheet-item ${active(m.path) ? 'active' : ''}`}
                        onClick={() => { setMoreOpen(false); go(m.path); }}
                        role="menuitem"
                      >
                        <i className={`bi ${m.icon}`} /> <span>{m.label}</span>
                        {m.badge && unreadCount > 0 && (
                          <span className="more-sheet-count">{unreadCount > 99 ? '99+' : unreadCount}</span>
                        )}
                      </button>
                    ))}
                    <button
                      className="more-sheet-item danger"
                      onClick={() => { setMoreOpen(false); confirmLogout(); }}
                      role="menuitem"
                    >
                      <i className="bi bi-box-arrow-right" /> <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {searchOpen && (
              <div className="search-overlay" onClick={() => setSearchOpen(false)}>
                <div className="search-overlay-bar" onClick={(e) => e.stopPropagation()}>
                  <SearchBox
                    wrapClassName="search-overlay-box"
                    placeholder="Search projects, topics, departments..."
                    value={search}
                    onChange={setSearch}
                    onClear={() => setSearch('')}
                    onEnter={(t) => { submitSearch(t); setSearchOpen(false); }}
                    suggest={suggestSearch}
                    autoFocus
                  />
                  <button className="search-overlay-cancel" onClick={() => setSearchOpen(false)}>Cancel</button>
                </div>
              </div>
            )}
          </>
        );
      })()}

      {selectedProjectId && <ProjectModal id={selectedProjectId} />}
      {showNew && <NewProjectModal />}
      {showNewGroup && <NewGroupModal />}
    </div>
  );
}
