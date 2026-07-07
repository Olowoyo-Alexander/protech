import mongoose from 'mongoose';

const snippetCommentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

// A short post published by a group admin/supervisor. Unlike projects, snippets
// need no supervisor approval — they go straight to the public feed, tagged with
// the group that posted them (the group itself never appears on the feed).
const snippetSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },

    // Anyone on the feed can like a group post and comment on it.
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [snippetCommentSchema],
    // Up to four progress photos shown alongside the write-up. Stored as hosted
    // URLs (or inline data URLs in dev where Cloudinary isn't configured).
    photos: {
      type: [String],
      default: [],
      validate: [(v) => v.length <= 4, 'A snippet can include at most 4 photos'],
    },
  },
  { timestamps: true }
);

export default mongoose.model('Snippet', snippetSchema);
