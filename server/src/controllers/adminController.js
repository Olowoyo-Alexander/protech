import asyncHandler from 'express-async-handler';
import crypto from 'crypto';
import User from '../models/User.js';
import Project from '../models/Project.js';
import Group from '../models/Group.js';
import { notify } from '../utils/notify.js';
import { sendPasswordResetEmail } from '../utils/email.js';

const publicUser = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  dept: u.dept,
  set: u.set,
  level: u.level,
  matric: u.matric,
  supervisorTag: u.supervisorTag,
  verified: u.verified,
  active: u.active,
  avatarColor: u.avatarColor,
  createdAt: u.createdAt,
});

// GET /api/admin/users  (?q=&role=)
export const listUsers = asyncHandler(async (req, res) => {
  const { q, role } = req.query;
  const filter = { deleted: { $ne: true } }; // anonymized accounts never listed
  if (role && role !== 'All') filter.role = role;
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { dept: rx }, { matric: rx }];
  }
  const users = await User.find(filter).sort('-createdAt');

  // project counts per user (as author)
  const counts = await Project.aggregate([
    { $unwind: '$authors' },
    { $group: { _id: '$authors', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));

  res.json(users.map((u) => ({ ...publicUser(u), projectCount: countMap[String(u._id)] || 0 })));
});

// PATCH /api/admin/users/:id/role  { role }
export const changeRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!['observer', 'student', 'supervisor', 'admin'].includes(role)) {
    res.status(400);
    throw new Error('Invalid role');
  }
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  if (String(user._id) === String(req.user._id)) {
    res.status(400);
    throw new Error('You cannot change your own role');
  }
  user.role = role;
  if (role === 'supervisor' || role === 'admin') user.verified = true;
  await user.save();
  await notify({
    user: user._id,
    actor: req.user._id,
    text: `An administrator updated your role to ${role}.`,
    type: 'approval',
  });
  res.json(publicUser(user));
});

// PATCH /api/admin/users/:id/password  — reset a user's password to a new random
// temporary one, returned once so the admin can share it. Admins cannot view an
// existing password (it's stored only as a bcrypt hash), so this replaces it.
export const resetUserPassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  if (String(user._id) === String(req.user._id)) {
    res.status(400);
    throw new Error('Use your own profile to change your password');
  }
  // Readable, mixed temporary password (letters + digits, > 6 chars).
  const temp = 'Tmp-' + Math.random().toString(36).slice(2, 8) + Math.floor(10 + Math.random() * 89);
  user.password = temp; // hashed by the pre-save hook
  await user.save();
  // Email the temp password to the user so they can sign in (fire-and-forget;
  // the admin still gets it on screen to share directly if needed).
  sendPasswordResetEmail(user.email, user.name, temp);
  res.json({ password: temp });
});

// PATCH /api/admin/users/:id/matric  { matric }  — edit a student's matric number
export const setMatric = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  if (user.role !== 'student') {
    res.status(400);
    throw new Error('Only students have a matric number');
  }
  const matric = String(req.body.matric || '').trim().toUpperCase();
  if (!matric) {
    res.status(400);
    throw new Error('Matric number cannot be empty');
  }
  user.matric = matric;
  await user.save();
  res.json(publicUser(user));
});

// PATCH /api/admin/users/:id/verify
export const verifyUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  user.verified = true;
  user.verifyCode = undefined;
  user.verifyExpires = undefined;
  await user.save();
  res.json(publicUser(user));
});

// PATCH /api/admin/users/:id/active  { active }
export const setActive = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  if (String(user._id) === String(req.user._id)) {
    res.status(400);
    throw new Error('You cannot deactivate your own account');
  }
  user.active = Boolean(req.body.active);
  await user.save();
  res.json(publicUser(user));
});

