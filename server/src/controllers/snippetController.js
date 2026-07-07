import asyncHandler from 'express-async-handler';
import Snippet from '../models/Snippet.js';
import Group, { isGroupAdmin } from '../models/Group.js';
import { notify } from '../utils/notify.js';

const POP = [
  { path: 'author', select: 'name title role avatarColor' },
  // admins/members are needed to decide who may delete the post; they're used
  // for the permission check only and are NOT sent to the client.
  { path: 'group', select: 'name dept theme admins members' },
  { path: 'comments.user', select: 'name title role avatarColor' },
];

// Whether `user` may delete this (populated) snippet. Strictly limited to an
// admin of the snippet's OWN group: a group admin can delete their group's posts
// but NOT another group's. (isGroupAdmin already checks this group's admins, and
// counts a supervisor who is a member of THIS group.)
const canModerate = (s, user) => !!user && !!s.group && isGroupAdmin(s.group, user);

const serialize = (s, user) => {
  const uid = user ? String(user._id) : null;
  return {
    _id: s._id,
    kind: 'snippet', // lets the feed distinguish snippets from project cards
    text: s.text,
    photos: s.photos || [],
    author: s.author,
    group: s.group ? { _id: s.group._id, name: s.group.name, dept: s.group.dept, theme: s.group.theme } : null,
    likeCount: s.likes?.length || 0,
    liked: uid ? s.likes.some((l) => String(l) === uid) : false,
    comments: (s.comments || []).map((c) => ({
      _id: c._id,
      user: c.user,
      text: c.text,
      createdAt: c.createdAt,
    })),
    commentCount: s.comments?.length || 0,
    canDelete: canModerate(s, user),
    createdAt: s.createdAt,
  };
};

const repopulate = (id) => Snippet.findById(id).populate(POP);

// POST /api/groups/:id/snippets  { text }
// A group admin/supervisor posts a snippet — no supervisor approval needed.
export const createSnippet = asyncHandler(async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) {
    res.status(400);
    throw new Error('Snippet cannot be empty');
  }
  // Up to four progress photos may accompany the write-up.
  const photos = Array.isArray(req.body.photos)
    ? req.body.photos.filter((p) => typeof p === 'string' && p.trim()).slice(0, 4)
    : [];
  if (Array.isArray(req.body.photos) && req.body.photos.length > 4) {
    res.status(400);
    throw new Error('A snippet can include at most 4 photos');
  }
  const group = await Group.findById(req.params.id);
  if (!group) {
    res.status(404);
    throw new Error('Group not found');
  }
  if (!isGroupAdmin(group, req.user)) {
    res.status(403);
    throw new Error('Only group admins can post snippets');
  }
  const snippet = await Snippet.create({ group: group._id, author: req.user._id, text, photos });
  res.status(201).json(serialize(await repopulate(snippet._id), req.user));
});

// GET /api/snippets  — recent snippets for the public feed (everyone).
export const listSnippets = asyncHandler(async (req, res) => {
  const snippets = await Snippet.find().populate(POP).sort('-createdAt').limit(50);
  // Defend against snippets whose group was deleted.
  res.json(snippets.filter((s) => s.group).map((s) => serialize(s, req.user)));
});

// POST /api/snippets/:id/like  — toggle a like (anyone on the feed).
export const toggleSnippetLike = asyncHandler(async (req, res) => {
  const s = await Snippet.findById(req.params.id);
  if (!s) {
    res.status(404);
    throw new Error('Post not found');
  }
  const uid = String(req.user._id);
  const idx = s.likes.findIndex((l) => String(l) === uid);
  if (idx >= 0) {
    s.likes.splice(idx, 1);
  } else {
    s.likes.push(req.user._id);
    await notify({
      user: s.author,
      actor: req.user._id,
      text: `${req.user.name} liked your group post`,
      type: 'like',
    });
  }
  await s.save();
  res.json(serialize(await repopulate(s._id), req.user));
});

// POST /api/snippets/:id/comments  { text }  — comment on a post (anyone).
export const addSnippetComment = asyncHandler(async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) {
    res.status(400);
    throw new Error('Comment cannot be empty');
  }
  const s = await Snippet.findById(req.params.id);
  if (!s) {
    res.status(404);
    throw new Error('Post not found');
  }
  s.comments.push({ user: req.user._id, text });
  await s.save();
  await notify({
    user: s.author,
    actor: req.user._id,
    text: `${req.user.name} commented on your group post`,
    type: 'comment',
  });
  res.status(201).json(serialize(await repopulate(s._id), req.user));
});

// DELETE /api/snippets/:id  — remove a post. Group admins (of the posting group)
// or platform admins only.
export const deleteSnippet = asyncHandler(async (req, res) => {
  const s = await Snippet.findById(req.params.id).populate({ path: 'group', select: 'admins members' });
  if (!s) {
    res.status(404);
    throw new Error('Post not found');
  }
  if (!canModerate(s, req.user)) {
    res.status(403);
    throw new Error('Only group admins can delete this post');
  }
  await s.deleteOne();
  res.json({ message: 'Post deleted' });
});
