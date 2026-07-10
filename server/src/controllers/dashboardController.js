import asyncHandler from 'express-async-handler';
import Project from '../models/Project.js';
import User from '../models/User.js';
import { platformUsers } from '../utils/platform.js';

// GET /api/supervisor/dashboard
export const supervisorDashboard = asyncHandler(async (req, res) => {
  const me = req.user;
  const users = platformUsers();

  // Scope: projects I supervise or that belong to my department.
  const scope = { $or: [{ supervisor: me._id }, { dept: me.dept }] };
  const projects = await Project.find(scope)
    .populate('authors', 'name role dept set avatarColor')
    .sort('-createdAt');

  const pending = projects.filter((p) => p.status === 'pending');
  const approved = projects.filter((p) => p.status === 'approved');
  const rejected = projects.filter((p) => p.status === 'rejected');

  // Unique students involved across these projects (PRIORITY: students & projects)
  const studentMap = new Map();
  for (const p of projects) {
    for (const a of p.authors) {
      if (a.role === 'student') {
        if (!studentMap.has(String(a._id)))
          studentMap.set(String(a._id), { ...a.toObject(), projects: [] });
        studentMap.get(String(a._id)).projects.push({ _id: p._id, title: p.title, status: p.status });
      }
    }
  }
  const students = [...studentMap.values()];

  // Supervised projects summary (with computed engagement)
  const supervisedProjects = projects.map((p) => ({
    _id: p._id,
    title: p.title,
    status: p.status,
    dept: p.dept,
    set: p.set,
    authors: p.authors.map((a) => ({ _id: a._id, name: a.name, avatarColor: a.avatarColor })),
    likeCount: p.likes.length,
    commentCount: p.comments.length,
    avgRating: p.avgRating(),
    gold: Math.round(p.totalGold(users) * 10) / 10,
    recognized: p.recognized,
    tier: p.totalTier(users),
    createdAt: p.createdAt,
  }));

  // Department analytics (scoped)
  const bySetMap = {};
  projects.forEach((p) => (bySetMap[p.set] = (bySetMap[p.set] || 0) + 1));
  const bySet = Object.entries(bySetMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const statusBreakdown = [
    { name: 'Approved', value: approved.length },
    { name: 'Pending', value: pending.length },
    { name: 'Rejected', value: rejected.length },
  ];

  const topProjects = [...supervisedProjects]
    .filter((p) => p.status === 'approved')
    .sort((a, b) => b.gold - a.gold)
    .slice(0, 5);

  // Recent engagement (latest comments across supervised projects)
  const commenterIds = new Set();
  const allComments = [];
  for (const p of projects) {
    for (const c of p.comments) {
      allComments.push({ projectId: p._id, projectTitle: p.title, user: c.user, text: c.text, createdAt: c.createdAt });
      commenterIds.add(String(c.user));
    }
  }
  allComments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const recent = allComments.slice(0, 8);
  const commenters = await User.find({ _id: { $in: [...commenterIds] } }).select('name role avatarColor');
  const cMap = Object.fromEntries(commenters.map((u) => [String(u._id), u]));
  const recentEngagement = recent.map((c) => ({
    ...c,
    user: cMap[String(c.user)]
      ? { name: cMap[String(c.user)].name, role: cMap[String(c.user)].role, avatarColor: cMap[String(c.user)].avatarColor }
      : { name: 'Unknown', role: 'observer', avatarColor: 'av-amber' },
  }));

  const totalLikes = projects.reduce((s, p) => s + p.likes.length, 0);
  const totalComments = projects.reduce((s, p) => s + p.comments.length, 0);

  // Projects tagged to me specifically (not just dept-scoped) that earned a
  // recognition tier in the last 24h — surfaced on the dashboard as a fresh
  // achievement, then it simply drops off once that window passes.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentRecognitions = projects
    .filter((p) => String(p.supervisor) === String(me._id) && p.recognized && p.recognizedAt && p.recognizedAt >= since)
    .map((p) => ({
      _id: p._id,
      title: p.title,
      tier: p.recognitionTier,
      gold: Math.round(p.totalGold(users) * 10) / 10,
      recognizedAt: p.recognizedAt,
    }))
    .sort((a, b) => new Date(b.recognizedAt) - new Date(a.recognizedAt));

  res.json({
    dept: me.dept,
    totals: {
      supervised: projects.length,
      pending: pending.length,
      approved: approved.length,
      rejected: rejected.length,
      students: students.length,
      likes: totalLikes,
      comments: totalComments,
    },
    students,
    supervisedProjects,
    pendingProjects: supervisedProjects.filter((p) => p.status === 'pending'),
    bySet,
    statusBreakdown,
    topProjects,
    recentEngagement,
    recentRecognitions,
  });
});
