import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api/client.js';
import { useUI } from '../context/UIContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { tierEmoji, CHART_COLORS } from '../utils.js';
import BarGraph from '../components/BarGraph.jsx';

const axisTick = { fill: 'var(--textmuted)', fontSize: 11 };
const tooltipStyle = {
  background: 'var(--white)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--text)',
};

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

  if (!data) return <div className="spinner" />;

  const {
    totals,
    topProjects,
    levelKeys = [],
    projectsByDept = [],
    collaborationsByDept = [],
    engagementTrend = [],
  } = data;

  const levelSeries = levelKeys.map((l) => ({ key: l, label: l }));

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

        <div className="chart-card">
          <div className="chart-title">Top Performance</div>
          {engagementTrend.length === 0 || levelKeys.length === 0 ? (
            <div className="chart-empty">No data yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart key={lineKey} data={engagementTrend} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                <YAxis allowDecimals={false} tick={axisTick} width={30} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                {levelKeys.map((l, i) => (
                  <Line
                    key={l}
                    type="monotone"
                    dataKey={l}
                    name={l}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive
                    animationBegin={i * 150}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-title">🏆 Top Projects by Gold</div>
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
                <div style={{ fontSize: 10, color: 'var(--textmuted)' }}>gold</div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
