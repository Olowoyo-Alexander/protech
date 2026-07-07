import asyncHandler from 'express-async-handler';
import Notification from '../models/Notification.js';

// GET /api/notifications
export const listNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ user: req.user._id })
    .sort('-createdAt')
    .limit(50);
  res.json(notifications);
});

// PATCH /api/notifications/:id/read
export const markRead = asyncHandler(async (req, res) => {
  const n = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { read: true },
    { new: true }
  );
  if (!n) {
    res.status(404);
    throw new Error('Notification not found');
  }
  res.json(n);
});

// PATCH /api/notifications/read-all
export const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  res.json({ message: 'All marked read' });
});
