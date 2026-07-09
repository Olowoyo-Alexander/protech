import mongoose from 'mongoose';

// A message in a group's chat room. Only group members can read/post, and only
// while the group's chat is enabled (admins toggle Group.chatEnabled).
const groupMessageSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Not `required` at the schema level: a deleted message's text is cleared
    // to '' (see deleteGroupMessage). Non-empty is enforced at creation time
    // instead (groupController.js checks the trimmed text before create).
    text: { type: String, default: '', trim: true },
    // Reply-to-message (WhatsApp-style quote). Populated explicitly by callers.
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMessage', default: null },
    // Soft delete — see Message.js for the same convention on direct messages.
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('GroupMessage', groupMessageSchema);
