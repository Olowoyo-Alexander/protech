import { useEffect, useRef, useState } from 'react';

// A vertical bar chart styled after bar-chart-template.webp: rounded "pill" bars
// on a light gradient, a circular value badge (with a soft halo) floating at the
// top of each bar, a baseline line, and the item name sitting beneath that line.
// Bars rise from the baseline every time the chart mounts (i.e. each time you
// enter the page) and whenever the underlying data changes.
//
// When a bar carries a `projects` list and an `onOpen` handler is provided, the
// bar becomes clickable and pops a small "portable" card listing those projects;
// clicking one opens it.
//
// Palette echoes the template — light blue → cyan → indigo, cycled across bars.
const TEMPLATE_PALETTE = ['#9db9e8', '#45c4d4', '#8fb8ef', '#4f86ef', '#8f8fe6'];

export default function TemplateBarChart({ data = [], height = 240, colors = TEMPLATE_PALETTE, onOpen, max = 5 }) {
  const [grown, setGrown] = useState(false);
  const [active, setActive] = useState(null); // index of the bar whose card is open
  const rootRef = useRef(null);

  // The template tops out at five bars by default; callers with more categories
  // (e.g. dashboards) can raise the cap.
  const bars = data.slice(0, max);

  // Re-key the animation on any change to the data so bars re-grow from zero,
  // and close any open card since the bars no longer represent the same thing.
  const sig = bars.map((d) => `${d.name}:${d.value}`).join('|');
  useEffect(() => {
    setActive(null);
    setGrown(false);
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, [sig]);

  // Dismiss the card on an outside click.
  useEffect(() => {
    if (active === null) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setActive(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [active]);

  if (bars.length === 0) {
    return <div className="tbar-empty" style={{ height }}>No data yet.</div>;
  }

  const maxVal = Math.max(...bars.map((d) => d.value), 1);
  const plotH = height - 52; // room for the label row beneath the baseline line

  return (
    <div className="tbar-chart" style={{ height }} ref={rootRef}>
      <div className="tbar-plot" style={{ height: plotH }}>
        {bars.map((d, i) => {
          const color = colors[i % colors.length];
          const h = grown ? Math.max((d.value / maxVal) * (plotH - 16), 8) : 0;
          const list = d.projects || [];
          const clickable = list.length > 0 && typeof onOpen === 'function';
          const align = i === 0 ? 'start' : i === bars.length - 1 ? 'end' : 'center';
          return (
            <div
              className={`tbar-col${clickable ? ' clickable' : ''}`}
              key={d.name + i}
              onClick={clickable ? (e) => { e.stopPropagation(); setActive(active === i ? null : i); } : undefined}
            >
              <div className="tbar-track">
                <div
                  className="tbar-fill"
                  style={{
                    height: h,
                    background: `linear-gradient(180deg, ${color} 0%, ${color}55 100%)`,
                    transitionDelay: `${i * 90}ms`,
                  }}
                >
                  <span
                    className="tbar-badge"
                    style={{
                      borderColor: color,
                      color,
                      boxShadow: `0 0 0 5px ${color}22, 0 2px 8px rgba(10,22,40,.14)`,
                      opacity: grown ? 1 : 0,
                      transitionDelay: `${i * 90 + 220}ms`,
                    }}
                  >
                    {d.value}
                  </span>
                </div>
              </div>

              {active === i && list.length > 0 && (
                <div className={`tbar-pop align-${align}`} onClick={(e) => e.stopPropagation()}>
                  <div className="tbar-pop-hd">
                    <span className="tbar-pop-name" title={d.name}>{d.name}</span>
                    <span className="tbar-pop-count">{list.length}</span>
                    <button className="tbar-pop-x" onClick={() => setActive(null)} aria-label="Close">✕</button>
                  </div>
                  <div className="tbar-pop-list">
                    {list.map((pr) => (
                      <button
                        key={pr._id}
                        className="tbar-pop-item"
                        onClick={() => { setActive(null); onOpen(pr._id); }}
                      >
                        <span className="tbar-pop-title">{pr.title}</span>
                        {pr.sub && <span className="tbar-pop-sub">{pr.sub}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="tbar-labels">
        {bars.map((d, i) => (
          <div className="tbar-label" key={d.name + i} title={d.name}>
            {d.name}
          </div>
        ))}
      </div>
    </div>
  );
}
