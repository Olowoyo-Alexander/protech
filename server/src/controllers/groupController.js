import asyncHandler from 'express-async-handler';
import Group, { isGroupAdmin, isGroupMember, isGroupInvitee } from '../models/Group.js';
import User from '../models/User.js';
import GroupMessage from '../models/GroupMessage.js';
import GroupRead from '../models/GroupRead.js';
import { notify } from '../utils/notify.js';
import { emitToUser } from '../socket/index.js';

// Matric number format (e.g. ETC/22/001) — used to tell a student matric apart
// from a supervisor's tag in the unified "add participant" field.
const MATRIC_RE = /^[A-Z]{2,4}\/\d{2}\/\d{3}$/;

// Exact, case-insensitive match — mirrors the tag lookup used everywhere else
// a supervisor is found by their exclusive tag (Messages, Projects).
const tagExact = (t) => new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

const MEMBER_SELECT = 'name title role dept set matric avatarColor';

// Allowed group colour themes (24) — must mirror GROUP_THEMES keys on the client.
const GROUP_THEMES = [
  'indigo', 'blue', 'sky', 'cyan', 'teal', 'emerald', 'green', 'lime', 'yellow', 'amber',
  'orange', 'red', 'rose', 'pink', 'fuchsia', 'purple', 'violet', 'slate', 'stone', 'zinc',
  'brown', 'gold', 'mint', 'lavender',
];

const POP = [
  { path: 'creator', select: MEMBER_SELECT },
  { path: 'members', select: MEMBER_SELECT },
  { path: 'admins', select: '_id' },
  { path: 'invites.user', select: MEMBER_SELECT },
  { path: 'invites.invitedBy', select: 'name' },
  { path: 'pinnedMessage', populate: { path: 'from', select: 'name title role avatarColor' } },
];

const findPopulated = (id) => Group.findById(id).populate(POP);

// Group chat is only meant to be on temporarily: it auto-resets to disabled 24h
// after an admin last enabled it. Rather than run a scheduler, we evaluate expiry
// lazily whenever a group is accessed. Returns true if it just flipped off.
const CHAT_TTL_MS = 24 * 60 * 60 * 1000;
async function autoDisableExpiredChat(g) {
  if (!g.chatEnabled) return false;
  // Fall back to createdAt for groups enabled before this field existed.
  const since = g.chatEnabledAt || g.createdAt;
  if (since && Date.now() - new Date(since).getTime() > CHAT_TTL_MS) {
    g.chatEnabled = false;
    g.chatEnabledAt = null;
    await g.save();
    return true;
  }
  return false;
}

// Shape a populated group for the client, tagging each member with whether they
// are a group admin, and exposing the viewer's own role in the group so the UI
// can decide which controls to show.
function serialize(g, user) {
  const adminIds = new Set(g.admins.map((a) => String(a._id || a)));
  const members = g.members.map((m) => ({
    _id: m._id,
    name: m.name,
    title: m.title,
    role: m.role,
    dept: m.dept,
    matric: m.matric,
    avatarColor: m.avatarColor,
    isAdmin: adminIds.has(String(m._id)) || m.role === 'supervisor',
    isCreator: String(m._id) === String(g.creator?._id || g.creator),
  }));

  let myRole = 'none';
  if (isGroupAdmin(g, user)) myRole = 'admin';
  else if (isGroupMember(g, user)) myRole = 'member';
  else if (isGroupInvitee(g, user)) myRole = 'invited';

  return {
    _id: g._id,
    name: g.name,
    description: g.description,
    dept: g.dept,
    theme: g.theme || 'indigo',
    creator: g.creator,
    chatEnabled: g.chatEnabled,
    pinnedMessage: g.pinnedMessage
      ? {
          _id: g.pinnedMessage._id,
          text: g.pinnedMessage.text,
          from: g.pinnedMessage.from,
          createdAt: g.pinnedMessage.createdAt,
        }
      : null,
    members,
    memberCount: members.length,
    // Invites are only meaningful to people who manage the group.
    invites:
      myRole === 'admin'
        ? g.invites.map((i) => ({
            _id: i._id,
            user: i.user,
            invitedBy: i.invitedBy,
            createdAt: i.createdAt,
          }))
        : [],
    myRole,
    createdAt: g.createdAt,
  };
}

