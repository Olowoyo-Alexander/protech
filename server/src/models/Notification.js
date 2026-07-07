import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, required: true },
    type: {
      type: String,
      enum: ['like', 'comment', 'approval', 'rejection', 'collab', 'submission', 'message', 'rating', 'badge', 'group'],
      default: 'comment',
    },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('Notification', notificationSchema);
