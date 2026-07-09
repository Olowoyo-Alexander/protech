import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    // deterministic thread key: sorted "idA-idB"
    thread: { type: String, required: true, index: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Not `required` at the schema level: a deleted message's text is cleared
    // to '' (see deleteMessage). Non-empty is enforced at creation time instead
    // (messageController.js checks `text?.trim()` before Message.create).
    text: { type: String, default: '', trim: true },
    read: { type: Boolean, default: false },
    // Reply-to-message (WhatsApp-style quote). Not populated by default —
    // callers that need the quoted preview populate it explicitly.
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    // Soft delete: the row is kept (so the thread and any reply-quotes that
    // point at it still make sense) but its text is cleared and the client
    // renders a "message deleted" placeholder instead.
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export function threadKey(a, b) {
  return [String(a), String(b)].sort().join('-');
}

export default mongoose.model('Message', messageSchema);
