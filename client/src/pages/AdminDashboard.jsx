import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useUI } from '../context/UIContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import Avatar from '../components/Avatar.jsx';
import BarGraph from '../components/BarGraph.jsx';
import { ROLE_LABELS, timeAgo } from '../utils.js';

export default function AdminDashboard() {
  const { openProject, refreshKey } = useUI();
  const { deptAbbr } = useSettings();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [sel, setSel] = useState(null);      // which stat card is expanded
  const [users, setUsers] = useState(null);  // lazy-loaded full lists (null = not yet loaded)
  const [projects, setProjects] = useState(null);
  const [groups, setGroups] = useState(null);

  useEffect(() => {
    api.get('/admin/overview').then((r) => setD(r.data));
  }, [refreshKey]);

  // Each clickable stat maps to a list (users or projects) with a filter.
  const CFG = {
    totalUsers: { kind: 'users', title: 'All Users', filter: () => true },
    students: { kind: 'users', title: 'Students', filter: (u) => u.role === 'student' },
    supervisors: { kind: 'users', title: 'Supervisors', filter: (u) => u.role === 'supervisor' },
    observers: { kind: 'users', title: 'Guests', filter: (u) => u.role === 'observer' },
    admins: { kind: 'users', title: 'Admins', filter: (u) => u.role === 'admin' },
    totalProjects: { kind: 'projects', title: 'All Projects', filter: () => true },
    pending: { kind: 'projects', title: 'Pending Review', filter: (p) => p.status === 'pending' },
    approved: { kind: 'projects', title: 'Approved Projects', filter: (p) => p.status === 'approved' },
    groups: { kind: 'groups', title: 'Groups', filter: () => true },
  };

  const toggle = async (key) => {
    const next = sel === key ? null : key;
    setSel(next);
    if (!next) return;
    if (CFG[next].kind === 'users' && users === null) {
      const { data } = await api.get('/admin/users');
      setUsers(data);
    }
    if (CFG[next].kind === 'projects' && projects === null) {
      const { data } = await api.get('/projects/pending');
      setProjects(data);
    }
    if (CFG[next].kind === 'groups' && groups === null) {
      const { data } = await api.get('/admin/groups');
      setGroups(data);
    }
  };

  if (!d) return <div className="spinner" />;
  const t = d.totals;

  return (
    <>
      <div className="dash-head">
        <div>
          <div className="page-title" style={{ margin: 0 }}>Admin Dashboard</div>
          <div className="dash-sub">Platform overview & system health</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/admin/users')}>Manage Users</button>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/admin/moderation')}>Moderation</button>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/admin/settings')}>Settings</button>
        </div>
      </div>

      <div className="stat-row">
        <Stat label="Total Users" value={t.totalUsers} amber onClick={() => toggle('totalUsers')} active={sel === 'totalUsers'} />
        <Stat label="Total Projects" value={t.totalProjects} onClick={() => toggle('totalProjects')} active={sel === 'totalProjects'} />
        <Stat label="Pending Review" value={t.pending} onClick={() => toggle('pending')} active={sel === 'pending'} />
        <Stat label="Approved" value={t.approved} onClick={() => toggle('approved')} active={sel === 'approved'} />
      </div>
      <div className="stat-row">
        <Stat label="Students" value={t.students} onClick={() => toggle('students')} active={sel === 'students'} />
        <Stat label="Supervisors" value={t.supervisors} onClick={() => toggle('supervisors')} active={sel === 'supervisors'} />
        <Stat label="Guests" value={t.observers} onClick={() => toggle('observers')} active={sel === 'observers'} />
        <Stat label="Admins" value={t.admins} onClick={() => toggle('admins')} active={sel === 'admins'} />
        <Stat label="Groups" value={t.groups ?? 0} onClick={() => toggle('groups')} active={sel === 'groups'} />
      </div>

      {sel && (
        <div className="section-card stat-detail">
          <div className="section-title">
            {CFG[sel].title}
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>Close ✕</button>
          </div>
          {{ users, projects, groups }[CFG[sel].kind] === null ? (
            <div className="spinner" />
          ) : CFG[sel].kind === 'users' ? (
            (() => {
              const list = users.filter(CFG[sel].filter);
              return list.length === 0 ? (
                <div className="sub" style={{ padding: '.5rem 0' }}>No users to show.</div>
              ) : (
                list.map((u) => (
                  <div className="list-row" key={u._id} style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/users')}>
                    <Avatar user={u} size={30} />
                    <div className="meta">
                      <div className="title">{u.name}{!u.active && ' · (disabled)'}</div>
                      <div className="sub">{u.email}{u.dept ? ` · ${u.dept}` : ''}</div>
                    </div>
                    <span className={`role-badge rb-${u.role}`}>{ROLE_LABELS[u.role]}</span>
                  </div>
                ))
              );
            })()
          ) : CFG[sel].kind === 'projects' ? (
            (() => {
              const list = projects.filter(CFG[sel].filter);
              return list.length === 0 ? (
                <div className="sub" style={{ padding: '.5rem 0' }}>No projects to show.</div>
              ) : (
                list.map((p) => (
                  <div className="list-row" key={p._id} style={{ cursor: 'pointer' }} onClick={() => openProject(p._id)}>
                    <div className="meta">
                      <div className="title">{p.title}</div>
                      <div className="sub">{p.dept} · {timeAgo(p.createdAt)}</div>
                    </div>
                    <span className={`tag tag-${p.status}`}>{p.status}</span>
                  </div>
                ))
              );
            })()
          ) : (
            (() => {
              const list = groups.filter(CFG[sel].filter);
              return list.length === 0 ? (
                <div className="sub" style={{ padding: '.5rem 0' }}>No groups created yet.</div>
              ) : (
                list.map((g) => (
                  <div className="list-row" key={g._id}>
                    <div className="meta">
                      <div className="title">{g.name}</div>
                      <div className="sub">
                        {g.dept ? `${g.dept} · ` : ''}created by {g.creator?.name || '—'} · {g.memberCount} member{g.memberCount === 1 ? '' : 's'} · {timeAgo(g.createdAt)}
                      </div>
                    </div>
                    <span className={`tag ${g.chatEnabled ? 'tag-approved' : 'tag-pending'}`}>
                      chat {g.chatEnabled ? 'on' : 'off'}
                    </span>
                  </div>
                ))
              );
            })()
          )}
        </div>
      )}

      <div className="chart-grid">
        <div className="chart-card">
          <div className="chart-title">Users by Role</div>
          <BarGraph data={d.usersByRole} xKey="name" series={[{ key: 'value', label: 'Users' }]} height={220} />
        </div>

        <div className="chart-card">
          <div className="chart-title">Project Status</div>
          <BarGraph data={d.statusBreakdown} xKey="name" series={[{ key: 'value', label: 'Projects' }]} height={220} />
        </div>

        <div className="chart-card">
          <div className="chart-title">Projects by Department</div>
          <BarGraph
            data={d.byDept.map((x) => ({ name: x.name, value: x.count }))}
            xKey="name"
            series={[{ key: 'value', label: 'Projects' }]}
            labelFormatter={deptAbbr}
            height={220}
          />
        </div>

        <div className="chart-card">
          <div className="chart-title">Projects Created (last 6 months)</div>
          <BarGraph data={d.growth.map((x) => ({ name: x.name, value: x.count }))} xKey="name" series={[{ key: 'value', label: 'Projects' }]} height={220} />
        </div>
      </div>

      <div className="two-col">
        <div className="section-card">
          <div className="section-title">
            Recent Projects
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/moderation')}>View all</button>
          </div>
          {d.recentProjects.map((p) => (
            <div className="list-row" key={p._id} style={{ cursor: 'pointer' }} onClick={() => openProject(p._id)}>
              <div className="meta">
                <div className="title">{p.title}</div>
                <div className="sub">{p.dept} · {p.authors.join(', ')} · {timeAgo(p.createdAt)}</div>
              </div>
              <span className={`tag tag-${p.status}`}>{p.status}</span>
            </div>
          ))}
        </div>

        <div className="section-card">
          <div className="section-title">
            Newest Users
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/users')}>Manage</button>
          </div>
          {d.recentUsers.map((u) => (
            <div className="list-row" key={u._id}>
              <Avatar user={u} size={30} />
              <div className="meta">
                <div className="title">{u.name}</div>
                <div className="sub">{u.email}</div>
              </div>
              <span className={`role-badge rb-${u.role}`}>{ROLE_LABELS[u.role]}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, amber, onClick, active }) {
  return (
    <div className={`stat-card ${onClick ? 'stat-clickable' : ''} ${active ? 'sel' : ''}`} onClick={onClick}>
      <div className="stat-label">{label}</div>
      <div className={`stat-val ${amber ? 'amb' : ''}`}>{value}</div>
    </div>
  );
}
