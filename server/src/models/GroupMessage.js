import mongoose from 'mongoose';

// A message in a group's chat room. Only group members can read/post, and only
// while the group's chat is enabled (admins toggle Group.chatEnabled).
const groupMessageSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
    // Reply-to-message (WhatsApp-style quote). Populated explicitly by callers.
    // A deleted message is hard-removed (see deleteGroupMessage), so this
    // simply resolves to null once its target is gone.
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMessage', default: null },
  },
  { timestamps: true }
);

export default mongoose.model('GroupMessage', groupMessageSchema);