// POST /api/groups  { name, description, dept }
export const createGroup = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) {
    res.status(400);
    throw new Error('Please give the group a name');
  }
  const group = await Group.create({
    name,
    description: String(req.body.description || '').trim(),
    dept: String(req.body.dept || req.user.dept || '').trim(),
    creator: req.user._id,
    members: [req.user._id],
    admins: [req.user._id],
  });
  res.status(201).json(serialize(await findPopulated(group._id), req.user));
});

// GET /api/groups  — the groups I'm a member of, plus invitations awaiting me.
export const listMyGroups = asyncHandler(async (req, res) => {
  const [groups, invited, reads] = await Promise.all([
    Group.find({ members: req.user._id }).populate(POP).sort('-updatedAt'),
    Group.find({ 'invites.user': req.user._id }).populate(POP).sort('-updatedAt'),
    GroupRead.find({ user: req.user._id }),
  ]);

  // Unread = chat messages from others since the last time I opened the chat.
  const readMap = Object.fromEntries(reads.map((r) => [String(r.group), r.lastReadAt]));
  const serializedGroups = [];
  for (const g of groups) {
    await autoDisableExpiredChat(g);
    const s = serialize(g, req.user);
    const since = readMap[String(g._id)] || new Date(0);
    s.unreadCount = await GroupMessage.countDocuments({
      group: g._id,
      from: { $ne: req.user._id },
      createdAt: { $gt: since },
    });
    serializedGroups.push(s);
  }

  res.json({
    groups: serializedGroups,
    invites: invited.map((g) => serialize(g, req.user)),
  });
});

// GET /api/groups/:id  — detail (members, invitees only to managers).
export const getGroup = asyncHandler(async (req, res) => {
  const g = await findPopulated(req.params.id);
  if (!g) {
    res.status(404);
    throw new Error('Group not found');
  }
  const allowed =
    isGroupMember(g, req.user) || isGroupInvitee(g, req.user) || req.user.role === 'admin';
  if (!allowed) {
    res.status(403);
    throw new Error('You do not have access to this group');
  }
  await autoDisableExpiredChat(g);
  res.json(serialize(g, req.user));
});

// POST /api/groups/:id/invite  { query } | { matric } | { tag }
// Add a participant from a single field: a matric number resolves to a
// student, anything else is treated as a supervisor's exclusive tag — the
// same resolution used everywhere else a supervisor is found (Messages,
// Projects), not their name (names aren't guaranteed unique). The target
// must accept before joining (requirement 7).
export const inviteMember = asyncHandler(async (req, res) => {
  const g = await Group.findById(req.params.id);
  if (!g) {
    res.status(404);
    throw new Error('Group not found');
  }
  if (!isGroupAdmin(g, req.user)) {
    res.status(403);
    throw new Error('Only group admins can add participants');
  }

  let matric = String(req.body.matric || '').trim();
  let tag = String(req.body.tag || '').trim();
  // Unified single field: detect matric format → student, else supervisor tag.
  const query = String(req.body.query || '').trim();
  if (!matric && !tag && query) {
    if (MATRIC_RE.test(query.toUpperCase())) matric = query.toUpperCase();
    else tag = query;
  }

  let target = null;
  if (matric) {
    // Students are added by matric number.
    target = await User.findOne({ matric, role: 'student', active: true });
    if (!target) {
      res.status(404);
      throw new Error('No active student found with that matric number');
    }
  } else if (tag) {
    // Supervisors are added by their exclusive tag (exact, case-insensitive).
    target = await User.findOne({ role: 'supervisor', verified: true, active: true, supervisorTag: tagExact(tag) });
    if (!target) {
      res.status(404);
      throw new Error('No supervisor found with that tag');
    }
  } else {
    res.status(400);
    throw new Error('Provide a student matric number or a supervisor tag');
  }

  // Only students & supervisors can be group members (requirement 2).
  if (target.role !== 'student' && target.role !== 'supervisor') {
    res.status(400);
    throw new Error('Only students and supervisors can be added to a group');
  }
  if (g.members.some((m) => String(m) === String(target._id))) {
    res.status(400);
    throw new Error(`${target.name} is already a member`);
  }
  if (g.invites.some((i) => String(i.user) === String(target._id))) {
    res.status(400);
    throw new Error(`${target.name} has already been invited`);
  }

  g.invites.push({ user: target._id, invitedBy: req.user._id });
  await g.save();
  await notify({
    user: target._id,
    actor: req.user._id,
    text: `${req.user.name} invited you to join the group "${g.name}"`,
    type: 'group',
  });
  res.status(201).json(serialize(await findPopulated(g._id), req.user));
});

