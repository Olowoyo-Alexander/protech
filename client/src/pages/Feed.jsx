import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import ProjectCard from '../components/ProjectCard.jsx';
import SnippetCard from '../components/SnippetCard.jsx';
import AnnouncementCard from '../components/AnnouncementCard.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { recoMeta } from '../utils.js';

export default function Feed() {
  const { user } = useAuth();
  const { refreshKey, openProject } = useUI();
  const { departments: DEPTS, sets: SETS } = useSettings();
  const confirm = useConfirm();
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const isAdmin = user.role === 'admin';

  const [projects, setProjects] = useState([]);
  const [snippets, setSnippets] = useState([]);
  const [news, setNews] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [annText, setAnnText] = useState('');
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('school'); // school | dept
  const [dept, setDept] = useState('All');
  const [set, setSet] = useState('All');
  const [sort, setSort] = useState('recent');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/projects', {
        params: { q, dept, set, sort, scope: scope === 'dept' ? 'dept' : undefined },
      });
      setProjects(data);
    } finally {
      setLoading(false);
    }
  }, [q, dept, set, sort, scope]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Recognition news: projects that recently earned the badge.
  useEffect(() => {
    api.get('/projects/news').then((r) => setNews(r.data)).catch(() => setNews([]));
  }, [refreshKey]);

  // Platform announcements — pinned at the top of the feed for everyone.
  useEffect(() => {
    api.get('/announcements').then((r) => setAnnouncements(r.data)).catch(() => setAnnouncements([]));
  }, [refreshKey]);

  const postAnnouncement = async () => {
    const text = annText.trim();
    if (!text) return;
    setPosting(true);
    try {
      const { data } = await api.post('/announcements', { text });
      setAnnouncements((a) => [data, ...a]);
      setAnnText('');
    } catch (e) {
      alert(e.message);
    } finally {
      setPosting(false);
    }
  };

  const removeAnnouncement = async (id) => {
    const ok = await confirm({
      title: 'Remove announcement?',
      message: 'This removes it from the feed for everyone.',
      confirmText: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/announcements/${id}`);
      setAnnouncements((a) => a.filter((x) => x._id !== id));
    } catch (e) {
      alert(e.message);
    }
  };

  // Group snippets — public posts shown interleaved on the main feed. Hidden
  // while searching (search targets projects).
  useEffect(() => {
    if (q) { setSnippets([]); return; }
    api.get('/snippets').then((r) => setSnippets(r.data)).catch(() => setSnippets([]));
  }, [refreshKey, q]);

  const updateOne = (updated) => setProjects((ps) => ps.map((p) => (p._id === updated._id ? updated : p)));
  const updateSnippet = (updated) => setSnippets((ss) => ss.map((s) => (s._id === updated._id ? updated : s)));
  const removeSnippet = (id) => setSnippets((ss) => ss.filter((s) => s._id !== id));

  // Merge snippets into the project list. On the default "Newest" view they
  // interleave by recency; otherwise (Top/Most-liked) snippets — which have no
  // gold/likes — are pinned above the ranked projects. Search hides snippets.
  const projItems = projects.map((p) => ({ ...p, kind: 'project' }));
  const feedItems =
    sort === 'recent'
      ? [...projItems, ...snippets].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      : [...snippets, ...projItems];

  const stats = {
    total: projects.length,
    approved: projects.filter((p) => p.status === 'approved').length,
    depts: new Set(projects.map((p) => p.dept)).size,
  };

  return (
    <>
      {/* Mobile: a glass "home" panel (like the reference) wraps the stat strip,
          headed by the user's name and their department as a location-pin chip.
          On desktop this wrapper collapses (display:contents) and the header hides. */}
      <div className="home-panel">
        <div className="home-panel-hd">
          <div className="hp-name">{user.name.split(' ')[0]}’s Space</div>
          {user.dept && (
            <span className="hp-loc">{user.dept}</span>
          )}
        </div>
        <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Projects Shown</div>
          <div className="stat-val amb">{stats.total}</div>
        </div>
        {/* Students don't need the approved-count card on their feed. */}
        {user.role !== 'student' && (
          <div className="stat-card">
            <div className="stat-label">Approved</div>
            <div className="stat-val">{stats.approved}</div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-label">Departments</div>
          <div className="stat-val">{stats.depts}</div>
        </div>
        {/* Students see their academic level; everyone else (supervisors,
            admins, guests) gets no extra card here. */}
        {user.role === 'student' && (
          <div className="stat-card">
            <div className="stat-label">Academic Level</div>
            <div className="stat-val" style={{ fontSize: 16 }}>{user.level || '—'}</div>
          </div>
        )}
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${scope === 'school' ? 'active' : ''}`} onClick={() => setScope('school')}>
          🏫 All Projects
        </button>
        {/* Guests and admins have no department, so the "My Dept" scope tab is hidden for them. */}
        {user.role !== 'observer' && user.role !== 'admin' && (
          <button className={`tab ${scope === 'dept' ? 'active' : ''}`} onClick={() => setScope('dept')}>
            🎓 {user.dept || 'My Dept'}
          </button>
        )}
      </div>

      {q && <div style={{ marginBottom: '.75rem', fontSize: 13, color: 'var(--textmuted)' }}>Search results for “{q}”</div>}

      {/* Admin announcement composer — publishes straight to everyone's feed. */}
      {!q && isAdmin && (
        <div className="card announcement-composer">
          <div className="section-title">📢 Post an announcement</div>
          <textarea
            value={annText}
            maxLength={1000}
            placeholder="Share an update with everyone on PROTECH…"
            onChange={(e) => setAnnText(e.target.value)}
          />
          <div className="announcement-composer-foot">
            <span className="field-help">{annText.length}/1000</span>
            <button className="btn btn-primary btn-sm" disabled={posting || !annText.trim()} onClick={postAnnouncement}>
              {posting ? 'Posting…' : 'Publish'}
            </button>
          </div>
        </div>
      )}

      {/* Announcements are pinned above the feed (hidden while searching). */}
      {!q && announcements.map((a) => (
        <AnnouncementCard
          key={a._id}
          announcement={a}
          onDelete={isAdmin ? removeAnnouncement : undefined}
        />
      ))}

      <div style={{ display: 'flex', gap: 8, marginBottom: '.875rem', flexWrap: 'wrap' }}>
        {/* Departments collapsed into a single filter (was a long chip row). */}
        {scope === 'school' && (
          <select value={dept} onChange={(e) => setDept(e.target.value)} style={selStyle}>
            <option value="All">All Departments</option>
            {DEPTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        )}
        <select value={set} onChange={(e) => setSet(e.target.value)} style={selStyle}>
          <option value="All">All Sets</option>
          {SETS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={selStyle}>
          <option value="recent">Newest</option>
          <option value="top">Top Gold</option>
          <option value="liked">Most Liked</option>
        </select>
      </div>

      {!q && news.length > 0 && (
        <div className="reco-feature">
          <div className="reco-feature-hd">
            <span className="reco-feature-trophy">🏆</span>
            <div className="reco-feature-titles">
              <div className="reco-feature-title">Recognition News</div>
              <div className="reco-feature-sub">Latest projects to earn a recognition tier</div>
            </div>
            <span className="reco-feature-ribbon">🏅</span>
          </div>
          <div className="reco-feature-list">
            {news.map((n) => {
              const meta = recoMeta(n);
              return (
                <div className={`reco-feature-item ${meta ? `tier-${meta.key}` : ''}`} key={n._id} onClick={() => openProject(n._id)}>
                  <span className="reco-feature-medal">{meta?.emoji || '🏅'}</span>
                  <span className="reco-feature-text">
                    <b>{n.title}</b>
                    {n.authors?.length ? <span className="reco-feature-by"> by {n.authors.map((a) => a.name).join(', ')}</span> : ''}
                  </span>
                  <span className="reco-feature-gold">{meta?.label || 'Recognition'} · {n.gold}★</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="spinner" />
      ) : feedItems.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📂</div>
          <div>No projects found{q ? ` for “${q}”` : ''}.</div>
        </div>
      ) : (
        feedItems.map((it) =>
          it.kind === 'snippet' ? (
            <SnippetCard key={`s-${it._id}`} snippet={it} onUpdate={updateSnippet} onDelete={removeSnippet} />
          ) : (
            <ProjectCard key={it._id} project={it} onChange={updateOne} />
          )
        )
      )}
    </>
  );
}

const selStyle = {
  padding: '7px 10px',
  background: 'var(--white)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  fontSize: 12,
};
