import mongoose from 'mongoose';

// A message in a group's chat room. Only group members can read/post, and only
// while the group's chat is enabled (admins toggle Group.chatEnabled).
const groupMessageSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model('GroupMessage', groupMessageSchema);
