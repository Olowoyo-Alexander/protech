import mongoose from 'mongoose';

// A platform-wide announcement published by an admin. It surfaces at the top of
// the feed for everyone and is shown WITHOUT any sender information — the author
// is recorded only for auditing/authorisation, never exposed to the client.
const announcementSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('Announcement', announcementSchema);