// POST /api/groups/:id/accept  — the invitee joins the group.
export const acceptInvite = asyncHandler(async (req, res) => {
  const g = await Group.findById(req.params.id);
  if (!g) {
    res.status(404);
    throw new Error('Group not found');
  }
  const invite = g.invites.find((i) => String(i.user) === String(req.user._id));
  if (!invite) {
    res.status(404);
    throw new Error('You have no pending invitation to this group');
  }
  g.invites = g.invites.filter((i) => String(i.user) !== String(req.user._id));
  if (!g.members.some((m) => String(m) === String(req.user._id))) {
    g.members.push(req.user._id);
  }
  await g.save();
  await notify({
    user: invite.invitedBy,
    actor: req.user._id,
    text: `${req.user.name} accepted your invitation to "${g.name}"`,
    type: 'group',
  });
  res.json(serialize(await findPopulated(g._id), req.user));
});

// POST /api/groups/:id/decline  — the invitee declines.
export const declineInvite = asyncHandler(async (req, res) => {
  const g = await Group.findById(req.params.id);
  if (!g) {
    res.status(404);
    throw new Error('Group not found');
  }
  const before = g.invites.length;
  g.invites = g.invites.filter((i) => String(i.user) !== String(req.user._id));
  if (g.invites.length === before) {
    res.status(404);
    throw new Error('You have no pending invitation to this group');
  }
  await g.save();
  res.json({ message: 'Invitation declined' });
});

// DELETE /api/groups/:id/members/:userId  — remove a participant (admin only).
export const removeMember = asyncHandler(async (req, res) => {
  const g = await Group.findById(req.params.id);
  if (!g) {
    res.status(404);
    throw new Error('Group not found');
  }
  if (!isGroupAdmin(g, req.user)) {
    res.status(403);
    throw new Error('Only group admins can remove participants');
  }
  const { userId } = req.params;
  if (String(userId) === String(g.creator)) {
    res.status(400);
    throw new Error('The group creator cannot be removed');
  }
  if (!g.members.some((m) => String(m) === String(userId))) {
    res.status(404);
    throw new Error('That user is not a member of this group');
  }
  g.members = g.members.filter((m) => String(m) !== String(userId));
  g.admins = g.admins.filter((a) => String(a) !== String(userId));
  await g.save();
  await notify({
    user: userId,
    actor: req.user._id,
    text: `You were removed from the group "${g.name}"`,
    type: 'group',
  });
  res.json(serialize(await findPopulated(g._id), req.user));
});

// PATCH /api/groups/:id/members/:userId/admin  { admin }
// Promote/demote a participant to/from group admin (requirement 9).
export const setMemberAdmin = asyncHandler(async (req, res) => {
  const g = await Group.findById(req.params.id);
  if (!g) {
    res.status(404);
    throw new Error('Group not found');
  }
  if (!isGroupAdmin(g, req.user)) {
    res.status(403);
    throw new Error('Only group admins can change admin roles');
  }
  const { userId } = req.params;
  if (!g.members.some((m) => String(m) === String(userId))) {
    res.status(404);
    throw new Error('That user is not a member of this group');
  }
  if (String(userId) === String(g.creator)) {
    res.status(400);
    throw new Error('The group creator is always an admin');
  }
  const makeAdmin = Boolean(req.body.admin);
  const isAdmin = g.admins.some((a) => String(a) === String(userId));
  if (makeAdmin && !isAdmin) g.admins.push(userId);
  else if (!makeAdmin && isAdmin) g.admins = g.admins.filter((a) => String(a) !== String(userId));
  await g.save();
  await notify({
    user: userId,
    actor: req.user._id,
    text: makeAdmin
      ? `You are now an admin of the group "${g.name}"`
      : `You are no longer an admin of the group "${g.name}"`,
    type: 'group',
  });
  res.json(serialize(await findPopulated(g._id), req.user));
});

