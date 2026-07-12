import { useEffect, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api/client.js';
import { useUI } from '../context/UIContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { tierEmoji, CHART_COLORS } from '../utils.js';
import BarGraph from '../components/BarGraph.jsx';
import { HeartIcon, CommentIcon, BookmarkIcon, StarIcon } from '../components/Icons.jsx';

const axisTick = { fill: 'var(--textmuted)', fontSize: 11 };
const tooltipStyle = {
  background: 'var(--white)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--text)',
};

// One line per level in the trend chart is a *total* of five distinct
// engagement types; this breaks that total back down so a reader can see
// what it's actually made of, not just an opaque combined number. Levels
// with nothing going on at this point are hidden rather than listed at 0,
// unless every level is empty (then the raw rows are shown so the tooltip
// is never blank).
function EngagementTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const nonZero = payload.filter((p) => Number(p.value) > 0);
  const rows = payload.length > 1 && nonZero.length ? nonZero : payload;
  return (
    <div style={{ ...tooltipStyle, padding: '10px 12px', minWidth: 190 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {rows.map((p) => {
        const b = p.payload?.breakdown?.[p.dataKey] || {};
        return (
          <div key={p.dataKey} style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: p.color, fontWeight: 600 }}>
              <span>{p.name}</span>
              <span>{p.value} total</span>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 2, color: 'var(--textmuted)', fontSize: 11 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><HeartIcon size={11} filled /> {b.likes || 0}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><CommentIcon size={11} /> {b.comments || 0}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><BookmarkIcon size={11} /> {b.bookmarks || 0}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><StarIcon size={11} filled /> {b.ratings || 0}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>🏅 {b.recognitions || 0}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Analytics() {
  const { openProject, refreshKey } = useUI();
  const { user } = useAuth();
  const { deptAbbr } = useSettings();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/analytics').then((r) => setData(r.data));
  }, [refreshKey]);

  // Remount the trend line one frame after data loads so its draw-in animation
  // actually plays (Recharts skips it if the container wasn't sized yet).
  const [lineKey, setLineKey] = useState(0);
  const trendLen = data?.engagementTrend?.length || 0;
  useEffect(() => {
    const id = requestAnimationFrame(() => setLineKey((k) => k + 1));
    return () => cancelAnimationFrame(id);
  }, [trendLen]);

  // Click-through popover for the trend line's dots — same idiom as BarGraph's
  // bar popover (reuses its .tbar-pop styling), since a point here represents a
  // month+level bucket of projects rather than a single project.
  const trendWrapRef = useRef(null);
  const [activePoint, setActivePoint] = useState(null); // { left, name, projects }
  useEffect(() => {
    if (!activePoint) return undefined;
    const onDown = (e) => {
      if (trendWrapRef.current && !trendWrapRef.current.contains(e.target)) setActivePoint(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [activePoint]);

  if (!data) return <div className="spinner" />;

  const {
    totals,
    topProjects,
    levelKeys = [],
    projectsByDept = [],
    collaborationsByDept = [],
    groupPerformance = [],
    engagementTrend = [],
  } = data;

  const levelSeries = levelKeys.map((l) => ({ key: l, label: l }));
  // Group names can be long — keep the x-axis ticks compact.
  const groupAbbr = (n) => (String(n).length > 12 ? `${String(n).slice(0, 11)}…` : n);

  return (
    <>
      <div className="page-title">📊 Analytics Dashboard</div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Projects</div>
          <div className="stat-val amb">{totals.totalProjects}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Approved</div>
          <div className="stat-val">{totals.approved}</div>
        </div>
        {/* Recognition hidden for guests. */}
        {user.role !== 'observer' && (
          <div className="stat-card">
            <div className="stat-label">🏅 Recognized</div>
            <div className="stat-val">{totals.recognized}</div>
          </div>
        )}
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <div className="chart-title">Most Projects</div>
          <BarGraph
            data={projectsByDept}
            xKey="dept"
            series={levelSeries}
            badgeKey="total"
            labelFormatter={deptAbbr}
            onOpenProject={openProject}
          />
        </div>

        <div className="chart-card">
          <div className="chart-title">Most Collaborations</div>
          <BarGraph
            data={collaborationsByDept}
            xKey="dept"
            series={levelSeries}
            badgeKey="total"
            labelFormatter={deptAbbr}
            onOpenProject={openProject}
          />
        </div>

        {/* Group performance — stars and engagement side by side per group.
            Only shown once at least one group has approved work, so the page
            isn't padded with an empty card before then. */}
        {groupPerformance.length > 0 && (
          <div className="chart-card">
            <div className="chart-title">Group Performance</div>
            <BarGraph
              data={groupPerformance}
              xKey="name"
              series={[
                { key: 'stars', label: '⭐ Stars' },
                { key: 'engagement', label: 'Engagement' },
              ]}
              grouped
              labelFormatter={groupAbbr}
              onOpenProject={openProject}
            />
          </div>
        )}

        <div className="chart-card">
          <div className="chart-title">Top Performance</div>
          {engagementTrend.length === 0 || levelKeys.length === 0 ? (
            <div className="chart-empty">No data yet.</div>
          ) : (
            <div className="bg-wrap" ref={trendWrapRef} style={{ position: 'relative' }}>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart key={lineKey} data={engagementTrend} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                  <YAxis allowDecimals={false} tick={axisTick} width={30} tickLine={false} axisLine={false} />
                  <Tooltip content={<EngagementTooltip />} />
                  {levelKeys.map((l, i) => {
                    const color = CHART_COLORS[i % CHART_COLORS.length];
                    const onDotClick = (props) => {
                      const row = props?.payload;
                      const projects = row?.projects?.[l] || [];
                      if (!projects.length) { setActivePoint(null); return; }
                      const w = trendWrapRef.current?.clientWidth || 320;
                      const popW = 232;
                      const left = Math.max(6, Math.min((props.cx || 0) - popW / 2, w - popW - 6));
                      setActivePoint({ left, name: `${row.month} · ${l}`, projects });
                    };
                    return (
                      <Line
                        key={l}
                        type="monotone"
                        dataKey={l}
                        name={l}
                        stroke={color}
                        strokeWidth={2}
                        dot={(props) => (
                          <circle
                            key={`dot-${l}-${props.index}`}
                            cx={props.cx}
                            cy={props.cy}
                            r={4}
                            fill={color}
                            stroke="var(--white)"
                            strokeWidth={1.5}
                            style={{ cursor: 'pointer' }}
                            onClick={() => onDotClick(props)}
                          />
                        )}
                        activeDot={{ r: 6, style: { cursor: 'pointer' }, onClick: onDotClick }}
                        isAnimationActive
                        animationBegin={i * 150}
                        animationDuration={800}
                        animationEasing="ease-out"
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>

              {activePoint && (
                <div className="tbar-pop" style={{ position: 'absolute', top: 6, left: activePoint.left, width: 232 }} onClick={(e) => e.stopPropagation()}>
                  <div className="tbar-pop-hd">
                    <span className="tbar-pop-name" title={activePoint.name}>{activePoint.name}</span>
                    <span className="tbar-pop-count">{activePoint.projects.length}</span>
                    <button className="tbar-pop-x" onClick={() => setActivePoint(null)} aria-label="Close">✕</button>
                  </div>
                  <div className="tbar-pop-list">
                    {activePoint.projects.map((pr) => (
                      <button key={pr._id} className="tbar-pop-item" onClick={() => { setActivePoint(null); openProject(pr._id); }}>
                        <span className="tbar-pop-title">{pr.title}</span>
                        {pr.sub && <span className="tbar-pop-sub">{pr.sub}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-title">🏆 Top Projects by Engagement</div>
        {topProjects.length === 0 ? (
          <div style={{ color: 'var(--textmuted)', fontSize: 13 }}>No approved projects yet.</div>
        ) : (
          topProjects.map((p, i) => (
            <div className="lb-row" key={p._id} onClick={() => openProject(p._id)}>
              <div className={`lb-rank ${i === 0 ? 'rk1' : i === 1 ? 'rk2' : i === 2 ? 'rk3' : 'rkn'}`}>{i + 1}</div>
              <div className="lb-info">
                <div className="lb-title">{p.title} {tierEmoji(p)}</div>
                <div className="lb-dept">{p.dept} · {p.set}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="score-num">{p.gold}</div>
                <div style={{ fontSize: 10, color: 'var(--textmuted)' }}>{p.gold === 1 ? 'star' : 'stars'}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
