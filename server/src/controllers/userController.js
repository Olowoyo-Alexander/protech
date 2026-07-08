import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import Project from '../models/Project.js';
import Message from '../models/Message.js';
import { platformUsers } from '../utils/platform.js';

const DM_FIELDS = 'name email role dept set level avatarColor matric supervisorTag title';
// Admins and supervisors get the full member directory; everyone else only ever
// sees people through their own conversations (and the contact lookup).
const isPrivileged = (u) => u.role === 'admin' || u.role === 'supervisor';

// Supervisor tag rules: letters + numbers only (no spaces), at least 6 chars,
// and a genuine combination — must contain at least one letter AND one digit.
const TAG_RE = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{6,}$/;
export const isValidTag = (t = '') => TAG_RE.test(t);
// Case-insensitive exact match for a tag value (escaped for use in $regex).
const tagExact = (t) => new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

const VALID_AVATAR_COLORS = ['av-amber', 'av-blue', 'av-green', 'av-red', 'av-purple'];
// An avatar colour is either one of the legacy palette classes or any 6-digit
// hex chosen from the full-spectrum picker.
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const isValidAvatarColor = (c) => VALID_AVATAR_COLORS.includes(c) || HEX_RE.test(String(c || ''));

// Shape a user for the client (mirrors authController's publicUser).
const profileShape = (u) => ({
  _id: u._id,
  title: u.title,
  name: u.name,
  email: u.email,
  role: u.role,
  dept: u.dept,
  set: u.set,
  level: u.level,
  matric: u.matric,
  supervisorTag: u.supervisorTag,
  bio: u.bio,
  verified: u.verified,
  active: u.active,
  avatarColor: u.avatarColor,
});

// Most-recent message time per conversation partner, so the DM list can be
// ordered newest-first (the freshest chat sits at the top, persisting across
// reloads — the client also reorders live on incoming messages).
async function lastMessageTimes(meId) {
  const rows = await Message.aggregate([
    { $match: { $or: [{ from: meId }, { to: meId }] } },
    { $project: { other: { $cond: [{ $eq: ['$from', meId] }, '$to', '$from'] }, createdAt: 1 } },
    { $group: { _id: '$other', last: { $max: '$createdAt' } } },
  ]);
  const map = {};
  rows.forEach((r) => { map[String(r._id)] = r.last; });
  return map;
}

// Sort users so those with recent messages come first (newest → oldest); the
// rest fall back to alphabetical.
function byRecency(lastMap) {
  return (a, b) => {
    const la = lastMap[String(a._id)];
    const lb = lastMap[String(b._id)];
    if (la && lb) return new Date(lb) - new Date(la);
    if (la) return -1;
    if (lb) return 1;
    return (a.name || '').localeCompare(b.name || '');
  };
}

// GET /api/users  — the DM sidebar list, ordered by most recent conversation.
//  - admins / supervisors: the whole directory (minus self).
//  - everyone else: only people they already have a conversation with. New people
//    are reached via the contact lookup (GET /api/users/lookup), WhatsApp-style.
export const listUsers = asyncHandler(async (req, res) => {
  const me = req.user;
  const lastMap = await lastMessageTimes(me._id);
  if (isPrivileged(me)) {
    const users = await User.find({ _id: { $ne: me._id }, deleted: { $ne: true } }).select(DM_FIELDS);
    users.sort(byRecency(lastMap));
    return res.json(users);
  }
  const msgs = await Message.find({ $or: [{ from: me._id }, { to: me._id }] }).select('from to');
  const ids = new Set();
  msgs.forEach((m) => {
    ids.add(String(m.from));
    ids.add(String(m.to));
  });
  ids.delete(String(me._id));
  const users = await User.find({ _id: { $in: [...ids] }, deleted: { $ne: true } }).select(DM_FIELDS);
  users.sort(byRecency(lastMap));
  res.json(users);
});

// GET /api/users/lookup?q=  — find a person to start a new chat with. Students
// are found by exact matric or by name; supervisors can ONLY be found by their
// exclusive tag (a name search never surfaces a supervisor). Used by the "New
// chat" flow so non-privileged users reach people without browsing the directory.
export const lookupUser = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matricRx = new RegExp(`^${esc}$`, 'i'); // matric is an exact identifier
  const tagRx = new RegExp(`^${esc}$`, 'i'); // supervisor tag is exact too
  const nameRx = new RegExp(esc, 'i'); // name can match partially
  const users = await User.find({
    _id: { $ne: req.user._id },
    active: true,
    $or: [
      { matric: matricRx },
      { role: 'supervisor', supervisorTag: tagRx },
      { role: { $ne: 'supervisor' }, name: nameRx },
    ],
  })
    .select(DM_FIELDS)
    .sort('name')
    .limit(8);
  res.json(users);
});

