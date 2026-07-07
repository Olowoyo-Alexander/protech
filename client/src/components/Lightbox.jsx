import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Full-screen image viewer shown in-app (no page redirect). Supports multiple
// photos with prev/next and keyboard control (← → to navigate, Esc to close).
export default function Lightbox({ photos = [], index = 0, onClose }) {
  const [i, setI] = useState(index);

  useEffect(() => setI(index), [index]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setI((v) => (v + 1) % photos.length);
      else if (e.key === 'ArrowLeft') setI((v) => (v - 1 + photos.length) % photos.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photos.length, onClose]);

  if (!photos.length) return null;
  const multi = photos.length > 1;
  const go = (e, delta) => {
    e.stopPropagation();
    setI((v) => (v + delta + photos.length) % photos.length);
  };

  // Rendered into <body> via a portal so the viewer is never a descendant of a
  // card. A hovered card gets a CSS `transform`, which would otherwise become
  // the containing block for this `position:fixed` overlay — collapsing it to
  // the card's box and causing a hover/flicker loop as the cursor moves.
  return createPortal(
    <div className="lightbox" onClick={onClose}>
      <button className="lb-close" onClick={onClose} aria-label="Close">✕</button>
      {multi && <button className="lb-nav prev" onClick={(e) => go(e, -1)} aria-label="Previous">‹</button>}
      {/* The image sits in a frame with a transparent guard on top, so the
          browser's built-in image hover tools (e.g. Edge "Visual search") don't
          appear. Clicks on the frame don't close the viewer. */}
      <div className="lb-frame" onClick={(e) => e.stopPropagation()}>
        <img className="lb-img" src={photos[i]} alt={`Photo ${i + 1}`} />
        <span className="lb-guard" />
      </div>
      {multi && <button className="lb-nav next" onClick={(e) => go(e, 1)} aria-label="Next">›</button>}
      {multi && <div className="lb-count" onClick={(e) => e.stopPropagation()}>{i + 1} / {photos.length}</div>}
    </div>,
    document.body
  );
}
