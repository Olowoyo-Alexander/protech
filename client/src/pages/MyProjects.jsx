import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useUI } from '../context/UIContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import ProjectCard from '../components/ProjectCard.jsx';

export default function MyProjects() {
  const { user } = useAuth();
  const { refreshKey, openNew } = useUI();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get('/projects/mine')
      .then((r) => setProjects(r.data))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const updateOne = (u) => setProjects((ps) => ps.map((p) => (p._id === u._id ? u : p)));
  const canCreate = user.role !== 'observer';

  return (
    <>
      <div className="page-title">📄 My Projects</div>
      {loading ? (
        <div className="spinner" />
      ) : projects.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📄</div>
          <div>You haven't created or joined any projects yet.</div>
          {canCreate && (
            <button className="btn btn-primary btn-sm" style={{ marginTop: '1rem' }} onClick={openNew}>
              + Create your first project
            </button>
          )}
        </div>
      ) : (
        projects.map((p) => <ProjectCard key={p._id} project={p} onChange={updateOne} />)
      )}
    </>
  );
}