// GET /api/users/supervisor-by-tag?tag=  — resolve a single supervisor by their
// exclusive tag (case-insensitive, exact). Used by the project form to confirm a
// tag before submitting. Returns the supervisor or null.
export const supervisorByTag = asyncHandler(async (req, res) => {
  const tag = String(req.query.tag || '').trim();
  if (!tag) return res.json(null);
  const sup = await User.findOne({
    role: 'supervisor',
    verified: true,
    active: true,
    supervisorTag: tagExact(tag),
  }).select('name title dept avatarColor supervisorTag');
  res.json(sup || null);
});

// GET /api/users/supervisors?q=  (autocomplete source for tagging a supervisor)
// Returns verified, active supervisors whose name matches the query. Limited to
// a handful of results so the dropdown stays usable.
export const searchSupervisors = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filter = { role: 'supervisor', verified: true, active: true };
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.name = rx;
  }
  const sups = await User.find(filter)
    .select('name title dept avatarColor supervisorTag')
    .sort('name')
    .limit(8);
  res.json(sups);
});

// PUT /api/users/me  — update the signed-in user's own profile.
export const updateMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error('Account not found');
  }
  const { name, bio, avatarColor, title, dept, set, level, supervisorTag } = req.body;

  if (name !== undefined) {
    if (!String(name).trim()) {
      res.status(400);
      throw new Error('Name cannot be empty');
    }
    user.name = String(name).trim();
  }
  if (bio !== undefined) user.bio = String(bio).slice(0, 280);
  if (avatarColor !== undefined && isValidAvatarColor(avatarColor)) user.avatarColor = avatarColor;
  // Title applies to supervisors; set & level to students. Department can be set
  // by both students and supervisors (a supervisor may move departments).
  if (user.role === 'supervisor' && title !== undefined) user.title = String(title).trim();
  if ((user.role === 'student' || user.role === 'supervisor') && dept !== undefined)
    user.dept = String(dept).trim();
  if (user.role === 'student' && set !== undefined) user.set = String(set).trim();
  if (user.role === 'student' && level !== undefined) user.level = String(level).trim();

  // Supervisor tag — exclusive handle used for project tagging & messaging.
  if (user.role === 'supervisor' && supervisorTag !== undefined) {
    const tag = String(supervisorTag).trim();
    if (!isValidTag(tag)) {
      res.status(400);
      throw new Error('Tag must be at least 6 characters, letters and numbers only (no spaces), and include both a letter and a number.');
    }
    // Must be unique across supervisors (case-insensitive), ignoring self.
    const taken = await User.findOne({
      _id: { $ne: user._id },
      role: 'supervisor',
      supervisorTag: tagExact(tag),
    });
    if (taken) {
      res.status(409);
      throw new Error('That tag is already taken. Please choose another.');
    }
    user.supervisorTag = tag;
  }

  try {
    await user.save();
  } catch (e) {
    // Backstop for a race that slips past the check above: the unique index on
    // supervisorTag rejects a duplicate. Surface it as a clean conflict.
    if (e && e.code === 11000 && 'supervisorTag' in (e.keyPattern || e.keyValue || {})) {
      res.status(409);
      throw new Error('That tag is already taken. Please choose another.');
    }
    throw e;
  }
  res.json({ user: profileShape(user) });
});

// PUT /api/users/me/password  — change own password (requires current password).
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');
  if (!user || !(await user.matchPassword(currentPassword || ''))) {
    res.status(400);
    throw new Error('Your current password is incorrect');
  }
  if (!newPassword || String(newPassword).length < 6) {
    res.status(400);
    throw new Error('New password must be at least 6 characters');
  }
  user.password = newPassword; // hashed by the pre-save hook
  await user.save();
  res.json({ message: 'Password updated successfully' });
});

// GET /api/users/me/stats  — activity summary for the profile page.
export const getMyStats = asyncHandler(async (req, res) => {
  const me = req.user;
  const mine = await Project.find({ authors: me._id });
  const stats = {
    projects: mine.length,
    approved: mine.filter((p) => p.status === 'approved').length,
    pending: mine.filter((p) => p.status === 'pending').length,
    gold: Math.round(mine.reduce((s, p) => s + p.totalGold(platformUsers()), 0) * 10) / 10,
    recognitions: mine.filter((p) => p.recognized).length,
    likes: mine.reduce((s, p) => s + p.likes.length, 0),
    memberSince: me.createdAt,
  };
  // Supervisors also see what they oversee.
  if (me.role === 'supervisor') {
    stats.supervised = await Project.countDocuments({ supervisor: me._id });
    stats.approvedByMe = await Project.countDocuments({ approvedBy: me._id });
  }
  res.json(stats);
});
