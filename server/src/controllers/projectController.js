import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Project, { tierRank, tierForGold } from '../models/Project.js';
import User from '../models/User.js';
import Group, { isGroupAdmin, isGroupMember } from '../models/Group.js';
import { notify } from '../utils/notify.js';
import {
  sendProjectApprovedEmail,
  sendProjectRejectedEmail,
  sendSupervisorTagEmail,
} from '../utils/email.js';
import { uploadToCloud } from '../utils/uploadToCloud.js';
import { platformUsers, touchPlatformUsers } from '../utils/platform.js';

const POP = [
  { path: 'authors', select: 'name role dept set avatarColor deleted' },
  { path: 'supervisor', select: 'name title role avatarColor deleted' },
  { path: 'approvedBy', select: 'name title role avatarColor deleted' },
  { path: 'comments.user', select: 'name role avatarColor deleted' },
  { path: 'contributions.user', select: 'name role avatarColor deleted' },
  { path: 'extends', select: 'title status' },
  { path: 'group', select: 'name dept theme' },
];

// Shape a project for the client, with computed fields relative to the viewer.

// --- Search engine (relevance + fuzzy) -------------------------------------
// Levenshtein edit distance → similarity ratio (0..1), used for typo tolerance.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}
const simRatio = (a, b) => (a === b ? 1 : 1 - levenshtein(a, b) / Math.max(a.length, b.length));

// Score a project against a query: weights title highest, then abstract, then
// problem. Rewards exact phrase hits, whole-word and partial matches, and
// tolerates typos via fuzzy similarity. Returns 0 when there's no real match.
function relevanceScore(q, doc) {
  const query = q.toLowerCase().trim();
  const tokens = query.split(/\W+/).filter(Boolean);
  if (!tokens.length) return 0;
  const fields = [
    { text: (doc.title || '').toLowerCase(), weight: 6 },
    { text: (doc.summary || '').toLowerCase(), weight: 3 }, // abstract
    { text: (doc.problem || '').toLowerCase(), weight: 2 },
  ];
  let score = 0;
  for (const f of fields) {
    if (query.length > 2 && f.text.includes(query)) score += f.weight * 3; // exact phrase
    const words = f.text.split(/\W+/).filter(Boolean);
    if (!words.length) continue;
    for (const qt of tokens) {
      let best = 0;
      for (const w of words) {
        if (w === qt) { best = 1; break; }
        if (qt.length >= 3 && w.includes(qt)) best = Math.max(best, 0.85); // partial
        else {
          const r = simRatio(qt, w);
          if (r >= 0.75) best = Math.max(best, r * 0.7); // fuzzy / typo
        }
      }
      score += f.weight * best;
    }
  }
  return score;
}

function serialize(p, userId) {
  const o = p.toObject({ virtuals: false });
  touchPlatformUsers();
  const users = platformUsers();
  // Total stars = intentional supervisor stars + background engagement stars,
  // scaled to the platform population.
  const gold = p.totalGold(users);
  o.gold = Math.round(gold * 10) / 10; // one-decimal display
  o.supervisorGold = p.gold(); // intentional supervisor stars alone
  o.tier = tierForGold(gold); // '' | 'silver' | 'gold' | 'diamond'
  o.avgRating = p.avgRating();
  o.spotlightRecommended = !!(p.spotlight && p.spotlight.recommended);
  // Whether the project has reached Gold recognition (gates the spotlight action).
  o.spotlightEligible = tierRank(o.tier) >= tierRank('gold');
  o.likeCount = p.likes.length;
  o.bookmarkCount = p.bookmarks.length;
  o.commentCount = p.comments.length;
  o.contributionCount = p.contributions.length;
  if (userId) {
    const uid = String(userId);
    o.liked = p.likes.some((l) => String(l) === uid);
    o.bookmarked = p.bookmarks.some((b) => String(b) === uid);
    o.myRating = p.ratings.find((r) => String(r.user) === uid)?.value || 0;
  }
  return o;
}

async function findPopulated(id) {
  return Project.findById(id).populate(POP);
}

// Keep a parent project's approved-extension tally in sync (drives its
// collaboration stars). Decrement is floored at zero so it can never go
// negative if events ever get out of step.
const incParentExtensions = (extendsId) =>
  extendsId && Project.updateOne({ _id: extendsId }, { $inc: { extensionCount: 1 } });
const decParentExtensions = (extendsId) =>
  extendsId && Project.updateOne({ _id: extendsId, extensionCount: { $gt: 0 } }, { $inc: { extensionCount: -1 } });

