import { timeAgo } from '../utils.js';

// A platform-wide announcement on the feed. Deliberately shows no sender
// information — just the message, an "Announcement" badge and the time. Admins
// are given a remove control via `onDelete`.
export default function AnnouncementCard({ announcement, onDelete }) {
  const a = announcement;
  return (
    <div className="card announcement-card">
      <div className="announcement-head">
        <span className="announcement-badge">📢 Announcement</span>
        <span className="announcement-time">{timeAgo(a.createdAt)}</span>
        {onDelete && (
          <button
            className="announcement-del"
            onClick={() => onDelete(a._id)}
            title="Remove announcement"
            aria-label="Remove announcement"
          >
            ✕
          </button>
        )}
      </div>
      <div className="announcement-text">{a.text}</div>
    </div>
  );
}