// PATCH /api/groups/:id  { name, description }
// Group leaders (admins) can rename the group and edit its description/info.
export const updateGroup = asyncHandler(async (req, res) => {
  const g = await Group.findById(req.params.id);
  if (!g) {
    res.status(404);
    throw new Error('Group not found');
  }
  if (!isGroupAdmin(g, req.user)) {
    res.status(403);
    throw new Error('Only group admins can edit the group');
  }
  if (req.body.name !== undefined) {
    const name = String(req.body.name || '').trim();
    if (!name) {
      res.status(400);
      throw new Error('Please give the group a name');
    }
    g.name = name;
  }
  if (req.body.description !== undefined) {
    g.description = String(req.body.description || '').trim();
  }
  await g.save();
  res.json(serialize(await findPopulated(g._id), req.user));
});

// PATCH /api/groups/:id/chat  — toggle group chat on/off (admin only).
export const toggleChat = asyncHandler(async (req, res) => {
  const g = await Group.findById(req.params.id);
  if (!g) {
    res.status(404);
    throw new Error('Group not found');
  }
  if (!isGroupAdmin(g, req.user)) {
    res.status(403);
    throw new Error('Only group admins can change the chat setting');
  }
  g.chatEnabled = !g.chatEnabled;
  // Stamp the enable time so it can auto-reset to disabled after 24h; clear it
  // when turning chat off.
  g.chatEnabledAt = g.chatEnabled ? new Date() : null;
  await g.save();
  res.json(serialize(await findPopulated(g._id), req.user));
});

// PATCH /api/groups/:id/theme  { theme }  — set the group's colour theme.
// Admin only; the theme drives the group's tag colour on the feed.
export const setGroupTheme = asyncHandler(async (req, res) => {
  const theme = String(req.body.theme || '').trim();
  // A theme is either a preset key or any 6-digit hex (full-spectrum picker).
  const isHex = /^#[0-9a-fA-F]{6}$/.test(theme);
  if (!isHex && !GROUP_THEMES.includes(theme)) {
    res.status(400);
    throw new Error('Unknown theme colour');
  }
  const g = await Group.findById(req.params.id);
  if (!g) {
    res.status(404);
    throw new Error('Group not found');
  }
  if (!isGroupAdmin(g, req.user)) {
    res.status(403);
    throw new Error('Only group admins can change the group colour');
  }
  g.theme = theme;
  await g.save();
  res.json(serialize(await findPopulated(g._id), req.user));
});

// Reply-quote preview fields — mirrors the DM convention in messageController.js.
const REPLY_POP = { path: 'replyTo', select: 'from text', populate: { path: 'from', select: 'name' } };

// GET /api/groups/:id/messages  — group chat history (members only).
export const listGroupMessages = asyncHandler(async (req, res) => {
  const g = await Group.findById(req.params.id);
  if (!g) {
    res.status(404);
    throw new Error('Group not found');
  }
  if (!isGroupMember(g, req.user)) {
    res.status(403);
    throw new Error('Only group members can read the chat');
  }
  await autoDisableExpiredChat(g);
  const messages = await GroupMessage.find({ group: g._id })
    .populate('from', 'name role avatarColor')
    .populate(REPLY_POP)
    .sort('createdAt')
    .limit(200);
  // Opening the chat marks it read up to now (clears the unread badge).
  await GroupRead.findOneAndUpdate(
    { user: req.user._id, group: g._id },
    { lastReadAt: new Date() },
    { upsert: true, setDefaultsOnInsert: true }
  );
  res.json({ chatEnabled: g.chatEnabled, messages });
});