// DELETE /api/admin/users/:id
// We anonymize rather than hard-delete: any project the account authored (or
// supervised) must remain and stay attributed to a real name. So the record is
// kept but stripped of everything that lets it function or resurface — it can't
// sign in, and it's filtered out of every directory, search and messaging list.
// Its display name is preserved (shown as "(inactive)" on its projects), while
// its unique identifiers (email, matric, supervisor tag) are freed for reuse.
export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  if (String(user._id) === String(req.user._id)) {
    res.status(400);
    throw new Error('You cannot delete your own account');
  }
  if (user.deleted) {
    return res.json({ message: 'User deleted' });
  }
  user.deleted = true;
  user.deletedAt = new Date();
  user.active = false;
  user.verified = false;
  // Free the unique identifiers so someone else can register with them again.
  user.email = `deleted+${user._id}@deleted.invalid`;
  user.matric = '';
  user.supervisorTag = '';
  user.verifyCode = undefined;
  user.verifyExpires = undefined;
  // Invalidate the password (login is also blocked by the `deleted` flag).
  user.password = crypto.randomBytes(24).toString('hex');
  await user.save();
  res.json({ message: 'User deleted' });
});

// GET /api/admin/overview  — platform-wide analytics
export const overview = asyncHandler(async (req, res) => {
  // Anonymized (deleted) accounts are excluded from every user statistic.
  const live = { deleted: { $ne: true } };
  const [totalUsers, students, supervisors, observers, admins] = await Promise.all([
    User.countDocuments(live),
    User.countDocuments({ ...live, role: 'student' }),
    User.countDocuments({ ...live, role: 'supervisor' }),
    User.countDocuments({ ...live, role: 'observer' }),
    User.countDocuments({ ...live, role: 'admin' }),
  ]);

  const [totalProjects, approved, pending, rejected] = await Promise.all([
    Project.countDocuments(),
    Project.countDocuments({ status: 'approved' }),
    Project.countDocuments({ status: 'pending' }),
    Project.countDocuments({ status: 'rejected' }),
  ]);

  const groups = await Group.countDocuments();

  const byDept = await Project.aggregate([
    { $group: { _id: '$dept', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const usersByRole = [
    { name: 'Students', value: students },
    { name: 'Supervisors', value: supervisors },
    { name: 'Guests', value: observers },
    { name: 'Admins', value: admins },
  ];

  // Projects created over the last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  const growthRaw = await Project.aggregate([
    { $match: { createdAt: { $gte: sixMonthsAgo } } },
    {
      $group: {
        _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.y': 1, '_id.m': 1 } },
  ]);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const growth = growthRaw.map((g) => ({ name: MONTHS[g._id.m - 1], count: g.count }));

  const engagement = await Project.aggregate([
    {
      $group: {
        _id: null,
        likes: { $sum: { $size: '$likes' } },
        comments: { $sum: { $size: '$comments' } },
        bookmarks: { $sum: { $size: '$bookmarks' } },
        ratings: { $sum: { $size: '$ratings' } },
      },
    },
  ]);

  const recentUsers = await User.find(live).sort('-createdAt').limit(5);
  const recentProjects = await Project.find().sort('-createdAt').limit(5).populate('authors', 'name');

  res.json({
    totals: {
      totalUsers,
      students,
      supervisors,
      observers,
      admins,
      totalProjects,
      approved,
      pending,
      rejected,
      groups,
    },
    usersByRole,
    byDept: byDept.map((d) => ({ name: d._id, count: d.count })),
    statusBreakdown: [
      { name: 'Approved', value: approved },
      { name: 'Pending', value: pending },
      { name: 'Rejected', value: rejected },
    ],
    growth,
    engagement: engagement[0] || { likes: 0, comments: 0, bookmarks: 0, ratings: 0 },
    recentUsers: recentUsers.map(publicUser),
    recentProjects: recentProjects.map((p) => ({
      _id: p._id,
      title: p.title,
      status: p.status,
      dept: p.dept,
      authors: p.authors.map((a) => a.name),
      createdAt: p.createdAt,
    })),
  });
});

// GET /api/admin/groups  — every group with its basic info (admin visibility).
export const listGroups = asyncHandler(async (req, res) => {
  const groups = await Group.find()
    .sort('-createdAt')
    .populate('creator', 'name role');
  res.json(
    groups.map((g) => ({
      _id: g._id,
      name: g.name,
      dept: g.dept,
      creator: g.creator ? { _id: g.creator._id, name: g.creator.name, role: g.creator.role } : null,
      memberCount: g.members.length,
      adminCount: g.admins.length,
      chatEnabled: g.chatEnabled,
      createdAt: g.createdAt,
    }))
  );
});
