import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    // deterministic thread key: sorted "idA-idB"
    thread: { type: String, required: true, index: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export function threadKey(a, b) {
  return [String(a), String(b)].sort().join('-');
}

export default mongoose.model('Message', messageSchema);
