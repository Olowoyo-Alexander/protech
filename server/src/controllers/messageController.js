import asyncHandler from 'express-async-handler';
import Message, { threadKey } from '../models/Message.js';
import User from '../models/User.js';
import { emitToUser } from '../socket/index.js';
import { notify } from '../utils/notify.js';

// Reply-quote preview fields — just enough to render "replying to X: <snippet>"
// without a second round trip. A deleted original is hard-removed (see
// deleteMessage below), so populate simply returns null for it — no "deleted"
// state ever needs to be represented or shown here.
const REPLY_POP = { path: 'replyTo', select: 'from text', populate: { path: 'from', select: 'name' } };

// GET /api/messages/:userId  — conversation with one user
export const getThread = asyncHandler(async (req, res) => {
  const other = req.params.userId;
  const key = threadKey(req.user._id, other);
  const messages = await Message.find({ thread: key }).sort('createdAt').populate(REPLY_POP);
  // mark incoming as read
  await Message.updateMany({ thread: key, to: req.user._id, read: false }, { read: true });
  res.json(messages);
});

// POST /api/messages/:userId  { text, replyTo? }
export const sendMessage = asyncHandler(async (req, res) => {
  const text = req.body.text?.trim();
  const to = req.params.userId;
  if (!text) {
    res.status(400);
    throw new Error('Message cannot be empty');
  }
  const recipient = await User.findById(to);
  if (!recipient) {
    res.status(404);
    throw new Error('Recipient not found');
  }
  const key = threadKey(req.user._id, to);
  let replyTo = null;
  if (req.body.replyTo) {
    // A reply must point at a message actually in this same thread.
    const original = await Message.findOne({ _id: req.body.replyTo, thread: key });
    if (original) replyTo = original._id;
  }
  const created = await Message.create({ thread: key, from: req.user._id, to, text, replyTo });
  const msg = await Message.findById(created._id).populate(REPLY_POP);

  // realtime push to recipient
  emitToUser(to, 'message', msg);
  await notify({
    user: to,
    actor: req.user._id,
    text: `${req.user.name}: ${text.slice(0, 50)}`,
    type: 'message',
  });

  res.status(201).json(msg);
});

// DELETE /api/messages/msg/:messageId  — permanently delete a message you
// sent. No trace is left for either side: the row is removed outright, not
// flagged, so the recipient never sees any "message deleted" indicator.
export const deleteMessage = asyncHandler(async (req, res) => {
  const msg = await Message.findById(req.params.messageId);
  if (!msg) {
    res.status(404);
    throw new Error('Message not found');
  }
  if (String(msg.from) !== String(req.user._id)) {
    res.status(403);
    throw new Error('You can only delete your own messages');
  }
  await Message.deleteOne({ _id: msg._id });

  emitToUser(msg.to, 'messageDeleted', { _id: msg._id, thread: msg.thread });
  res.json({ _id: msg._id });
});

// GET /api/messages  — unread counts per thread (for badges)
export const unreadCounts = asyncHandler(async (req, res) => {
  const rows = await Message.aggregate([
    { $match: { to: req.user._id, read: false } },
    { $group: { _id: '$from', count: { $sum: 1 } } },
  ]);
  res.json(rows.map((r) => ({ from: r._id, count: r.count })));
});