// GET /api/projects  (?q=&dept=&set=&status=&sort=&scope=)
export const listProjects = asyncHandler(async (req, res) => {
  const { q, dept, set, status, sort = 'recent', scope } = req.query;
  const user = req.user;

  // Visibility: everyone sees approved; authors also see their own;
  // supervisors/admins also see pending/rejected.
  const visibility = [{ status: 'approved' }];
  if (user) {
    visibility.push({ authors: user._id });
    if (user.role === 'supervisor' || user.role === 'admin')
      visibility.push({ status: { $in: ['pending', 'rejected'] } });
  }

  // A hidden project is withheld from the feed for EVERYONE (its separate
  // collaboration/extension projects are unaffected — they have their own flag).
  // Supervisors still manage/unhide it from their dashboard or the project page.
  // Rejected projects never appear on the feed (for anyone). Authors still
  // manage/resubmit them from "My Projects".
  // Drafts (group projects still being built) never appear on the main feed —
  // only inside their group, until they're submitted for review.
  const and = [{ $or: visibility }, { hidden: { $ne: true } }, { status: { $nin: ['rejected', 'draft'] } }];
  if (dept && dept !== 'All') and.push({ dept });
  if (set && set !== 'All') and.push({ set });
  if (status && status !== 'All') and.push({ status });
  // Department scope ("My Dept" tab): restrict strictly to the viewer's own
  // department. A viewer with no department sees nothing here (matching no dept),
  // so the dept side never leaks other departments' projects.
  if (scope === 'dept') and.push({ dept: user?.dept || '\0' });

  const docs = await Project.find({ $and: and }).populate(POP);

  // When searching, rank by relevance (title > abstract > problem) with fuzzy /
  // typo tolerance, so similar/clashing topics surface even when worded
  // differently or misspelled. Otherwise use the chosen sort.
  let projects;
  if (q && q.trim()) {
    projects = docs
      .map((p) => ({ p, score: relevanceScore(q, p) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => serialize(x.p, user?._id));
  } else {
    projects = docs.map((p) => serialize(p, user?._id));
    if (sort === 'top') projects.sort((a, b) => b.gold - a.gold);
    else if (sort === 'liked') projects.sort((a, b) => b.likeCount - a.likeCount);
    else projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  res.json(projects);
});

// GET /api/projects/:id
export const getProject = asyncHandler(async (req, res) => {
  const p = await findPopulated(req.params.id);
  if (!p) {
    res.status(404);
    throw new Error('Project not found');
  }
  const data = serialize(p, req.user?._id);

  // Attach the extensions/improvements built on this project. Visible: approved
  // ones to everyone, plus the viewer's own (and all for supervisors/admins).
  const visible = [{ status: 'approved' }];
  if (req.user) {
    visible.push({ authors: req.user._id });
    if (req.user.role === 'supervisor' || req.user.role === 'admin')
      visible.push({ status: { $in: ['pending', 'rejected'] } });
  }
  const exts = await Project.find({ extends: p._id, $or: visible })
    .populate({ path: 'authors', select: 'name role avatarColor' })
    .select('title status authors createdAt')
    .sort({ createdAt: -1 });
  data.extensions = exts.map((e) => ({
    _id: e._id,
    title: e.title,
    status: e.status,
    authors: e.authors,
    createdAt: e.createdAt,
  }));

  // Build the collaboration lineage: the chain of projects from the original
  // root down to (and including) this one. Each step is one collaboration that
  // extended the previous project. Ordered oldest → newest, so the original
  // comes first and this project's spot in the chain is obvious.
  const lineage = [];
  const seen = new Set();
  let cursor = p;
  while (cursor) {
    if (seen.has(String(cursor._id))) break; // guard against accidental cycles
    seen.add(String(cursor._id));
    lineage.unshift({
      _id: cursor._id,
      title: cursor.title,
      status: cursor.status,
      authors: cursor.authors, // already populated (name/role/avatarColor)
      createdAt: cursor.createdAt,
      current: String(cursor._id) === String(p._id),
    });
    if (!cursor.extends) break;
    cursor = await Project.findById(cursor.extends).populate({
      path: 'authors',
      select: 'name role avatarColor',
    });
  }

  // Longest run of further improvements built beyond this project, so the
  // client can show "Step X of Y" even when descendants extend the chain.
  async function deepestDescendant(id, depth, guard) {
    if (guard.has(String(id))) return depth;
    guard.add(String(id));
    const children = await Project.find({ extends: id }).select('_id');
    let best = depth;
    for (const c of children) best = Math.max(best, await deepestDescendant(c._id, depth + 1, guard));
    return best;
  }
  const forward = await deepestDescendant(p._id, 0, new Set());

  data.chain = lineage;
  data.chainPosition = lineage.length; // 1-based position of this project
  data.chainTotal = lineage.length + forward;

  // Draft group projects: tell the viewer whether they can add a contribution
  // (any group member) and whether they can submit it (an author or group admin).
  if (p.status === 'draft' && p.group) {
    const grp = await Group.findById(p.group._id || p.group);
    const isAuthor = p.authors.some((a) => String(a._id || a) === String(req.user?._id));
    data.canContribute = grp ? isGroupMember(grp, req.user) : false;
    data.canSubmitDraft = grp ? isAuthor || isGroupAdmin(grp, req.user) : isAuthor;
  }

  res.json(data);
});

// GET /api/projects/group/:groupId — projects posted under a group. Group
// members (and admins) see them even before approval, so a freshly submitted
// group project shows up in the group right away; rejected/hidden are excluded.
// Outsiders only see the group's approved projects.
export const groupProjects = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.groupId);
  if (!group) {
    res.status(404);
    throw new Error('Group not found');
  }
  const member = isGroupMember(group, req.user) || req.user.role === 'admin';
  const statusFilter = member ? { $ne: 'rejected' } : 'approved';
  const docs = await Project.find({
    group: group._id,
    status: statusFilter,
    hidden: { $ne: true },
  })
    .populate(POP)
    .sort('-createdAt');
  res.json(docs.map((p) => serialize(p, req.user?._id)));
});

