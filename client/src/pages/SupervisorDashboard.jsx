import { useEffect, useState, useCallback } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import Avatar from '../components/Avatar.jsx';
import BarGraph from '../components/BarGraph.jsx';
import { timeAgo, tierEmoji } from '../utils.js';

const statusDot = { approved: '#10b981', pending: '#f59e0b', rejected: '#ef4444' };

export default function SupervisorDashboard() {
  const { user } = useAuth();
  const { openProject, refreshKey, triggerRefresh } = useUI();
  const confirm = useConfirm();
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    api.get('/supervisor/dashboard').then((r) => setD(r.data));
  }, []);
  useEffect(() => {
    load();
  }, [load, refreshKey]);

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

  if (!d) return <div className="spinner" />;
  const t = d.totals;

  // The full supervised-projects list is already in memory, so both charts'
  // drill-downs can be built client-side with no extra request.
  const asPopItem = (p) => ({ _id: p._id, title: p.title, sub: `${p.set} · ${p.status}` });
  const statusChartData = d.statusBreakdown.map((row) => ({
    ...row,
    projects: d.supervisedProjects.filter((p) => p.status === row.name.toLowerCase()).map(asPopItem),
  }));
  const setChartData = d.bySet.map((row) => ({
    name: row.name,
    value: row.count,
    projects: d.supervisedProjects.filter((p) => p.set === row.name).map(asPopItem),
  }));

  return (
    <>
      <div className="dash-head">
        <div>
          <div className="page-title" style={{ margin: 0 }}>Supervisor Dashboard</div>
          <div className="dash-sub">{d.dept || 'Your department'} · Welcome back, {user.name.split(' ').slice(-1)[0]}</div>
        </div>
      </div>

      <div className="stat-row">
        <Stat label="Supervised Projects" value={t.supervised} amber />
        <Stat label="Awaiting Review" value={t.pending} />
        <Stat label="Students" value={t.students} />
        <Stat label="Engagement" value={t.likes + t.comments} sub={`${t.likes} likes · ${t.comments} comments`} />
      </div>

      {/* Pending approvals — actionable, only shown when there is work */}
      {d.pendingProjects.length > 0 && (
        <div className="section-card" style={{ borderLeft: '3px solid var(--amber)' }}>
          <div className="section-title">⏳ Awaiting Your Review ({d.pendingProjects.length})</div>
          {d.pendingProjects.map((p) => (
            <div className="list-row" key={p._id}>
              <div className="meta" style={{ cursor: 'pointer' }} onClick={() => openProject(p._id)}>
                <div className="title">{p.title}</div>
                <div className="sub">{p.dept} · {p.set} · {p.authors.map((a) => a.name).join(', ')}</div>
              </div>
              <button className="btn btn-success btn-sm" onClick={() => decide(p._id, 'approve')}>✓ Approve</button>
              <button className="btn btn-danger btn-sm" onClick={() => decide(p._id, 'reject')}>✗ Reject</button>
            </div>
          ))}
        </div>
      )}

      <div className="two-col">
        {/* CENTERPIECE: My Students & Projects */}
        <div>
          <div className="section-card">
            <div className="section-title">👩‍🎓 My Students <span className="pill">{d.students.length}</span></div>
            {d.students.length === 0 ? (
              <div className="empty" style={{ padding: '1.5rem' }}>No students in your department yet.</div>
            ) : (
              d.students.map((s) => (
                <div className="list-row" key={s._id}>
                  <Avatar user={s} size={34} />
                  <div className="meta">
                    <div className="title">{s.name}</div>
                    <div className="sub">{s.set || s.dept} · {s.projects.length} project{s.projects.length !== 1 ? 's' : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 180 }}>
                    {s.projects.slice(0, 3).map((pr) => (
                      <span key={pr._id} className="pill" title={pr.title} style={{ cursor: 'pointer' }} onClick={() => openProject(pr._id)}>
                        <span className="dot-status" style={{ background: statusDot[pr.status] }} />
                        {pr.title.length > 14 ? pr.title.slice(0, 14) + '…' : pr.title}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="section-card">
            <div className="section-title">📄 Supervised Projects <span className="pill">{d.supervisedProjects.length}</span></div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Set</th>
                    <th>Status</th>
                    <th>❤</th>
                    <th>★</th>
                    <th>Gold</th>
                  </tr>
                </thead>
                <tbody>
                  {d.supervisedProjects.map((p) => (
                    <tr key={p._id} style={{ cursor: 'pointer' }} onClick={() => openProject(p._id)}>
                      <td style={{ fontWeight: 500 }}>{p.title}</td>
                      <td>{p.set}</td>
                      <td>
                        <span className="dot-status" style={{ background: statusDot[p.status] }} />
                        {p.status}
                      </td>
                      <td>{p.likeCount}</td>
                      <td>{p.avgRating || '—'}</td>
                      <td style={{ color: 'var(--amber)', fontWeight: 600 }}>{p.gold}{tierEmoji(p) && ` ${tierEmoji(p)}`}</td>
                    </tr>
                  ))}
                  {d.supervisedProjects.length === 0 && (
                    <tr><td colSpan={6} style={{ color: 'var(--textmuted)' }}>No projects yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right column: analytics + activity */}
        <div>
          <div className="section-card">
            <div className="section-title">Project Status</div>
            <BarGraph data={statusChartData} xKey="name" series={[{ key: 'value', label: 'Projects' }]} height={190} onOpenProject={openProject} />
          </div>

          <div className="section-card">
            <div className="section-title">Projects by Set</div>
            <BarGraph data={setChartData} xKey="name" series={[{ key: 'value', label: 'Projects' }]} height={190} onOpenProject={openProject} />
          </div>

          <div className="section-card">
            <div className="section-title">Recent Activity</div>
            {d.recentEngagement.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--textmuted)' }}>No recent comments.</div>
            ) : (
              d.recentEngagement.map((c, i) => (
                <div className="list-row" key={i}>
                  <Avatar user={c.user} size={28} />
                  <div className="meta">
                    <div className="sub">
                      <b style={{ color: 'var(--text)' }}>{c.user.name}</b> on{' '}
                      <span style={{ cursor: 'pointer', color: 'var(--blue)' }} onClick={() => openProject(c.projectId)}>
                        {c.projectTitle.length > 24 ? c.projectTitle.slice(0, 24) + '…' : c.projectTitle}
                      </span>
                    </div>
                    <div className="comment-text" style={{ fontSize: 12 }}>“{c.text.slice(0, 60)}{c.text.length > 60 ? '…' : ''}”</div>
                    <div className="sub">{timeAgo(c.createdAt)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Top projects */}
      <div className="section-card">
        <div className="section-title">🏆 Top Projects in {d.dept || 'Department'}</div>
        {d.topProjects.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--textmuted)' }}>No approved projects yet.</div>
        ) : (
          d.topProjects.map((p, i) => (
            <div className="lb-row" key={p._id} onClick={() => openProject(p._id)}>
              <div className={`lb-rank ${i === 0 ? 'rk1' : i === 1 ? 'rk2' : i === 2 ? 'rk3' : 'rkn'}`}>{i + 1}</div>
              <div className="lb-info">
                <div className="lb-title">{p.title} {tierEmoji(p)}</div>
                <div className="lb-dept">{p.set} · ❤ {p.likeCount} · ★ {p.avgRating || '—'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="score-num">{p.gold}</div>
                <div style={{ fontSize: 10, color: 'var(--textmuted)' }}>gold</div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function Stat({ label, value, sub, amber }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-val ${amber ? 'amb' : ''}`}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--textmuted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
