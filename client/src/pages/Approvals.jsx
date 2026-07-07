import { useEffect, useState, useCallback } from 'react';
import api from '../api/client.js';
import { useUI } from '../context/UIContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Approvals() {
  const { openProject, refreshKey, triggerRefresh } = useUI();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [projects, setProjects] = useState([]);
  const [tab, setTab] = useState('pending');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/projects/pending')
      .then((r) => setProjects(r.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const pending = projects.filter((p) => p.status === 'pending');
  // The Reviewed tab shows only the projects this supervisor personally reviewed
  // (approved or rejected) — not every non-pending project in the system.
  const reviewed = projects.filter(
    (p) => p.status !== 'pending' && String(p.reviewedBy) === String(user._id)
  );
  const list = tab === 'pending' ? pending : reviewed;

  const decide = async (id, action) => {
    let body = {};
    if (action === 'reject') {
      const reason = await confirm({
        title: 'Reject this project?',
        message: 'The authors will be notified. Add a reason below (optional).',
        prompt: true,
        placeholder: 'Reason for rejection (optional)',
        confirmText: 'Reject',
        danger: true,
      });
      if (reason === null) return;
      body = { reason };
    }
    await api.patch(`/projects/${id}/${action}`, body);
    triggerRefresh();
  };

  return (
    <>
      <div className="page-title">✓ Approval Queue</div>
      <div className="tabs">
        <button className={`tab ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')}>
          Pending ({pending.length})
        </button>
        <button className={`tab ${tab === 'reviewed' ? 'active' : ''}`} onClick={() => setTab('reviewed')}>
          Reviewed ({reviewed.length})
        </button>
      </div>

      {loading ? (
        <div className="spinner" />
      ) : list.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📋</div>
          <div>Nothing here.</div>
        </div>
      ) : (
        list.map((p) => (
          <div className="card approval-card" key={p._id} style={{ cursor: 'pointer' }} onClick={() => openProject(p._id)}>
            <div className="proj-meta">
              <span className="tag tag-dept">{p.dept}</span>
              <span className={`tag tag-${p.status}`}>{p.status}</span>
              <span className="tag tag-set">{p.set}</span>
            </div>
            <div className="proj-title">{p.title}</div>
            <div className="prose" style={{ margin: '.5rem 0' }}>{p.summary}</div>
            <div style={{ fontSize: 12, color: 'var(--textmuted)', marginBottom: '.75rem' }}>
              Authors: {p.authors?.map((a) => a.name).join(', ')}
            </div>
            {p.status === 'pending' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-success btn-sm" onClick={(e) => { e.stopPropagation(); decide(p._id, 'approve'); }}>
                  ✓ Approve
                </button>
                <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); decide(p._id, 'reject'); }}>
                  ✗ Reject
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </>
  );
}
