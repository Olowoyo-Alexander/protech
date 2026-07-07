import { useEffect, useState, useRef } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLive } from '../context/SocketContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import Avatar from '../components/Avatar.jsx';
import ColorPicker from '../components/ColorPicker.jsx';
import { ROLE_LABELS, TITLES, LEVELS, recoMeta, tierEmoji, isValidSupervisorTag, SUPERVISOR_TAG_HELP, displayName, avatarHex } from '../utils.js';

// A password input with an inline Show/Hide toggle. Keeps focus on the field
// (onMouseDown preventDefault) so the caret doesn't jump when toggling.
function PasswordField({ value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-field">
      <input type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={onChange} />
      <button
        type="button"
        className="pw-reveal"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

export default function Profile() {
  const { user, updateUser } = useAuth();
  const { toast } = useLive();
  const { departments: DEPTS, sets: SETS } = useSettings();
  const { openProject } = useUI();
  const { theme, toggleTheme } = useTheme();

  const isStudent = user.role === 'student';
  const isSupervisor = user.role === 'supervisor';

  const [form, setForm] = useState({
    name: user.name || '',
    title: user.title || '',
    dept: user.dept || (DEPTS[0] || ''),
    set: user.set || (SETS[0] || ''),
    level: user.level || LEVELS[0],
    bio: user.bio || '',
    avatarColor: user.avatarColor || 'av-amber',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErr, setProfileErr] = useState('');

  // Supervisor tag — its own compact card (separate from the profile form).
  const [tag, setTag] = useState(user.supervisorTag || '');
  const [savingTag, setSavingTag] = useState(false);
  const [tagErr, setTagErr] = useState('');
  const [tagCopied, setTagCopied] = useState(false);
  // The field locks once a tag exists; clicking it (or "Change tag") opens it.
  const [editingTag, setEditingTag] = useState(!user.supervisorTag);
  const tagInputRef = useRef(null);
  // The action button is "Save" only once the value differs from the saved tag.
  const tagAltered = tag.trim() !== (user.supervisorTag || '');

  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [pwErr, setPwErr] = useState('');

  const [stats, setStats] = useState(null);
  const [mine, setMine] = useState([]);
  const [sel, setSel] = useState(null); // which stat card's list is expanded

  useEffect(() => {
    api.get('/users/me/stats').then((r) => setStats(r.data)).catch(() => setStats(null));
    api.get('/projects/mine').then((r) => setMine(r.data)).catch(() => setMine([]));
  }, []);

  // The list of projects + the metric to show for the currently selected card.
  const statViews = {
    projects: { title: 'My Projects', list: mine, metric: (p) => p.status },
    approved: { title: 'Approved Projects', list: mine.filter((p) => p.status === 'approved'), metric: (p) => p.status },
    gold: { title: 'Gold by Project', list: [...mine].sort((a, b) => b.gold - a.gold), metric: (p) => `🥇 ${p.gold}` },
    recognitions: { title: 'Recognised Projects', list: mine.filter((p) => p.recognized), metric: (p) => `${tierEmoji(p)} ${recoMeta(p)?.label || 'Recognition'}` },
    likes: { title: 'Likes by Project', list: [...mine].sort((a, b) => b.likeCount - a.likeCount), metric: (p) => `❤ ${p.likeCount}` },
  };
  const toggle = (key) => setSel((s) => (s === key ? null : key));

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Avatar colour applies live: update the signed-in user immediately so every
  // avatar (topbar, sidebar, feed) reflects it at once, and persist it to the
  // account a beat later (debounced, since the wheel fires on every drag).
  const colorTimer = useRef(null);
  const changeAvatarColor = (hex) => {
    set('avatarColor', hex);
    // Apply everywhere at once — this optimistic value is the source of truth.
    updateUser({ ...user, avatarColor: hex });
    // Persist (debounced). We deliberately DON'T re-apply the server's echoed
    // user here: doing so would clobber the colour just chosen if a later drag
    // has already moved on, causing a visible revert.
    clearTimeout(colorTimer.current);
    colorTimer.current = setTimeout(() => {
      api.put('/users/me', { avatarColor: hex }).catch(() => {});
    }, 400);
  };

  const saveProfile = async () => {
    setProfileErr('');
    if (!form.name.trim()) {
      setProfileErr('Name cannot be empty.');
      return;
    }
    setSavingProfile(true);
    try {
      const payload = { name: form.name, bio: form.bio, avatarColor: form.avatarColor };
      if (isSupervisor) {
        payload.title = form.title;
        payload.dept = form.dept;
      }
      if (isStudent) {
        payload.dept = form.dept;
        payload.set = form.set;
        payload.level = form.level;
      }
      const { data } = await api.put('/users/me', payload);
      updateUser(data.user);
      toast('Profile updated');
    } catch (e) {
      setProfileErr(e.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async () => {
    setPwErr('');
    if (pw.newPassword.length < 6) {
      setPwErr('New password must be at least 6 characters.');
      return;
    }
    if (pw.newPassword !== pw.confirm) {
      setPwErr('New password and confirmation do not match.');
      return;
    }
    setSavingPw(true);
    try {
      await api.put('/users/me/password', {
        currentPassword: pw.currentPassword,
        newPassword: pw.newPassword,
      });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      toast('Password updated');
    } catch (e) {
      setPwErr(e.message);
    } finally {
      setSavingPw(false);
    }
  };

  const saveTag = async () => {
    setTagErr('');
    const t = tag.trim();
    if (!isValidSupervisorTag(t)) {
      setTagErr(SUPERVISOR_TAG_HELP);
      return;
    }
    setSavingTag(true);
    try {
      const { data } = await api.put('/users/me', { supervisorTag: t });
      updateUser(data.user);
      setEditingTag(false);
      toast('Supervisor tag saved');
    } catch (e) {
      setTagErr(e.message);
    } finally {
      setSavingTag(false);
    }
  };

  const copyTag = async () => {
    try {
      await navigator.clipboard.writeText(user.supervisorTag);
      setTagCopied(true);
      setTimeout(() => setTagCopied(false), 1200);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  const startEditingTag = () => {
    setEditingTag(true);
    setTimeout(() => tagInputRef.current?.focus(), 0);
  };

  const memberSince = stats?.memberSince ? new Date(stats.memberSince).toLocaleDateString() : '—';

  return (
    <>
      <div className="page-title">My Profile</div>

      {/* Header card */}
      <div className="card profile-hero">
        <Avatar user={user} size={72} />
        <div className="profile-hero-info">
          <div className="profile-hero-name">
            {displayName(user)}
          </div>
          <div className="profile-hero-meta">
            <span className={`role-badge rb-${user.role}`}>{ROLE_LABELS[user.role]}</span>
            <span>{user.email}</span>
            {isStudent && user.matric && <span>· {user.matric}</span>}
            {user.dept && <span>· {user.dept}</span>}
            {isStudent && user.level && <span>· {user.level}</span>}
          </div>
          {user.bio && <div className="profile-hero-bio">{user.bio}</div>}
          <div className="profile-hero-since">Member since {memberSince}</div>
        </div>
      </div>

      {/* Appearance — theme switch (light / dark). */}
      <div className="card appearance-card">
        <div className="appearance-row">
          <div>
            <div className="section-title" style={{ margin: 0 }}>THEME</div>
          </div>
          <div className="theme-switch" role="group" aria-label="Colour theme">
            <button
              className={`theme-opt ${theme === 'light' ? 'active' : ''}`}
              onClick={() => { if (theme !== 'light') toggleTheme(); }}
              aria-pressed={theme === 'light'}
            >
              Light
            </button>
            <button
              className={`theme-opt ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => { if (theme !== 'dark') toggleTheme(); }}
              aria-pressed={theme === 'dark'}
            >
              Dark
            </button>
          </div>
        </div>
      </div>

      {/* Supervisor tag — compact card, the exclusive handle for tagging & DMs. */}
      {isSupervisor && (
        <div className="card sup-tag-card">
          <div className="sup-tag-row">
            <input
              ref={tagInputRef}
              className="sup-tag-input"
              value={tag}
              onChange={(e) => setTag(e.target.value.replace(/\s/g, ''))}
              onMouseDown={() => setEditingTag(true)}
              onFocus={() => setEditingTag(true)}
              placeholder="Add tag"
              maxLength={24}
              readOnly={!editingTag}
              autoCapitalize="off"
              spellCheck={false}
            />
            {user.supervisorTag && (
              <button className="btn btn-ghost btn-sm" onClick={copyTag} title="Copy tag" aria-label="Copy tag">
                {tagCopied ? '✓ Copied' : '⧉ Copy'}
              </button>
            )}
            {tagAltered ? (
              <button className="btn btn-primary btn-sm" disabled={savingTag} onClick={saveTag}>
                {savingTag ? 'Saving…' : 'Save'}
              </button>
            ) : (
              <button className="btn btn-outline btn-sm" onClick={startEditingTag}>
                Change tag
              </button>
            )}
          </div>
          {tagErr && <div className="auth-error">{tagErr}</div>}
        </div>
      )}

      {/* Activity stats — author-centric, so only for students & supervisors
          (not admins or guests). Each card expands a list below. */}
      {stats && (user.role === 'student' || user.role === 'supervisor') && (
        <>
          <div className="stats-grid">
            <div className={`stat-card stat-clickable ${sel === 'projects' ? 'sel' : ''}`} onClick={() => toggle('projects')}>
              <div className="stat-label">My Projects</div><div className="stat-val amb">{stats.projects}</div>
            </div>
            <div className={`stat-card stat-clickable ${sel === 'approved' ? 'sel' : ''}`} onClick={() => toggle('approved')}>
              <div className="stat-label">Approved</div><div className="stat-val">{stats.approved}</div>
            </div>
            <div className={`stat-card stat-clickable ${sel === 'gold' ? 'sel' : ''}`} onClick={() => toggle('gold')}>
              <div className="stat-label">🥇 Gold</div><div className="stat-val">{stats.gold}</div>
            </div>
            <div className={`stat-card stat-clickable ${sel === 'recognitions' ? 'sel' : ''}`} onClick={() => toggle('recognitions')}>
              <div className="stat-label">🏅 Recognitions</div><div className="stat-val">{stats.recognitions}</div>
            </div>
            {isSupervisor ? (
              <>
                <div className="stat-card"><div className="stat-label">Supervised</div><div className="stat-val">{stats.supervised ?? 0}</div></div>
                <div className="stat-card"><div className="stat-label">Approved by me</div><div className="stat-val">{stats.approvedByMe ?? 0}</div></div>
              </>
            ) : (
              <div className={`stat-card stat-clickable ${sel === 'likes' ? 'sel' : ''}`} onClick={() => toggle('likes')}>
                <div className="stat-label">❤ Likes</div><div className="stat-val">{stats.likes}</div>
              </div>
            )}
          </div>

          {sel && statViews[sel] && (
            <div className="card stat-detail">
              <div className="section-title">{statViews[sel].title} ({statViews[sel].list.length})</div>
              {statViews[sel].list.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--textmuted)' }}>Nothing to show here yet.</div>
              ) : (
                statViews[sel].list.map((p) => (
                  <div className="lb-row" key={p._id} onClick={() => openProject(p._id)}>
                    <div className="lb-info">
                      <div className="lb-title">{p.title} {tierEmoji(p)}</div>
                      <div className="lb-dept">{p.dept} · {p.set}</div>
                    </div>
                    <span className={`tag tag-${p.status}`} style={{ marginRight: 8 }}>{p.status}</span>
                    <div style={{ textAlign: 'right', minWidth: 70 }}>
                      <div className="score-num">{statViews[sel].metric(p)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      <div className="profile-cols">
        {/* Edit profile */}
        <div className="card profile-card">
          <div className="section-title">Edit Profile</div>

          <div className="fg">
            <label>Avatar colour</label>
            <div className="color-row">
              <ColorPicker value={avatarHex(form.avatarColor)} onChange={changeAvatarColor} />
            </div>
          </div>

          {isSupervisor && (
            <div className="form-row">
              <div className="fg">
                <label>Title</label>
                <select value={form.title} onChange={(e) => set('title', e.target.value)}>
                  <option value="">— None —</option>
                  {TITLES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="fg">
                <label>Department</label>
                <select value={form.dept} onChange={(e) => set('dept', e.target.value)}>
                  {DEPTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="fg">
            <label>Full Name</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>

          <div className="fg">
            <label>Email</label>
            <input value={user.email} disabled style={{ opacity: 0.6 }} />
          </div>

          {isStudent && (
            <>
              <div className="form-row">
                <div className="fg">
                  <label>Department</label>
                  <select value={form.dept} onChange={(e) => set('dept', e.target.value)}>
                    {DEPTS.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label>Academic Set</label>
                  <select value={form.set} onChange={(e) => set('set', e.target.value)}>
                    {SETS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="fg">
                <label>Academic Level</label>
                <select value={form.level} onChange={(e) => set('level', e.target.value)}>
                  {LEVELS.map((l) => <option key={l}>{l}</option>)}
                </select>
              </div>
            </>
          )}

          <div className="fg">
            <label>About / Bio</label>
            <textarea
              value={form.bio}
              maxLength={280}
              placeholder="A short headline or bio (max 280 characters)..."
              onChange={(e) => set('bio', e.target.value)}
            />
            <div className="field-help">{form.bio.length}/280</div>
          </div>

          {profileErr && <div className="auth-error">{profileErr}</div>}
          <button className="btn btn-primary" disabled={savingProfile} onClick={saveProfile}>
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

        {/* Change password */}
        <div className="card profile-card">
          <div className="section-title">Change Password</div>
          <div className="fg">
            <label>Current Password</label>
            <PasswordField autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </div>
          <div className="fg">
            <label>New Password</label>
            <PasswordField autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
            <div className="field-help">At least 6 characters</div>
          </div>
          <div className="fg">
            <label>Confirm New Password</label>
            <PasswordField autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </div>
          {pwErr && <div className="auth-error">{pwErr}</div>}
          <button className="btn btn-primary" disabled={savingPw} onClick={savePassword}>
            {savingPw ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>
    </>
  );
}
