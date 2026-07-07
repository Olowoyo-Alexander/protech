// Line-style (outline) icons for engagement actions. Stroke uses currentColor so
// they inherit the button's colour; pass `filled` to fill them (active states,
// e.g. a liked heart or a saved bookmark).
const svgProps = (size, filled) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: filled ? 'currentColor' : 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
});

export function HeartIcon({ size = 18, filled = false }) {
  return (
    <svg {...svgProps(size, filled)}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export function CommentIcon({ size = 18, filled = false }) {
  return (
    <svg {...svgProps(size, filled)}>
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
    </svg>
  );
}

export function BookmarkIcon({ size = 18, filled = false }) {
  return (
    <svg {...svgProps(size, filled)}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function StarIcon({ size = 18, filled = false }) {
  return (
    <svg {...svgProps(size, filled)}>
      <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.81 6.2 20.86l1.11-6.46-4.7-4.58 6.49-.94z" />
    </svg>
  );
}
