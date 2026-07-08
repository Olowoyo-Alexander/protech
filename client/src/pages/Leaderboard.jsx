import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useUI } from '../context/UIContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { tierEmoji } from '../utils.js';

export default function Leaderboard() {
  const { openProject, refreshKey } = useUI();
  const { departments: DEPTS } = useSettings();
  const [projects, setProjects] = useState([]);
  const [dept, setDept] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get('/projects', { params: { status: 'approved', sort: 'top', dept } })
      .then((r) => setProjects(r.data))
      .finally(() => setLoading(false));
  }, [dept, refreshKey]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '.875rem', flexWrap: 'wrap' }}>
        <div className="page-title" style={{ margin: 0 }}>🏆 Leaderboard</div>
        <div className="filter-chips" style={{ margin: 0 }}>
          {['All', ...DEPTS].map((d) => (
            <span key={d} className={`chip ${dept === d ? 'active' : ''}`} onClick={() => setDept(d)}>
              {d}
            </span>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: '.75rem' }}>
        {loading ? (
          <div className="spinner" />
        ) : projects.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🏆</div>
            <div>No approved projects yet.</div>
          </div>
        ) : (
          projects.map((p, i) => {
            const rk = i === 0 ? 'rk1' : i === 1 ? 'rk2' : i === 2 ? 'rk3' : 'rkn';
            return (
              <div className="lb-row" key={p._id} onClick={() => openProject(p._id)}>
                <div className={`lb-rank ${rk}`}>{i + 1}</div>
                <div className="lb-info">
                  <div className="lb-title">{p.title} {tierEmoji(p)}</div>
                  <div className="lb-dept">
                    {p.dept} · {p.set} · ❤ {p.likeCount} · ★ {p.avgRating || '—'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="score-num">{p.gold}</div>
                  <div style={{ fontSize: 10, color: 'var(--textmuted)' }}>{p.gold === 1 ? 'star' : 'stars'}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