// POST /api/projects  (multipart, "document" file required)
export const createProject = asyncHandler(async (req, res) => {
  const {
    title, summary, problem, methodology, limitations = '', dept, set,
    extends: extendsId, supervisor: supervisorId, supervisorTag, group: groupId,
    saveAsDraft,
  } = req.body;
  if (!title || !summary || !problem || !methodology || !dept || !set) {
    res.status(400);
    throw new Error('Please fill in all required fields');
  }
  // Documentation is mandatory for every real submission — projects and
  // collaborations — but NOT for a group draft: a draft is built up from
  // members' text contributions first, and a document is attached later,
  // by the author or a group admin, before it's actually submitted.
  const wantsDraft = (saveAsDraft === 'true' || saveAsDraft === true) && !!groupId;
  if (!req.file && !wantsDraft) {
    res.status(400);
    throw new Error('Please attach a documentation file before submitting');
  }

  // If this is an improvement/extension of an existing project, link to it.
  // The original is never modified — the extension stands alone.
  let parent = null;
  if (extendsId) {
    parent = await Project.findById(extendsId);
    if (!parent) {
      res.status(400);
      throw new Error('The project being extended could not be found');
    }
    // Only approved projects are open to collaboration — a pending (or draft)
    // project isn't public yet, and a rejected one is closed for good.
    if (parent.status !== 'approved') {
      res.status(403);
      throw new Error(
        parent.status === 'rejected'
          ? 'This project was rejected and is closed to collaboration'
          : 'This project must be approved before it can be collaborated on'
      );
    }
    if (parent.locked) {
      res.status(403);
      throw new Error('This project is locked for collaboration by the supervisor');
    }
  }

  // The student tags their supervisor by the supervisor's exclusive tag — the
  // only way to tag a supervisor. Resolve by tag (case-insensitive, exact); also
  // accept a resolved id from the form for convenience. A valid supervisor is
  // required.
  let supervisor = null;
  if (supervisorTag && String(supervisorTag).trim()) {
    const exact = new RegExp(`^${String(supervisorTag).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    supervisor = await User.findOne({ role: 'supervisor', verified: true, supervisorTag: exact });
  } else if (supervisorId && mongoose.isValidObjectId(supervisorId)) {
    supervisor = await User.findOne({ _id: supervisorId, role: 'supervisor', verified: true });
  }
  // Supervisors submitting their own work don't need to tag anyone — they're
  // listed as the supervisor by default. Students must tag a valid supervisor.
  if (!supervisor) {
    if (req.user.role === 'supervisor') {
      supervisor = req.user;
    } else {
      res.status(400);
      throw new Error("Please enter a valid supervisor tag — ask your supervisor for their tag.");
    }
  }

  // Optionally tag the project to a group. Only an admin of that group may post
  // a project under it; the project still follows the normal approval flow.
  let group = null;
  if (groupId && mongoose.isValidObjectId(groupId)) {
    group = await Group.findById(groupId);
    if (!group) {
      res.status(400);
      throw new Error('The selected group could not be found');
    }
    if (!isGroupAdmin(group, req.user)) {
      res.status(403);
      throw new Error('Only a group admin can post a project under that group');
    }
  }

  let docUrl = '';
  let docName = '';
  if (req.file) {
    const uploaded = await uploadToCloud(req.file);
    docName = req.file.originalname;
    if (uploaded) docUrl = uploaded.url; // empty in dev when Cloudinary isn't configured
  }

  // A group project can be saved as a draft so the group's members can add their
  // contributions before it's submitted for review (only valid under a group).
  const asDraft = (saveAsDraft === 'true' || saveAsDraft === true) && !!group;

  // A supervisor publishing their own work doesn't go through the approval
  // process — it's approved on submission (they're the reviewing authority).
  const supervisorPublished = req.user.role === 'supervisor' && !asDraft;

  const project = await Project.create({
    title,
    summary,
    problem,
    methodology,
    limitations,
    dept,
    set,
    authors: [req.user._id],
    supervisor: supervisor?._id,
    docUrl,
    docName,
    status: asDraft ? 'draft' : supervisorPublished ? 'approved' : 'pending',
    approvedBy: supervisorPublished ? req.user._id : null,
    approvedAt: supervisorPublished ? new Date() : null,
    extends: parent?._id || null,
    extendsTitle: parent?.title || '',
    group: group?._id || null,
  });

  // Notify the supervisor only on a real submission that needs review — a draft
  // hasn't been submitted yet, and a supervisor's own publish is auto-approved.
  if (supervisor && !asDraft && !supervisorPublished) {
    await notify({
      user: supervisor._id,
      actor: req.user._id,
      text: `New project submitted for review: "${title}" by ${req.user.name}`,
      type: 'submission',
      project: project._id,
    });
    // Email the tagged supervisor (fire-and-forget). `supervisor` is a full doc.
    sendSupervisorTagEmail(supervisor.email, supervisor.name, req.user.name, title);
  }

  // A supervisor's own extension is auto-approved, so it counts as a realised
  // collaboration on the parent right away (student extensions count on approval).
  if (parent && project.status === 'approved') await incParentExtensions(parent._id);

  // Let the original authors know their project inspired an improvement.
  if (parent) {
    for (const a of parent.authors) {
      if (String(a) === String(req.user._id)) continue;
      await notify({
        user: a,
        actor: req.user._id,
        text: `${req.user.name} created an improvement extending your project "${parent.title}"`,
        type: 'collab',
        project: project._id,
      });
    }
  }

  const populated = await findPopulated(project._id);
  res.status(201).json(serialize(populated, req.user._id));
});

// PUT /api/projects/:id  (author edits; resets to pending)
export const updateProject = asyncHandler(async (req, res) => {
  const p = await Project.findById(req.params.id);
  if (!p) {
    res.status(404);
    throw new Error('Project not found');
  }
  const isAuthor = p.authors.some((a) => String(a) === String(req.user._id));
  if (!isAuthor && req.user.role !== 'supervisor' && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Only authors can edit this project');
  }
  const fields = ['title', 'summary', 'problem', 'methodology', 'limitations', 'dept', 'set'];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) p[f] = req.body[f];
  });
  if (req.file) {
    const uploaded = await uploadToCloud(req.file);
    p.docName = req.file.originalname;
    if (uploaded) p.docUrl = uploaded.url;
  }
  const wasApproved = p.status === 'approved';
  // A draft stays a draft through ordinary edits (attaching the document,
  // tweaking a field) — it only leaves draft via the explicit /submit action,
  // which is also what folds contributors into the author list.
  if (isAuthor && p.status !== 'draft') p.status = 'pending'; // re-review after author edit
  await p.save();
  // An approved extension pulled back to pending no longer counts on its parent.
  if (p.extends && wasApproved && p.status !== 'approved') await decParentExtensions(p.extends);
  res.json(serialize(await findPopulated(p._id), req.user._id));
});

// DELETE /api/projects/:id
export const deleteProject = asyncHandler(async (req, res) => {
  const p = await Project.findById(req.params.id);
  if (!p) {
    res.status(404);
    throw new Error('Project not found');
  }
  const isAuthor = p.authors.some((a) => String(a) === String(req.user._id));
  if (!isAuthor && req.user.role !== 'supervisor' && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Not authorized to delete this project');
  }
  const wasApprovedExtension = p.extends && p.status === 'approved';
  const parentId = p.extends;
  await p.deleteOne();
  if (wasApprovedExtension) await decParentExtensions(parentId);
  res.json({ message: 'Project deleted' });
});

// PATCH /api/projects/:id/approve  (supervisor)
export const approveProject = asyncHandler(async (req, res) => {
  const p = await Project.findById(req.params.id);
  if (!p) {
    res.status(404);
    throw new Error('Project not found');
  }
  const wasApproved = p.status === 'approved';
  p.status = 'approved';
  p.rejectionReason = '';
  p.approvedBy = req.user._id;
  p.approvedAt = new Date();
  p.reviewedBy = req.user._id;
  await p.save();
  // A newly-approved extension becomes a realised collaboration on its parent.
  if (p.extends && !wasApproved) await incParentExtensions(p.extends);
  for (const a of p.authors) {
    await notify({
      user: a,
      actor: req.user._id,
      text: `Your project "${p.title}" has been approved! 🎉`,
      type: 'approval',
      project: p._id,
    });
  }
  // Email the authors too (fire-and-forget — mail never blocks the response).
  const approvedAuthors = await User.find({ _id: { $in: p.authors } }).select('name email');
  for (const a of approvedAuthors) sendProjectApprovedEmail(a.email, a.name, p.title);
  res.json(serialize(await findPopulated(p._id), req.user._id));
});

// PATCH /api/projects/:id/reject  (supervisor)  { reason }
export const rejectProject = asyncHandler(async (req, res) => {
  const p = await Project.findById(req.params.id);
  if (!p) {
    res.status(404);
    throw new Error('Project not found');
  }
  const wasApproved = p.status === 'approved';
  p.status = 'rejected';
  p.rejectionReason = req.body.reason || '';
  p.approvedBy = null;
  p.approvedAt = null;
  p.reviewedBy = req.user._id;
  await p.save();
  // A rejected extension is no longer a collaboration on its parent.
  if (p.extends && wasApproved) await decParentExtensions(p.extends);
  for (const a of p.authors) {
    await notify({
      user: a,
      actor: req.user._id,
      text: `Your project "${p.title}" was not approved.${p.rejectionReason ? ' Reason: ' + p.rejectionReason : ' Please revise and resubmit.'}`,
      type: 'rejection',
      project: p._id,
    });
  }
  // Email the authors too (fire-and-forget — mail never blocks the response).
  const rejectedAuthors = await User.find({ _id: { $in: p.authors } }).select('name email');
  for (const a of rejectedAuthors)
    sendProjectRejectedEmail(a.email, a.name, p.title, p.rejectionReason);
  res.json(serialize(await findPopulated(p._id), req.user._id));
});

// Only the supervisor responsible for a project (or an admin) may manage it.
// That's whoever approved it; for projects with no recorded approver (e.g. seed
// data) we fall back to the project's assigned supervisor.
function canManageApproved(p, user) {
  if (user.role === 'admin') return true;
  if (user.role !== 'supervisor') return false;
  const responsible = p.approvedBy || p.supervisor;
  return responsible && String(responsible) === String(user._id);
}

// Engagement (likes, bookmarks, comments, ratings, collaboration) is only open
// on approved projects. A project awaiting approval (pending) isn't public yet,
// so no one — not even its authors — may engage with it until a supervisor
// approves it. Rejected and draft projects are likewise closed. Throws a 403
// for any non-approved status.
function assertEngageable(p, res) {
  if (p.status === 'rejected') {
    res.status(403);
    throw new Error('This project was rejected and is closed to engagement');
  }
  if (p.status === 'pending') {
    res.status(403);
    throw new Error('This project is awaiting approval — it can’t be liked, saved, rated, commented on or collaborated on until it is approved');
  }
  if (p.status === 'draft') {
    res.status(403);
    throw new Error('This project is still a draft — it can be contributed to, but not yet liked, rated or commented on');
  }
}

// PATCH /api/projects/:id/lock  (toggle edit-lock — approving supervisor/admin)
export const toggleLock = asyncHandler(async (req, res) => {
  const p = await Project.findById(req.params.id);
  if (!p) {
    res.status(404);
    throw new Error('Project not found');
  }
  if (p.status !== 'approved') {
    res.status(400);
    throw new Error('Only approved projects can be locked');
  }
  if (!canManageApproved(p, req.user)) {
    res.status(403);
    throw new Error('Only the supervisor who approved this project can lock it');
  }
  p.locked = !p.locked;
  await p.save();
  res.json(serialize(await findPopulated(p._id), req.user._id));
});

// PATCH /api/projects/:id/visibility  (toggle feed visibility — approving supervisor/admin)
export const toggleVisibility = asyncHandler(async (req, res) => {
  const p = await Project.findById(req.params.id);
  if (!p) {
    res.status(404);
    throw new Error('Project not found');
  }
  if (p.status !== 'approved') {
    res.status(400);
    throw new Error('Only approved projects can be hidden or shown');
  }
  if (!canManageApproved(p, req.user)) {
    res.status(403);
    throw new Error('Only the supervisor who approved this project can change its visibility');
  }
  p.hidden = !p.hidden;
  await p.save();
  res.json(serialize(await findPopulated(p._id), req.user._id));
});

// POST /api/projects/:id/spotlight  (supervisor) — recommend / withdraw a project
// for the spotlight. Only available once the project has reached Gold recognition.
export const toggleSpotlight = asyncHandler(async (req, res) => {
  if (req.user.role !== 'supervisor') {
    res.status(403);
    throw new Error('Only supervisors can recommend a project for spotlight');
  }
  const p = await Project.findById(req.params.id);
  if (!p) {
    res.status(404);
    throw new Error('Project not found');
  }
  if (tierRank(p.totalTier(platformUsers())) < tierRank('gold')) {
    res.status(400);
    throw new Error('Only projects that reached Gold recognition can be recommended for spotlight');
  }
  const nowRecommended = !(p.spotlight && p.spotlight.recommended);
  p.spotlight = nowRecommended
    ? { recommended: true, by: req.user._id, at: new Date() }
    : { recommended: false, by: null, at: null };
  await p.save();
  if (nowRecommended) {
    for (const a of p.authors) {
      await notify({
        user: a,
        actor: req.user._id,
        text: `⭐ ${req.user.name} recommended your project "${p.title}" for the spotlight!`,
        type: 'badge',
        project: p._id,
      });
    }
  }
  res.json(serialize(await findPopulated(p._id), req.user._id));
});

// POST /api/projects/:id/like  (toggle)
export const toggleLike = asyncHandler(async (req, res) => {
  const p = await Project.findById(req.params.id);
  if (!p) {
    res.status(404);
    throw new Error('Project not found');
  }
  assertEngageable(p, res);
  const uid = String(req.user._id);
  const idx = p.likes.findIndex((l) => String(l) === uid);
  if (idx >= 0) {
    p.likes.splice(idx, 1);
  } else {
    p.likes.push(req.user._id);
    for (const a of p.authors) {
      await notify({
        user: a,
        actor: req.user._id,
        text: `${req.user.name} liked your project "${p.title}"`,
        type: 'like',
        project: p._id,
      });
    }
  }
  await p.save();
  res.json(serialize(await findPopulated(p._id), req.user._id));
});

// POST /api/projects/:id/bookmark  (toggle)
export const toggleBookmark = asyncHandler(async (req, res) => {
  const p = await Project.findById(req.params.id);
  if (!p) {
    res.status(404);
    throw new Error('Project not found');
  }
  assertEngageable(p, res);
  const uid = String(req.user._id);
  const idx = p.bookmarks.findIndex((b) => String(b) === uid);
  if (idx >= 0) p.bookmarks.splice(idx, 1);
  else p.bookmarks.push(req.user._id);
  await p.save();
  res.json(serialize(await findPopulated(p._id), req.user._id));
});

// POST /api/projects/:id/rate  { value, comment }
// Only supervisors can rate, and a rating MUST be accompanied by a comment.
export const rateProject = asyncHandler(async (req, res) => {
  if (req.user.role !== 'supervisor') {
    res.status(403);
    throw new Error('Only supervisors can rate projects');
  }
  const value = Number(req.body.value);
  const comment = String(req.body.comment || '').trim();
  if (!(value >= 1 && value <= 5)) {
    res.status(400);
    throw new Error('Rating must be between 1 and 5');
  }
  if (!comment) {
    res.status(400);
    throw new Error('Please add a comment to go with your rating');
  }
  const p = await Project.findById(req.params.id);
  if (!p) {
    res.status(404);
    throw new Error('Project not found');
  }
  assertEngageable(p, res);

  // Upsert this supervisor's rating (weight 1.5 marks a supervisor rating).
  const existing = p.ratings.find((r) => String(r.user) === String(req.user._id));
  if (existing) {
    existing.value = value;
    existing.weight = 1.5;
  } else {
    p.ratings.push({ user: req.user._id, value, weight: 1.5 });
  }
  // The required comment is recorded in the project's comment thread.
  p.comments.push({ user: req.user._id, text: comment });

  // Recognition: a project levels up when its gold crosses into a higher tier
  // (Star → Gold → Diamond). Each tier-up re-announces the achievement and
  // re-pins it to the feed for 24h.
  const newTier = p.tier();
  const earnedBadge = tierRank(newTier) > tierRank(p.recognitionTier);
  if (earnedBadge) {
    p.recognized = true;
    p.recognitionTier = newTier;
    p.recognizedAt = new Date();
  }
  await p.save();

  // Notify the authors about the rating + comment.
  for (const a of p.authors) {
    await notify({
      user: a,
      actor: req.user._id,
      text: `${req.user.name} rated "${p.title}" ${value}★ — “${comment}”`,
      type: 'rating',
      project: p._id,
    });
  }
  // Announce the recognition tier to the authors and, separately, to the
  // supervisor tagged on the project — they earn this too.
  if (earnedBadge) {
    const label = newTier[0].toUpperCase() + newTier.slice(1);
    const emoji = { silver: '🥈', gold: '🥇', diamond: '💎' }[newTier];
    for (const a of p.authors) {
      await notify({
        user: a,
        actor: req.user._id,
        text: `${emoji} Your project "${p.title}" reached ${label} recognition — ${p.gold()}★ from supervisors!`,
        type: 'badge',
        project: p._id,
      });
    }
    if (p.supervisor) {
      await notify({
        user: p.supervisor,
        actor: req.user._id,
        text: `${emoji} "${p.title}", which you supervise, reached ${label} recognition!`,
        type: 'badge',
        project: p._id,
      });
    }
  }

  res.json(serialize(await findPopulated(p._id), req.user._id));
});

// GET /api/projects/news  — projects that reached a recognition tier in the last
// 24 hours, shown as feed news. Recognition is only "news" while fresh: after 24h
// the announcement drops off the feed (the badge on the project itself stays).
export const listNews = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recognized = await Project.find({
    recognized: true,
    status: 'approved',
    recognizedAt: { $gte: since },
  })
    .populate({ path: 'authors', select: 'name avatarColor role' })
    .sort({ recognizedAt: -1 })
    .limit(5);
  const users = platformUsers();
  res.json(
    recognized.map((p) => ({
      _id: p._id,
      title: p.title,
      authors: p.authors,
      gold: Math.round(p.totalGold(users) * 10) / 10,
      tier: p.totalTier(users),
      recognizedAt: p.recognizedAt,
    }))
  );
});

// POST /api/projects/:id/comments  { text }
export const addComment = asyncHandler(async (req, res) => {
  const text = req.body.text?.trim();
  if (!text) {
    res.status(400);
    throw new Error('Comment cannot be empty');
  }
  const p = await Project.findById(req.params.id);
  if (!p) {
    res.status(404);
    throw new Error('Project not found');
  }
  assertEngageable(p, res);
  p.comments.push({ user: req.user._id, text });
  await p.save();
  for (const a of p.authors) {
    await notify({
      user: a,
      actor: req.user._id,
      text: `${req.user.name} commented on "${p.title}"`,
      type: 'comment',
      project: p._id,
    });
  }
  res.status(201).json(serialize(await findPopulated(p._id), req.user._id));
});

// POST /api/projects/:id/contributions  { text }
// A group member adds their contribution to a draft group project (before it's
// submitted). On submit, contributors become co-authors.
export const addContribution = asyncHandler(async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) {
    res.status(400);
    throw new Error('Contribution cannot be empty');
  }
  const p = await Project.findById(req.params.id);
  if (!p) {
    res.status(404);
    throw new Error('Project not found');
  }
  if (p.status !== 'draft') {
    res.status(400);
    throw new Error('Contributions can only be added while the project is a draft');
  }
  const group = p.group ? await Group.findById(p.group) : null;
  if (!group || !isGroupMember(group, req.user)) {
    res.status(403);
    throw new Error('Only members of this group can contribute');
  }
  p.contributions.push({ user: req.user._id, text });
  await p.save();

  // Let the project's authors (the creator) know a contribution came in.
  for (const a of p.authors) {
    if (String(a) === String(req.user._id)) continue;
    await notify({
      user: a,
      actor: req.user._id,
      text: `${req.user.name} contributed to the group draft "${p.title}"`,
      type: 'collab',
      project: p._id,
    });
  }
  res.status(201).json(serialize(await findPopulated(p._id), req.user._id));
});

// POST /api/projects/:id/submit  — submit a draft group project for review.
// Allowed for an author or a group admin. Everyone who contributed becomes a
// co-author, and the supervisor is notified.
export const submitDraft = asyncHandler(async (req, res) => {
  const p = await Project.findById(req.params.id);
  if (!p) {
    res.status(404);
    throw new Error('Project not found');
  }
  if (p.status !== 'draft') {
    res.status(400);
    throw new Error('This project is not a draft');
  }
  const group = p.group ? await Group.findById(p.group) : null;
  const isAuthor = p.authors.some((a) => String(a) === String(req.user._id));
  if (!isAuthor && !(group && isGroupAdmin(group, req.user))) {
    res.status(403);
    throw new Error('Only an author or a group admin can submit this draft');
  }

  // Fold every contributor into the author list (in the order they contributed),
  // skipping anyone already listed.
  const have = new Set(p.authors.map((a) => String(a)));
  for (const c of p.contributions) {
    const uid = String(c.user);
    if (!have.has(uid)) {
      p.authors.push(c.user);
      have.add(uid);
    }
  }
  p.status = 'pending';
  await p.save();

  if (p.supervisor) {
    await notify({
      user: p.supervisor,
      actor: req.user._id,
      text: `New group project submitted for review: "${p.title}" by ${req.user.name}`,
      type: 'submission',
      project: p._id,
    });
    // Email the tagged supervisor (fire-and-forget). p.supervisor is an id here.
    const sup = await User.findById(p.supervisor).select('name email');
    if (sup) sendSupervisorTagEmail(sup.email, sup.name, req.user.name, p.title);
  }
  res.json(serialize(await findPopulated(p._id), req.user._id));
});

// PATCH /api/projects/:id/contributions/:contribId  { text }
// Edit your own contribution — allowed only while the project is still a draft
// (i.e. not yet finally submitted for review).
export const editContribution = asyncHandler(async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) {
    res.status(400);
    throw new Error('Contribution cannot be empty');
  }
  const p = await Project.findById(req.params.id);
  if (!p) {
    res.status(404);
    throw new Error('Project not found');
  }
  if (p.status !== 'draft') {
    res.status(400);
    throw new Error('Contributions can only be edited before the project is submitted for review');
  }
  const c = p.contributions.id(req.params.contribId);
  if (!c) {
    res.status(404);
    throw new Error('Contribution not found');
  }
  if (String(c.user) !== String(req.user._id)) {
    res.status(403);
    throw new Error('You can only edit your own contribution');
  }
  c.text = text;
  await p.save();
  res.json(serialize(await findPopulated(p._id), req.user._id));
});

// DELETE /api/projects/:id/contributions/:contribId
// Remove a contribution while the project is still a draft. The owner can remove
// their own; a group admin can remove any.
export const deleteContribution = asyncHandler(async (req, res) => {
  const p = await Project.findById(req.params.id);
  if (!p) {
    res.status(404);
    throw new Error('Project not found');
  }
  if (p.status !== 'draft') {
    res.status(400);
    throw new Error('Contributions can only be removed before the project is submitted for review');
  }
  const c = p.contributions.id(req.params.contribId);
  if (!c) {
    res.status(404);
    throw new Error('Contribution not found');
  }
  const group = p.group ? await Group.findById(p.group) : null;
  const isOwner = String(c.user) === String(req.user._id);
  const isAdmin = group && isGroupAdmin(group, req.user);
  if (!isOwner && !isAdmin) {
    res.status(403);
    throw new Error('You can only remove your own contribution');
  }
  p.contributions.pull(req.params.contribId);
  await p.save();
  res.json(serialize(await findPopulated(p._id), req.user._id));
});

// POST /api/projects/:id/collaborate  (students join approved projects)
export const joinCollaboration = asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') {
    res.status(403);
    throw new Error('Only students can join as collaborators');
  }
  const p = await Project.findById(req.params.id);
  if (!p) {
    res.status(404);
    throw new Error('Project not found');
  }
  assertEngageable(p, res);
  if (p.locked) {
    res.status(403);
    throw new Error('This project is locked for collaboration by the supervisor');
  }
  if (p.authors.some((a) => String(a) === String(req.user._id))) {
    res.status(400);
    throw new Error('You are already a collaborator');
  }
  p.authors.push(req.user._id);
  await p.save();
  await notify({
    user: p.authors[0],
    actor: req.user._id,
    text: `${req.user.name} joined your project "${p.title}" as a collaborator!`,
    type: 'collab',
    project: p._id,
  });
  res.json(serialize(await findPopulated(p._id), req.user._id));
});

// GET /api/projects/mine
export const myProjects = asyncHandler(async (req, res) => {
  const p = await Project.find({ authors: req.user._id }).populate(POP);
  res.json(p.map((x) => serialize(x, req.user._id)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// GET /api/projects/bookmarks
export const myBookmarks = asyncHandler(async (req, res) => {
  const p = await Project.find({ bookmarks: req.user._id }).populate(POP);
  res.json(p.map((x) => serialize(x, req.user._id)));
});

// GET /api/projects/pending  (supervisor queue)
export const pendingProjects = asyncHandler(async (req, res) => {
  const p = await Project.find().populate(POP);
  res.json(p.map((x) => serialize(x, req.user._id)));
});
