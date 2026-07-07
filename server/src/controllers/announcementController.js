import asyncHandler from 'express-async-handler';
import Announcement from '../models/Announcement.js';

// Announcements appear anonymously on the feed, so the client shape deliberately
// omits the author — only the message and timestamp are exposed.
const shape = (a) => ({ _id: a._id, text: a.text, createdAt: a.createdAt });

// GET /api/announcements  — visible to everyone signed in.
export const listAnnouncements = asyncHandler(async (req, res) => {
  const items = await Announcement.find().sort('-createdAt').limit(20);
  res.json(items.map(shape));
});

// POST /api/announcements  (admin)  { text }
export const createAnnouncement = asyncHandler(async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) {
    res.status(400);
    throw new Error('Announcement text is required');
  }
  const a = await Announcement.create({ text: text.slice(0, 1000), createdBy: req.user._id });
  res.status(201).json(shape(a));
});

// DELETE /api/announcements/:id  (admin)
export const deleteAnnouncement = asyncHandler(async (req, res) => {
  const a = await Announcement.findById(req.params.id);
  if (!a) {
    res.status(404);
    throw new Error('Announcement not found');
  }
  await a.deleteOne();
  res.json({ message: 'Announcement removed' });
});
