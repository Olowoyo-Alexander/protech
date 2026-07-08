import { useEffect, useRef, useState } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ResponsiveContainer,
} from 'recharts';

// Palette lifted from the bar-chart template (light blue → cyan → indigo).
const TEMPLATE_PALETTE = ['#4f86ef', '#45c4d4', '#8fb8ef', '#8f8fe6', '#9db9e8'];

const tooltipStyle = {
  background: 'var(--white)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--text)',
};

// The value sits inside the upper part of the bar (no badge). `y` is the top of
// the (whole) bar; a hanging baseline draws the number just below that edge, so
// the whole glyph stays inside the top. A thin dark outline keeps the white
// number legible on any bar colour.
function TopValue({ x, y, width, value }) {
  if (!value) return null;
  return (
    <text
      x={x + width / 2}
      y={y + 4}
      textAnchor="middle"
      dominantBaseline="hanging"
      fontSize={11}
      fontWeight={700}
      fill="#ffffff"
      stroke="rgba(15,23,42,.35)"
      strokeWidth={2.5}
      paintOrder="stroke"
      style={{ pointerEvents: 'none' }}
    >
      {value}
    </text>
  );
}

/**
 * A bar chart styled after the project's bar-chart template (rounded gradient
 * bars, floating value badges, light plot) built on Recharts, shared across the
 * Analytics page and the supervisor/admin dashboards.
 *
 *  data          rows of data
 *  xKey          category key on the x-axis (e.g. 'dept' or 'name')
 *  series        [{ key, label?, color? }] — one entry = simple bars, many = stacked
 *  badgeKey      which field the top badge shows (defaults to the last series key;
 *                use 'total' for stacked totals)
 *  labelFormatter(name) → compact x-axis label (e.g. department short form)
 *  onOpenProject(id)    → makes bars clickable, popping the projects behind a bar
 *  onBarSelect(row)     → alternative to onOpenProject for bars whose "result" isn't
 *                         a list of projects (e.g. a role or status breakdown) — the
 *                         full data row is handed to the caller directly, no popover
 */
export default function BarGraph({
  data = [], xKey, series, height = 240, badgeKey, labelFormatter, onOpenProject, onBarSelect,
}) {
  const stacked = series.length > 1;
  const wrapRef = useRef(null);
  const [active, setActive] = useState(null); // { left, name, projects }

  // Re-trigger the grow animation on mount and whenever the data changes, by
  // remounting the chart one frame later — once the ResponsiveContainer has a
  // real size, so Recharts runs its enter animation instead of skipping it.
  const sig = data.map((d) => `${d[xKey]}=${series.map((s) => d[s.key]).join(',')}`).join('|');
  const [animKey, setAnimKey] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimKey((k) => k + 1));
    return () => cancelAnimationFrame(id);
  }, [sig]);

  useEffect(() => {
    if (!active) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setActive(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [active]);

  if (!data.length) return <div className="chart-empty" style={{ height }}>No data yet.</div>;

  const topKey = badgeKey || series[series.length - 1].key;
  const selectable = typeof onBarSelect === 'function';
  const clickable = typeof onOpenProject === 'function' || selectable;

  const onBarClick = (entry) => {
    if (!clickable) return;
    const row = entry?.payload || {};
    if (selectable) { onBarSelect(row); return; }
    const projects = row.projects || [];
    if (!projects.length) { setActive(null); return; }
    const w = wrapRef.current?.clientWidth || 320;
    const popW = 232;
    const cx = (entry.x || 0) + (entry.width || 0) / 2;
    const left = Math.max(6, Math.min(cx - popW / 2, w - popW - 6));
    setActive({ left, name: row[xKey], projects });
  };

  return (
    <div className="bg-wrap" ref={wrapRef} style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart key={animKey} data={data} margin={{ top: 12, right: 8, left: -14, bottom: 4 }} barCategoryGap="26%">
          <defs>
            {TEMPLATE_PALETTE.map((c, i) => (
              <linearGradient key={i} id={`bgp-${xKey}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={0.95} />
                <stop offset="100%" stopColor={c} stopOpacity={0.4} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: 'var(--textmuted)', fontSize: 11 }}
            tickFormatter={labelFormatter}
            interval={0}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            height={28}
          />
          <YAxis allowDecimals={false} width={30} tick={{ fill: 'var(--textmuted)', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface)' }} />
          {series.map((s, i) => {
            const last = i === series.length - 1;
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label || s.key}
                stackId={stacked ? 'a' : undefined}
                fill={`url(#bgp-${xKey}-${i % TEMPLATE_PALETTE.length})`}
                radius={last ? [6, 6, 0, 0] : 0}
                maxBarSize={56}
                cursor={clickable ? 'pointer' : 'default'}
                onClick={clickable ? onBarClick : undefined}
                isAnimationActive
                animationBegin={i * 120}
                animationDuration={800}
                animationEasing="ease-out"
              >
                {/* Simple (non-stacked) bars cycle the palette per bar, like the
                    template; stacked series keep one colour each. */}
                {!stacked && data.map((_, idx) => (
                  <Cell key={idx} fill={`url(#bgp-${xKey}-${idx % TEMPLATE_PALETTE.length})`} />
                ))}
                {last && <LabelList dataKey={topKey} content={TopValue} />}
              </Bar>
            );
          })}
        </BarChart>
      </ResponsiveContainer>

      {active && (
        <div className="tbar-pop" style={{ position: 'absolute', top: 6, left: active.left, width: 232 }} onClick={(e) => e.stopPropagation()}>
          <div className="tbar-pop-hd">
            <span className="tbar-pop-name" title={active.name}>{active.name}</span>
            <span className="tbar-pop-count">{active.projects.length}</span>
            <button className="tbar-pop-x" onClick={() => setActive(null)} aria-label="Close">✕</button>
          </div>
          <div className="tbar-pop-list">
            {active.projects.map((pr) => (
              <button key={pr._id} className="tbar-pop-item" onClick={() => { setActive(null); onOpenProject(pr._id); }}>
                <span className="tbar-pop-title">{pr.title}</span>
                {pr.sub && <span className="tbar-pop-sub">{pr.sub}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
