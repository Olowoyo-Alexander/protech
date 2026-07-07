import { useState, useEffect, useRef } from 'react';
import Avatar from './Avatar.jsx';
import { HeartIcon, CommentIcon } from './Icons.jsx';
import Lightbox from './Lightbox.jsx';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { timeAgo, groupTheme, displayName } from '../utils.js';

// A group snippet on the feed. The group itself never gets a feed entry — only
// its posts do — so the card leads with the group tag and the posting author.
// Snippets can be liked and commented on by anyone; group admins can delete them.
export default function SnippetCard({ snippet, onUpdate, onDelete }) {
  const s = snippet;
  const { user } = useAuth();
  const confirm = useConfirm();
  // A group post carries its group's theme colour as a left-edge accent.
  const theme = s.group ? groupTheme(s.group.theme) : null;

  const [showComments, setShowComments] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState(null); // index of the open photo
  const [menuOpen, setMenuOpen] = useState(false); // the ⋯ overflow menu
  const menuRef = useRef(null);

  // Close the overflow menu on any outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [menuOpen]);

  const like = async () => {
    try {
      const { data } = await api.post(`/snippets/${s._id}/like`);
      onUpdate?.(data);
    } catch (e) {
      alert(e.message);
    }
  };

  const postComment = async () => {
    const text = comment.trim();
    if (!text) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/snippets/${s._id}/comments`, { text });
      setComment('');
      setShowComments(true);
      onUpdate?.(data);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setMenuOpen(false);
    const ok = await confirm({
      title: 'Delete post?',
      message: 'This permanently removes this group post from the feed.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/snippets/${s._id}`);
      onDelete?.(s._id);
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div
      className={`card project-card ${theme ? 'group-accent' : ''}`}
      style={{ cursor: 'default', ...(theme ? { borderLeftColor: theme.dot } : {}) }}
    >
      {s.canDelete && (
        <div className="snip-menu" ref={menuRef}>
          <button
            className="snip-menu-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Post options"
            aria-haspopup="true"
            aria-expanded={menuOpen}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="snip-menu-pop" role="menu">
              <button className="snip-menu-item danger" role="menuitem" onClick={remove}>
                🗑 Delete post
              </button>
            </div>
          )}
        </div>
      )}
      <div className="proj-meta">
        <span className="tag tag-dept">📣 Group Post</span>
        {s.group && (
          <span className="tag group-badge" style={{ background: theme.bg, color: theme.fg }}>
            👥 {s.group.name}
          </span>
        )}
        {s.group?.dept && <span className="tag tag-set">{s.group.dept}</span>}
      </div>
      <div className="author-line">
        {s.author && <Avatar user={s.author} size={18} />}
        <span>{displayName(s.author) || 'Unknown'}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11 }}>{timeAgo(s.createdAt)}</span>
      </div>
      <div className="proj-summary" style={{ whiteSpace: 'pre-wrap', marginTop: '.25rem' }}>{s.text}</div>

      {s.photos?.length > 0 && (
        <div className={`snippet-photos count-${Math.min(s.photos.length, 4)}`}>
          {s.photos.slice(0, 4).map((src, i) => (
            <button type="button" className="snippet-photo" key={i} onClick={() => setLightbox(i)}>
              <img src={src} alt={`Progress photo ${i + 1}`} loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <div className="eng-row" style={{ marginTop: '.6rem' }}>
        <button className={`eng-btn act-like ${s.liked ? 'liked' : ''}`} onClick={like}>
          <span className="eng-ic"><HeartIcon filled={s.liked} /></span> {s.likeCount || 0}
        </button>
        <button className="eng-btn act-comment" onClick={() => setShowComments((v) => !v)}>
          <span className="eng-ic"><CommentIcon /></span> {s.commentCount || 0}
        </button>
      </div>

      {showComments && (
        <div className="comment-list">
          {s.comments?.length ? (
            s.comments.map((c) => (
              <div className="comment" key={c._id}>
                <Avatar user={c.user} size={26} />
                <div style={{ flex: 1 }}>
                  <div className="comment-meta">
                    <span className="comment-author">{c.user?.name || 'Unknown'}</span>
                    <span className="comment-time">{timeAgo(c.createdAt)}</span>
                  </div>
                  <div className="comment-text">{c.text}</div>
                </div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 12, color: 'var(--textmuted)' }}>No comments yet — be the first.</div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: '.5rem' }}>
            <input
              placeholder="Write a comment..."
              style={{ flex: 1, padding: '8px 11px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && postComment()}
            />
            <button className="btn btn-primary btn-sm" disabled={busy || !comment.trim()} onClick={postComment}>
              Post
            </button>
          </div>
        </div>
      )}

      {lightbox != null && (
        <Lightbox photos={s.photos} index={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