// POST /api/groups/:id/messages  { text, replyTo? }  — post to group chat (members only).
export const sendGroupMessage = asyncHandler(async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) {
    res.status(400);
    throw new Error('Message cannot be empty');
  }
  const g = await Group.findById(req.params.id);
  if (!g) {
    res.status(404);
    throw new Error('Group not found');
  }
  if (!isGroupMember(g, req.user)) {
    res.status(403);
    throw new Error('Only group members can post to the chat');
  }
  await autoDisableExpiredChat(g);
  if (!g.chatEnabled) {
    res.status(403);
    throw new Error('Group chat is disabled');
  }
  let replyTo = null;
  if (req.body.replyTo) {
    // A reply must point at a message actually in this same group.
    const original = await GroupMessage.findOne({ _id: req.body.replyTo, group: g._id });
    if (original) replyTo = original._id;
  }
  const msg = await GroupMessage.create({ group: g._id, from: req.user._id, text, replyTo });
  // Bump the group's updatedAt so the freshest conversation sorts to the top of
  // everyone's group list (persists the reorder across reloads).
  await Group.updateOne({ _id: g._id }, { $currentDate: { updatedAt: true } });
  const populated = await GroupMessage.findById(msg._id).populate('from', 'name role avatarColor').populate(REPLY_POP);

  // Push to every other member in real time.
  for (const m of g.members) {
    if (String(m) === String(req.user._id)) continue;
    emitToUser(m, 'groupMessage', { groupId: String(g._id), message: populated });
  }
  res.status(201).json(populated);
});

// DELETE /api/groups/:id/messages/:messageId  — permanently delete a group
// chat message. No trace is left for other members: the row is removed
// outright, not flagged, so no one sees any "message deleted" indicator. The
// sender, or a group admin (WhatsApp-style moderation), may delete it. If it
// was the pinned message, it's unpinned too.
export const deleteGroupMessage = asyncHandler(async (req, res) => {
  const g = await Group.findById(req.params.id);
  if (!g) {
    res.status(404);
    throw new Error('Group not found');
  }
  const msg = await GroupMessage.findOne({ _id: req.params.messageId, group: g._id });
  if (!msg) {
    res.status(404);
    throw new Error('Message not found');
  }
  const mine = String(msg.from) === String(req.user._id);
  if (!mine && !isGroupAdmin(g, req.user)) {
    res.status(403);
    throw new Error('Only the sender or a group admin can delete this message');
  }
  let unpinned = false;
  if (g.pinnedMessage && String(g.pinnedMessage) === String(msg._id)) {
    g.pinnedMessage = null;
    await g.save();
    unpinned = true;
  }
  await GroupMessage.deleteOne({ _id: msg._id });

  for (const m of g.members) {
    if (String(m) === String(req.user._id)) continue;
    emitToUser(m, 'groupMessageDeleted', { groupId: String(g._id), messageId: String(msg._id), unpinned });
  }
  res.json({ _id: msg._id, unpinned });
});

// PATCH /api/groups/:id/pin  { messageId }  — pin (or, with null, unpin) a chat
// message to the top of the group. Admin only (WhatsApp-style).
export const pinMessage = asyncHandler(async (req, res) => {
  const g = await Group.findById(req.params.id);
  if (!g) {
    res.status(404);
    throw new Error('Group not found');
  }
  if (!isGroupAdmin(g, req.user)) {
    res.status(403);
    throw new Error('Only a group admin can pin messages');
  }
  const { messageId } = req.body;
  if (messageId) {
    const msg = await GroupMessage.findOne({ _id: messageId, group: g._id });
    if (!msg) {
      res.status(404);
      throw new Error('That message is not part of this group');
    }
    g.pinnedMessage = msg._id;
  } else {
    g.pinnedMessage = null; // unpin
  }
  await g.save();
  res.json(serialize(await findPopulated(g._id), req.user));
});

// DELETE /api/groups/:id  — delete the whole group (admin/creator only).
export const deleteGroup = asyncHandler(async (req, res) => {
  const g = await Group.findById(req.params.id);
  if (!g) {
    res.status(404);
    throw new Error('Group not found');
  }
  if (!isGroupAdmin(g, req.user) && String(g.creator) !== String(req.user._id)) {
    res.status(403);
    throw new Error('Only a group admin can delete this group');
  }
  await g.deleteOne();
  res.json({ message: 'Group deleted' });
});
