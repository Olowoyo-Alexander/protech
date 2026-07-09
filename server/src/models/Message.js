import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    // deterministic thread key: sorted "idA-idB"
    thread: { type: String, required: true, index: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
    read: { type: Boolean, default: false },
    // Reply-to-message (WhatsApp-style quote). Not populated by default —
    // callers that need the quoted preview populate it explicitly. A deleted
    // message is hard-removed (see deleteMessage), so this simply resolves to
    // null once its target is gone — no "deleted" state to track here.
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  },
  { timestamps: true }
);

export function threadKey(a, b) {
  return [String(a), String(b)].sort().join('-');
}

export default mongoose.model('Message', messageSchema);
