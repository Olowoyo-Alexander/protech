import mongoose from 'mongoose';

// Tracks how far each user has read in each group's chat, so we can show unread
// badges. One row per (user, group); lastReadAt is bumped when they open the chat.
const groupReadSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    lastReadAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

groupReadSchema.index({ user: 1, group: 1 }, { unique: true });

export default mongoose.model('GroupRead', groupReadSchema);
