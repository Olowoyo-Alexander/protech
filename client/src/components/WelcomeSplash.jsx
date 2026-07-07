import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

// A warm, 3-second welcome shown right after sign-in. Fades itself out and tells
// AuthContext to clear the flag, revealing the app underneath.
export default function WelcomeSplash() {
  const { user, justLoggedIn, dismissWelcome } = useAuth();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!justLoggedIn) return;
    setLeaving(false);
    const fade = setTimeout(() => setLeaving(true), 2550); // begin fade-out
    const done = setTimeout(() => dismissWelcome(), 3000); // then remove
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [justLoggedIn, dismissWelcome]);

  if (!justLoggedIn || !user) return null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = user.name.split(' ')[0];

  // A handful of floating sparkles with varied positions/delays.
  const sparks = [
    { left: '12%', top: '24%', d: '0s', s: 8 },
    { left: '82%', top: '20%', d: '.4s', s: 6 },
    { left: '24%', top: '72%', d: '.8s', s: 10 },
    { left: '70%', top: '70%', d: '.2s', s: 7 },
    { left: '50%', top: '14%', d: '.6s', s: 5 },
    { left: '88%', top: '52%', d: '1s', s: 9 },
    { left: '8%', top: '50%', d: '.3s', s: 6 },
  ];

  return (
    <div className={`welcome-splash ${leaving ? 'leaving' : ''}`} role="status" aria-live="polite">
      <div className="welcome-card">
        <span className="welcome-aurora a1" />
        <span className="welcome-aurora a2" />
        {sparks.map((sp, i) => (
          <span
            key={i}
            className="welcome-spark"
            style={{ left: sp.left, top: sp.top, width: sp.s, height: sp.s, animationDelay: sp.d }}
          />
        ))}
        <div className="welcome-content">
          <div className="welcome-emoji">👋</div>
          <div className="welcome-greet">{greeting},</div>
          <div className="welcome-name">{first}</div>
          <div className="welcome-sub">Welcome back to PROTECH</div>
        </div>
      </div>
    </div>
  );
}
