import { initials, isHexColor, readableText } from '../utils.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Avatar({ user, size = 28 }) {
  const { user: me } = useAuth();
  if (!user) return null;
  // The signed-in user's avatar reflects their chosen colour live, everywhere it
  // appears (feed, projects, collaborations, groups, chat) — not the snapshot
  // baked into whatever list this avatar was rendered from. Other people show the
  // colour carried on their populated record (kept current on the server).
  const color =
    me && user._id && String(user._id) === String(me._id) ? me.avatarColor : user.avatarColor;
  // A colour can be a legacy palette class (av-amber) or a full-spectrum hex.
  const hex = isHexColor(color);
  return (
    <div
      className={`avatar ${hex ? '' : color || 'av-amber'}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        ...(hex ? { background: color, color: readableText(color) } : {}),
      }}
      title={user.name}
    >
      {initials(user.name)}
    </div>
  );
}
