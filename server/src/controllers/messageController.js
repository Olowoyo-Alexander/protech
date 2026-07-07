import asyncHandler from 'express-async-handler';
import Message, { threadKey } from '../models/Message.js';
import User from '../models/User.js';
import { emitToUser } from '../socket/index.js';
import { notify } from '../utils/notify.js';

// GET /api/messages/:userId  — conversation with one user
export const getThread = asyncHandler(async (req, res) => {
  const other = req.params.userId;
  const key = threadKey(req.user._id, other);
  const messages = await Message.find({ thread: key }).sort('createdAt');
  // mark incoming as read
  await Message.updateMany({ thread: key, to: req.user._id, read: false }, { read: true });
  res.json(messages);
});

// POST /api/messages/:userId  { text }
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
  const msg = await Message.create({ thread: key, from: req.user._id, to, text });

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

// GET /api/messages  — unread counts per thread (for badges)
export const unreadCounts = asyncHandler(async (req, res) => {
  const rows = await Message.aggregate([
    { $match: { to: req.user._id, read: false } },
    { $group: { _id: '$from', count: { $sum: 1 } } },
  ]);
  res.json(rows.map((r) => ({ from: r._id, count: r.count })));
});
