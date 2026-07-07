import { useEffect, useState, useCallback } from 'react';
import api from '../api/client.js';
import { useUI } from '../context/UIContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import Avatar from '../components/Avatar.jsx';
import { timeAgo } from '../utils.js';

export default function AdminModeration() {
  const { openProject, refreshKey, triggerRefresh } = useUI();
  const confirm = useConfirm();
  const [projects, setProjects] = useState([]);
  const [status, setStatus] = useState('All');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // /pending returns ALL projects for supervisors/admins
      const { data } = await api.get('/projects/pending');
      setProjects(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Approval/rejection is a supervisor-only decision. Admins moderate by
  // removing content — they cannot accept or reject projects from here.
  const del = async (id, title) => {
    if (!(await confirm({
      title: 'Delete project?',
      message: `"${title}" will be permanently removed. This cannot be undone.`,
      confirmText: 'Delete',
      danger: true,
    }))) return;
    await api.delete(`/projects/${id}`);
    triggerRefresh();
  };

  const filtered = status === 'All' ? projects : projects.filter((p) => p.status === status);
  const counts = {
    All: projects.length,
    pending: projects.filter((p) => p.status === 'pending').length,
    approved: projects.filter((p) => p.status === 'approved').length,
    rejected: projects.filter((p) => p.status === 'rejected').length,
  };

  return (
    <>
      <div className="dash-head">
        <div className="page-title" style={{ margin: 0 }}>🛡 Content Moderation</div>
      </div>

      <div className="filter-chips">
        {['All', 'pending', 'approved', 'rejected'].map((s) => (
          <span key={s} className={`chip ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>
            {s === 'All' ? 'All' : s[0].toUpperCase() + s.slice(1)} ({counts[s]})
          </span>
        ))}
      </div>

      <div className="section-card">
        {loading ? (
          <div className="spinner" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Dept / Set</th>
                  <th>Authors</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p._id}>
                    <td style={{ fontWeight: 500, cursor: 'pointer' }} onClick={() => openProject(p._id)}>{p.title}</td>
                    <td>{p.dept} · {p.set}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {p.authors?.map((a) => <Avatar key={a._id} user={a} size={22} />)}
                      </div>
                    </td>
                    <td><span className={`tag tag-${p.status}`}>{p.status}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--textmuted)' }}>{timeAgo(p.createdAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button className="btn btn-danger btn-sm" onClick={() => del(p._id, p.title)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} style={{ color: 'var(--textmuted)' }}>No projects.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
