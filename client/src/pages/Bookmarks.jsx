import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useUI } from '../context/UIContext.jsx';
import ProjectCard from '../components/ProjectCard.jsx';
import { BookmarkIcon } from '../components/Icons.jsx';

export default function Bookmarks() {
  const { refreshKey } = useUI();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get('/projects/bookmarks')
      .then((r) => setProjects(r.data))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const updateOne = (u) =>
    setProjects((ps) => (u.bookmarked ? ps.map((p) => (p._id === u._id ? u : p)) : ps.filter((p) => p._id !== u._id)));

  return (
    <>
      <div className="page-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <BookmarkIcon size={20} /> Saved Projects
      </div>
      {loading ? (
        <div className="spinner" />
      ) : projects.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><BookmarkIcon size={36} /></div>
          <div>No saved projects yet.</div>
        </div>
      ) : (
        projects.map((p) => <ProjectCard key={p._id} project={p} onChange={updateOne} />)
      )}
    </>
  );
}
