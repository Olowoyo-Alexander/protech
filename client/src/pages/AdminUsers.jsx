import { useEffect, useState, useCallback, Fragment } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import Avatar from '../components/Avatar.jsx';
import SearchBox from '../components/SearchBox.jsx';
import { ROLE_LABELS, timeAgo, displayName, ROLE_GATEWAYS } from '../utils.js';

const ROLES = ['observer', 'student', 'supervisor', 'admin'];

// The sign-in / register links for one role, rendered once revealed.
function PortalLinkRows({ gw, origin }) {
  return (
    <div className="portal-card-links">
      <Copyable prefix="Sign in: " value={`${origin}/${gw.slug}`} />
      <Copyable prefix="Register: " value={`${origin}/${gw.slug}?tab=register`} />
    </div>
  );
}

// A non-admin portal card: links stay hidden until the header is clicked.
function PortalCard({ gw, origin }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`portal-card ${open ? 'open' : ''}`}>
      <button className="portal-card-hd" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="portal-ic">{gw.icon}</span> {gw.label}
        <span className="portal-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && <PortalLinkRows gw={gw} origin={origin} />}
    </div>
  );
}

// The admin portal card: stays collapsed until clicked, then shows a password
// field. The links reveal themselves automatically once the correct admin
// password is entered (verified via a debounced login round-trip) — no button.
function AdminPortalCard({ gw, origin, adminEmail }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [wrong, setWrong] = useState(false);

  // Re-verify shortly after each keystroke; unlock the moment it matches.
  useEffect(() => {
    if (unlocked || !pw) {
      setChecking(false);
      setWrong(false);
      return;
    }
    setChecking(true);
    setWrong(false);
    const t = setTimeout(async () => {
      try {
        await api.post('/auth/login', { email: adminEmail, password: pw, expectedRole: 'admin' });
        setUnlocked(true);
      } catch {
        setWrong(true);
      } finally {
        setChecking(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [pw, unlocked, adminEmail]);

  const revealed = unlocked;
  return (
    <div className={`portal-card ${revealed ? 'open' : ''}`}>
      <button className="portal-card-hd" onClick={() => setOpen((o) => !o)} aria-expanded={open || revealed}>
        <span className="portal-ic">{gw.icon}</span> {gw.label}
        <span className="portal-caret" aria-hidden="true">{revealed ? '🔓' : open ? '▾' : '🔒'}</span>
      </button>
      {revealed ? (
        <PortalLinkRows gw={gw} origin={origin} />
      ) : open ? (
        <div className="portal-lock">
          <input
            type="password"
            autoComplete="off"
            autoFocus
            placeholder="Enter your admin password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          {checking ? (
            <div className="field-help" style={{ marginTop: 0 }}>Checking…</div>
          ) : wrong ? (
            <div className="auth-error" style={{ marginTop: 0 }}>Incorrect password</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// The dedicated sign-in / registration URLs for each account type. Every card
// hides its links until clicked; the admin card additionally requires the
// signed-in admin's password.
function PortalLinks({ adminEmail }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <div className="section-card portal-links">
      <div className="section-title">Portal links</div>
      <div className="portal-grid">
        {Object.values(ROLE_GATEWAYS).map((gw) =>
          gw.role === 'admin' ? (
            <AdminPortalCard key={gw.slug} gw={gw} origin={origin} adminEmail={adminEmail} />
          ) : (
            <PortalCard key={gw.slug} gw={gw} origin={origin} />
          )
        )}
      </div>
    </div>
  );
}

// Inline editor for a student's matric number (admin-only). Prefilled with the
// current value; Save is enabled only once it's been changed.
function MatricEdit({ user, onSave }) {
  const [val, setVal] = useState(user.matric || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const dirty = val.trim().toUpperCase() !== (user.matric || '').toUpperCase();
  const copy = async (e) => {
    e.stopPropagation();
    if (!val.trim()) return;
    try {
      await navigator.clipboard.writeText(val.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };
  const save = async () => {
    const matric = val.trim().toUpperCase();
    if (!matric || saving) return;
    setSaving(true);
    setSaved(false);
    setErr('');
    try {
      await onSave(matric);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="copy-line" style={{ flexWrap: 'wrap' }}>
      <span className="copy-text" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        Matric:
        <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <input
            value={val}
            onChange={(e) => setVal(e.target.value.toUpperCase())}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="e.g. ETC/22/001"
            style={{ padding: '4px 30px 4px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, width: 160 }}
          />
          <button
            type="button"
            onClick={copy}
            disabled={!val.trim()}
            title="Copy matric"
            aria-label="Copy matric"
            style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: copied ? 'var(--green)' : 'var(--textmuted)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 2 }}
          >
            {copied ? '✓' : '⧉'}
          </button>
        </span>
      </span>
      {dirty && (
        <button className="copy-btn" disabled={saving} onClick={save} title="Save matric" aria-label="Save matric">
          {saving ? '…' : saved ? '✓' : 'Save'}
        </button>
      )}
      {err && <span className="auth-error" style={{ margin: 0, flexBasis: '100%' }}>{err}</span>}
    </div>
  );
}

// A detail line (email / matric / tag) with a one-click copy-to-clipboard button.
function Copyable({ prefix = '', value }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };
  return (
    <div className="copy-line">
      <span className="copy-text">{prefix}{value}</span>
      <button className="copy-btn" onClick={copy} title="Copy" aria-label={`Copy ${prefix || value}`}>
        {copied ? '✓' : '⧉'}
      </button>
    </div>
  );
}

export default function AdminUsers() {
  const { user: me } = useAuth();
  const confirm = useConfirm();
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null); // row whose sensitive details are revealed
  const [resetResult, setResetResult] = useState(null); // { id, password, show } — last reset

  // Reveal/hide a row's sensitive panel. Switching rows clears any shown temp
  // password so it never lingers on screen for the wrong account.
  const toggleManage = (id) => {
    setOpenId((cur) => (cur === id ? null : id));
    setResetResult(null);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/users', { params: { q, role } });
      setUsers(data);
    } finally {
      setLoading(false);
    }
  }, [q, role]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce search
    return () => clearTimeout(t);
  }, [load]);

  const patch = async (fn) => {
    setError('');
    try {
      await fn();
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  // Smart autocomplete: suggest matching accounts by name/email/matric.
  // Picking one fills the box (which drives the filtered table below).
  const suggestUsers = useCallback(
    async (term) => {
      const { data } = await api.get('/admin/users', { params: { q: term, role } });
      return data.slice(0, 8).map((u) => ({
        key: u._id,
        label: u.name,
        sub: [u.email, u.role === 'student' ? u.matric : ''].filter(Boolean).join(' · '),
        icon: '👤',
        onPick: () => setQ(u.name),
      }));
    },
    [role]
  );

  const changeRole = (id, newRole) => patch(() => api.patch(`/admin/users/${id}/role`, { role: newRole }));
  // Save a student's edited matric number, then refresh the table. Throws on
  // failure so the inline editor can surface the error next to the field.
  const saveMatric = async (id, matric) => {
    await api.patch(`/admin/users/${id}/matric`, { matric });
    load();
  };
  const verify = (id) => patch(() => api.patch(`/admin/users/${id}/verify`));
  const toggleActive = async (id, active, name) => {
    if (!active && !(await confirm({
      title: 'Disable account?',
      message: `${name || 'This account'} will not be able to sign in until reactivated.`,
      confirmText: 'Disable',
      danger: true,
    }))) return;
    patch(() => api.patch(`/admin/users/${id}/active`, { active }));
  };
  const del = async (id, name) => {
    if (!(await confirm({
      title: 'Delete account?',
      message: `${name} will be permanently removed. This cannot be undone.`,
      confirmText: 'Delete',
      danger: true,
    }))) return;
    patch(() => api.delete(`/admin/users/${id}`));
  };

  // Passwords are stored hashed and can't be shown, so "viewing" a password means
  // resetting it to a new temporary one the admin can copy and share.
  const resetPw = async (u) => {
    const ok = await confirm({
      title: 'Reset password?',
      message: `${u.name}'s password will be replaced with a new temporary one they must use to sign in. The current password can't be recovered.`,
      confirmText: 'Reset password',
      danger: true,
    });
    if (!ok) return;
    setError('');
    try {
      const { data } = await api.patch(`/admin/users/${u._id}/password`);
      setResetResult({ id: u._id, password: data.password, show: true });
    } catch (e) {
      setError(e.message);
    }
  };

  const copyText = (text) => navigator.clipboard?.writeText(text).catch(() => {});

  return (
    <>
      <div className="dash-head">
        <div className="page-title" style={{ margin: 0 }}>👥 User Management</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <SearchBox
            wrapClassName="admin-search"
            className="admin-search-input"
            placeholder="Search name / email / matric..."
            value={q}
            onChange={setQ}
            onClear={() => setQ('')}
            suggest={suggestUsers}
          />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="mini-select">
            <option value="All">All Roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>
      </div>

      <PortalLinks adminEmail={me.email} />

      {error && <div className="auth-error" style={{ marginBottom: 8 }}>{error}</div>}

      <div className="section-card">
        {loading ? (
          <div className="spinner" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Department / Set</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Projects</th>
                  <th>Joined</th>
                  <th aria-label="Expand row"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u._id === me._id;
                  const open = openId === u._id;
                  const reset = resetResult && resetResult.id === u._id ? resetResult : null;
                  return (
                    <Fragment key={u._id}>
                      <tr
                        className={`admin-row ${open ? 'admin-row-open' : ''}`}
                        onClick={() => toggleManage(u._id)}
                        aria-expanded={open}
                        title={open ? 'Click to collapse' : 'Click to view details'}
                      >
                        <td>
                          <div className="cell-user">
                            <Avatar user={u} size={30} />
                            <div>
                              <div style={{ fontWeight: 500 }}>{displayName(u)}{isSelf && <span className="pill" style={{ marginLeft: 6 }}>you</span>}</div>
                              <div className="cell-user-role">{ROLE_LABELS[u.role]}</div>
                            </div>
                          </div>
                        </td>
                        <td>{u.dept || '—'}{u.set ? ` · ${u.set}` : ''}</td>
                        <td>
                          {u.role === 'student' && u.level && (
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--textmuted)', marginBottom: 3 }}>{u.level}</div>
                          )}
                          <span className={`role-badge rb-${u.role}`}>{ROLE_LABELS[u.role]}</span>
                        </td>
                        <td>
                          {u.verified ? (
                            <span style={{ color: 'var(--green)' }}>● {u.active ? 'Active' : 'Inactive'}</span>
                          ) : (
                            <span style={{ color: 'var(--amber)' }}>● Unverified</span>
                          )}
                        </td>
                        <td>{u.projectCount}</td>
                        <td style={{ fontSize: 11, color: 'var(--textmuted)' }}>{timeAgo(u.createdAt)}</td>
                        <td className="admin-caret" aria-hidden="true">{open ? '▾' : '▸'}</td>
                      </tr>

                      {open && (
                        <tr className="admin-detail-row">
                          <td colSpan={7}>
                            <div className="admin-detail">
                              <div className="admin-detail-sec">
                                <div className="admin-detail-h">Contact &amp; identifiers</div>
                                <Copyable prefix="Email: " value={u.email} />
                                {u.role === 'student' && (
                                  <MatricEdit user={u} onSave={(matric) => saveMatric(u._id, matric)} />
                                )}
                                {u.role === 'supervisor' && (
                                  u.supervisorTag
                                    ? <Copyable prefix="Tag: " value={u.supervisorTag} />
                                    : <div className="copy-line"><span className="copy-text" style={{ fontStyle: 'italic' }}>No tag</span></div>
                                )}
                              </div>

                              <div className="admin-detail-sec">
                                <div className="admin-detail-h">Password</div>
                                {reset ? (
                                  <div className="temp-pw">
                                    <span className="temp-pw-label">New temporary password</span>
                                    <div className="temp-pw-row">
                                      <code className="temp-pw-val">{reset.show ? reset.password : '•'.repeat(reset.password.length)}</code>
                                      <button className="pw-reveal" onClick={() => setResetResult((r) => ({ ...r, show: !r.show }))}>
                                        {reset.show ? 'Hide' : 'Show'}
                                      </button>
                                      <button className="copy-btn" onClick={() => copyText(reset.password)} title="Copy password" aria-label="Copy password">⧉</button>
                                    </div>
                                    <div className="field-help">Share this with {u.name}. They can change it later from their profile.</div>
                                  </div>
                                ) : isSelf ? (
                                  <div className="field-help">Use your own profile to change your password.</div>
                                ) : (
                                  <>
                                    <div className="field-help" style={{ marginTop: 0 }}>
                                      Passwords are stored hashed and can’t be shown. Reset to a new temporary one to share.
                                    </div>
                                    <button className="btn btn-outline btn-sm" onClick={() => resetPw(u)}>Reset password</button>
                                  </>
                                )}
                              </div>

                              {!isSelf && (
                                <div className="admin-detail-sec">
                                  <div className="admin-detail-h">Role</div>
                                  <select className="mini-select" value={u.role} onChange={(e) => changeRole(u._id, e.target.value)}>
                                    {ROLES.map((r) => (
                                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              <div className="admin-detail-sec">
                                <div className="admin-detail-actions">
                                  {!u.verified && (
                                    <button className="btn btn-success btn-sm" onClick={() => verify(u._id)}>Verify</button>
                                  )}
                                  {!isSelf ? (
                                    <>
                                      <button className="btn btn-outline btn-sm" onClick={() => toggleActive(u._id, !u.active, u.name)}>
                                        {u.active ? 'Deactivate' : 'Activate'}
                                      </button>
                                      <button className="btn btn-danger btn-sm" onClick={() => del(u._id, u.name)}>Delete</button>
                                    </>
                                  ) : (
                                    <span className="field-help">You can’t deactivate or delete your own account.</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {users.length === 0 && (
                  <tr><td colSpan={7} style={{ color: 'var(--textmuted)' }}>No users match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
