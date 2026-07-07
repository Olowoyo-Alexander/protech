import api from '../api/client.js';
import Avatar from './Avatar.jsx';
import { HeartIcon, CommentIcon, BookmarkIcon, StarIcon } from './Icons.jsx';
import { timeAgo, groupTheme, recoMeta, displayName } from '../utils.js';
import { useUI } from '../context/UIContext.jsx';

export default function ProjectCard({ project, onChange }) {
  const { openProject } = useUI();
  const p = project;
  // Author byline shows each author's title + name (e.g. a supervisor who
  // published their own work reads "Dr. Ada Okafor", not just the bare name).
  const authors = p.authors?.map((a) => displayName(a)).join(', ') || 'Unknown';
  // A group project is accented with its group's theme colour (left edge).
  const theme = p.group ? groupTheme(p.group.theme) : null;
  // A recognised project wears its tier skin (Star / Gold / Diamond).
  const reco = recoMeta(p);

  const act = async (e, fn) => {
    e.stopPropagation();
    try {
      const { data } = await fn();
      onChange?.(data);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div
      className={`card project-card ${theme ? 'group-accent' : ''} ${reco ? `reco-skin-${reco.key}` : ''}`}
      style={theme ? { borderLeftColor: theme.dot } : undefined}
      onClick={() => openProject(p._id)}
    >
      <div className="proj-meta">
        <span className="tag tag-dept">{p.dept}</span>
        <span className="tag tag-set">{p.set}</span>
        {/* Feed only ever shows approved work, so the green "approved" tag is
            redundant noise — only flag the states that still matter. */}
        {p.status !== 'approved' && <span className={`tag tag-${p.status}`}>{p.status}</span>}
        {p.extends && <span className="collab-badge">🔗 Collaboration</span>}
        {p.group && (
          <span className="tag group-badge" style={{ background: theme.bg, color: theme.fg }}>
            👥 Group · {p.group.name}
          </span>
        )}
        {p.authors?.length > 1 && <span className="collab-badge">👥 Collaboration</span>}
        {reco && <span className={`reco-badge tier-${reco.key}`}>{reco.emoji} {reco.label}</span>}
        {p.hidden && <span className="state-badge">🙈 Hidden</span>}
      </div>
      <div className="proj-title">{p.title}</div>
      <div className="author-line">
        {p.authors?.map((a) => (
          <Avatar key={a._id} user={a} size={18} />
        ))}
        <span>{authors}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11 }}>{timeAgo(p.createdAt)}</span>
      </div>
      <div className="proj-summary">{p.summary}</div>
      <div className="eng-row">
        {p.status !== 'approved' ? (
          // Only approved projects are open to engagement — anything else
          // (pending, draft, rejected) shows read-only counts.
          <>
            <span className="eng-btn"><span className="eng-ic"><HeartIcon /></span> {p.likeCount}</span>
            <span className="eng-btn"><span className="eng-ic"><CommentIcon /></span> {p.commentCount}</span>
            <span className="eng-btn"><span className="eng-ic"><BookmarkIcon /></span> {p.bookmarkCount}</span>
          </>
        ) : (
          <>
            <button
              className={`eng-btn act-like ${p.liked ? 'liked' : ''}`}
              onClick={(e) => act(e, () => api.post(`/projects/${p._id}/like`))}
            >
              <span className="eng-ic"><HeartIcon filled={p.liked} /></span> {p.likeCount}
            </button>
            <button className="eng-btn act-comment" onClick={(e) => { e.stopPropagation(); openProject(p._id); }}>
              <span className="eng-ic"><CommentIcon /></span> {p.commentCount}
            </button>
            <button
              className={`eng-btn act-save ${p.bookmarked ? 'saved' : ''}`}
              onClick={(e) => act(e, () => api.post(`/projects/${p._id}/bookmark`))}
            >
              <span className="eng-ic"><BookmarkIcon filled={p.bookmarked} /></span> {p.bookmarkCount}
            </button>
          </>
        )}
        <span className="eng-btn"><span className="eng-ic"><StarIcon /></span> {p.avgRating || '—'}</span>
        <span className="eng-stars" style={{ marginLeft: 'auto' }} title="Stars earned">
          <StarIcon size={14} filled /> {p.gold}
        </span>
      </div>
    </div>
  );
}
