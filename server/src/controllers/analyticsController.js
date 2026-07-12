import asyncHandler from 'express-async-handler';
import Project from '../models/Project.js';
import User from '../models/User.js';
import { platformUsers } from '../utils/platform.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A project's academic level is the actual level of whoever is involved: the
// first author that has a level (e.g. "300 Level" → "300L"). We scan all authors
// so a project co-authored/published with a level-less user (e.g. a supervisor)
// still resolves to the student's real level rather than a catch-all. Projects
// where no author has any level fall back to "Unspecified" so they still show
// up in every chart instead of silently vanishing.
const LEVEL_ORDER = ['100L', '200L', '300L', '400L', '500L', '600L'];
const UNSPECIFIED_LEVEL = 'Unspecified';
const levelOf = (authors) => {
  for (const a of authors || []) {
    const m = String((a && a.level) || '').match(/(\d{3})/);
    if (m) return `${m[1]}L`;
  }
  return UNSPECIFIED_LEVEL;
};
// Order the levels found: numeric levels ascending, anything else after.
const orderLevels = (set) => {
  const arr = [...set];
  return arr.sort((a, b) => {
    const ia = LEVEL_ORDER.indexOf(a);
    const ib = LEVEL_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a < b ? -1 : 1;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
};

// GET /api/analytics
// The analytics charts are filter-free and level-aware: every dimension is
// encoded directly in the graph.
//   - projectsByDept / collaborationsByDept: dept×level matrices for stacked bars
//     (department on the axis, one stack segment per academic level)
//   - engagementTrend: monthly engagement, one line per academic level
// plus the totals and the Gold leaderboard.
export const getAnalytics = asyncHandler(async (req, res) => {
  const [totalProjects, approved, pending, rejected, recognized, totalUsers, students, supervisors] =
    await Promise.all([
      Project.countDocuments(),
      Project.countDocuments({ status: 'approved' }),
      Project.countDocuments({ status: 'pending' }),
      Project.countDocuments({ status: 'rejected' }),
      Project.countDocuments({ recognized: true }),
      User.countDocuments(),
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'supervisor' }),
    ]);

  // Top projects by total stars (supervisor + background engagement).
  // (authors' levels and the group are also populated here so the group
  // performance matrices below can reuse this same query.)
  const users = platformUsers();
  const all = await Project.find({ status: 'approved' })
    .populate('authors', 'name level')
    .populate('group', 'name');
  const top = all
    .map((p) => ({
      _id: p._id,
      title: p.title,
      dept: p.dept,
      set: p.set,
      gold: Math.round(p.totalGold(users) * 10) / 10,
      recognized: p.recognized,
      tier: p.totalTier(users),
      likes: p.likes.length,
    }))
    .sort((a, b) => b.gold - a.gold)
    .slice(0, 5);

  // --- Stacked-bar matrices (department × academic level) --------------------
  const docs = await Project.find({}, 'title dept set status extends authors')
    .populate('authors', 'level')
    .sort('-createdAt')
    .lean();
  const levelSeen = new Set();
  const projByDept = {};
  const collabByDept = {};
  const projList = {}; // dept -> [{ _id, title, sub }] for the click-through popover
  const collabList = {};
  const isCollab = (d) => d.extends && d.status !== 'pending';
  for (const d of docs) {
    const level = levelOf(d.authors);
    const dept = d.dept || 'Unknown';
    levelSeen.add(level);
    const item = { _id: d._id, title: d.title, sub: `${d.set} · ${level} · ${d.status}` };
    (projByDept[dept] ||= {})[level] = (projByDept[dept][level] || 0) + 1;
    (projList[dept] ||= []).push(item);
    if (isCollab(d)) {
      (collabByDept[dept] ||= {})[level] = (collabByDept[dept][level] || 0) + 1;
      (collabList[dept] ||= []).push(item);
    }
  }
  const levelKeys = orderLevels(levelSeen);
  // Flatten a {dept: {level: n}} map into recharts rows: { dept, total, <level>: n }.
  const toRows = (map, listMap) =>
    Object.entries(map)
      .map(([dept, levels]) => {
        const row = { dept, total: 0, projects: (listMap[dept] || []).slice(0, 40) };
        for (const l of levelKeys) {
          row[l] = levels[l] || 0;
          row.total += row[l];
        }
        return row;
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  const projectsByDept = toRows(projByDept, projList);
  const collaborationsByDept = toRows(collabByDept, collabList);

  // --- Group performance (group × academic level) ----------------------------
  // Two matrices in the same shape as the dept charts, but with a bar per group:
  // stars earned and engagement received by each group's approved projects,
  // stacked by the academic level involved. Only approved work counts (a group
  // draft/pending project can't earn stars or engagement anyway). Top 8 groups
  // per metric so the chart stays readable as groups multiply.
  const round1 = (n) => Math.round(n * 10) / 10;
  const groupStars = {}; // group name -> { level -> stars }
  const groupEng = {}; // group name -> { level -> engagement }
  const groupProjList = {}; // group name -> [{ _id, title, sub }] for the popover
  for (const p of all) {
    if (!p.group) continue;
    const gname = p.group.name;
    const level = levelOf(p.authors);
    const stars = p.totalGold(users);
    const eng =
      p.likes.length + p.comments.length + p.bookmarks.length + p.ratings.length + (p.recognized ? 1 : 0);
    ((groupStars[gname] ||= {})[level] = (groupStars[gname][level] || 0) + stars);
    ((groupEng[gname] ||= {})[level] = (groupEng[gname][level] || 0) + eng);
    (groupProjList[gname] ||= []).push({
      _id: p._id,
      title: p.title,
      sub: `${p.set} · ${level} · ${round1(stars)}★ · ${eng} engagement`,
    });
  }
  // Same flattening as toRows, plus rounding (stars are fractional) and the
  // top-8 cut. Group rows use `name` as the category key.
  const toGroupRows = (map) =>
    Object.entries(map)
      .map(([name, levels]) => {
        const row = { name, total: 0, projects: (groupProjList[name] || []).slice(0, 40) };
        for (const l of levelKeys) {
          row[l] = round1(levels[l] || 0);
          row.total = round1(row.total + row[l]);
        }
        return row;
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  const groupStarsByLevel = toGroupRows(groupStars);
  const groupEngagementByLevel = toGroupRows(groupEng);

  // --- Engagement trend (monthly, one line per academic level) ---------------
  // "Distinguished" engagement per project — the signals that actually mark a
  // project out: likes, saves (bookmarks), comments, star ratings, and whether
  // it has earned a recognition tier — summed by month and by the project's
  // level. Bucketed by project creation date — the one timestamp shared by
  // every engagement type.
  const start = new Date();
  start.setMonth(start.getMonth() - 5);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const trendDocs = await Project.find(
    { createdAt: { $gte: start } },
    'title createdAt likes comments bookmarks ratings recognized authors'
  )
    .populate('authors', 'level')
    .lean();
  const trendMap = {}; // "y-m" -> { level -> totalEngagement }
  const trendBreakdown = {}; // "y-m" -> { level -> { likes, comments, bookmarks, ratings, recognitions } }
  const trendProjects = {}; // "y-m" -> { level -> [{_id,title,sub}] } — click-through
  for (const d of trendDocs) {
    const level = levelOf(d.authors);
    const dt = new Date(d.createdAt);
    const key = `${dt.getFullYear()}-${dt.getMonth() + 1}`;
    const likes = (d.likes || []).length;
    const comments = (d.comments || []).length;
    const bookmarks = (d.bookmarks || []).length;
    const ratings = (d.ratings || []).length;
    const recognitions = d.recognized ? 1 : 0;
    const eng = likes + comments + bookmarks + ratings + recognitions;
    ((trendMap[key] ||= {})[level] = (trendMap[key][level] || 0) + eng);
    const b = ((trendBreakdown[key] ||= {})[level] ||= { likes: 0, comments: 0, bookmarks: 0, ratings: 0, recognitions: 0 });
    b.likes += likes;
    b.comments += comments;
    b.bookmarks += bookmarks;
    b.ratings += ratings;
    b.recognitions += recognitions;
    const list = ((trendProjects[key] ||= {})[level] ||= []);
    if (list.length < 20) list.push({ _id: d._id, title: d.title, sub: `${eng} engagement` });
  }
  // Walk a continuous 6-month axis; fill every level (0 when absent).
  const engagementTrend = [];
  const cursor = new Date(start);
  for (let i = 0; i < 6; i++) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth() + 1}`;
    const row = { month: MONTHS[cursor.getMonth()], projects: {}, breakdown: {} };
    for (const l of levelKeys) {
      row[l] = (trendMap[key] && trendMap[key][l]) || 0;
      row.projects[l] = (trendProjects[key] && trendProjects[key][l]) || [];
      row.breakdown[l] = (trendBreakdown[key] && trendBreakdown[key][l]) || { likes: 0, comments: 0, bookmarks: 0, ratings: 0, recognitions: 0 };
    }
    engagementTrend.push(row);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  res.json({
    totals: { totalProjects, approved, pending, rejected, recognized, totalUsers, students, supervisors },
    levelKeys,
    projectsByDept,
    collaborationsByDept,
    groupStarsByLevel,
    groupEngagementByLevel,
    engagementTrend,
    topProjects: top,
  });
});
