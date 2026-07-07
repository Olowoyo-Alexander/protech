import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

// A group member's contribution to a draft group project, added before the
// project is submitted for review. Each contributor becomes a co-author on submit.
const contributionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const ratingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    value: { type: Number, min: 1, max: 5, required: true },
    weight: { type: Number, default: 1 }, // supervisors weighted higher
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    summary: { type: String, required: true }, // abstract
    problem: { type: String, required: true },
    methodology: { type: String, required: true },
    limitations: { type: String, default: '' },
    dept: { type: String, required: true },
    set: { type: String, required: true }, // set/year

    authors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Optional: the group this project was posted under. Group projects still go
    // through the normal approval flow; the feed just tags them with the group.
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },

    // When this project is an improvement/extension of an existing one, it links
    // back to the original. The original is never modified. extendsTitle caches
    // the original's title so it still reads sensibly even if the original is gone.
    extends: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    extendsTitle: { type: String, default: '' },
    // Denormalised count of APPROVED extensions built on this project (i.e. the
    // collaborations it seeded). Maintained on approve/reject/delete; used by the
    // star computation (each collaboration is worth stars). Read-hot, so kept on
    // the doc rather than counted on every serialize.
    extensionCount: { type: Number, default: 0 },

    status: {
      type: String,
      // 'draft' = a group project being built collaboratively; group members add
      // contributions before an admin/author submits it (→ 'pending') for review.
      enum: ['draft', 'pending', 'approved', 'rejected'],
      default: 'pending',
    },
    rejectionReason: { type: String, default: '' },
    // Who approved this project (and when). Set on approval, cleared on reject.
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    // Who last reviewed this project (approved OR rejected it). Unlike approvedBy,
    // this is not cleared on reject, so the approval queue's "Reviewed" tab can
    // show each supervisor only the projects they personally reviewed. It stays
    // null for supervisor-published projects, which never enter the review queue.
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Recognition: earned once a project's gold (total supervisor stars) crosses
    // a tier threshold — Star (20), Gold (40), Diamond (60, highest). `recognized`
    // stays true once any tier is reached; `recognitionTier` records the highest
    // tier reached so we can detect tier-ups, and `recognizedAt` is the moment of
    // the most recent tier-up (used to pin the achievement to the feed for 24h).
    recognized: { type: Boolean, default: false },
    // 'star' is a legacy alias kept in the enum so older documents still validate;
    // new code writes 'silver'.
    recognitionTier: { type: String, enum: ['', 'silver', 'gold', 'diamond', 'star'], default: '' },
    recognizedAt: { type: Date, default: null },

    // Supervisor controls (only the responsible supervisor / an admin may toggle):
    //  - locked: collaboration is disabled — no one can build an extension of it.
    //  - hidden: the approved project is withheld from the public feed.
    locked: { type: Boolean, default: false },
    hidden: { type: Boolean, default: false },

    // Spotlight: any supervisor may recommend a project for the spotlight once it
    // has reached Gold recognition. It's a supervisor endorsement surfaced on the
    // project; `by`/`at` record who recommended it and when.
    spotlight: {
      recommended: { type: Boolean, default: false },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      at: { type: Date, default: null },
    },

    // Cloudinary document
    docUrl: { type: String, default: '' },
    docName: { type: String, default: '' },

    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    ratings: [ratingSchema],
    comments: [commentSchema],
    contributions: [contributionSchema],
  },
  { timestamps: true }
);

// Gold = the total stars awarded by supervisors. Only supervisors can rate, so
// this is a pure measure of supervisor assessment. It drives both project
// ranking and the recognition badge. (Supervisor ratings carry weight 1.5;
// legacy student ratings, weight 1, are excluded.)
projectSchema.methods.gold = function () {
  return this.ratings
    .filter((r) => r.weight >= 1.5)
    .reduce((sum, r) => sum + r.value, 0);
};

// Recognition tiers, highest first. A project's tier is the highest threshold
// its gold meets. Keep these thresholds in sync with the client (utils.js).
export const RECOGNITION_TIERS = [
  { tier: 'diamond', min: 60 },
  { tier: 'gold', min: 40 },
  { tier: 'silver', min: 20 },
];
const TIER_RANK = { '': 0, star: 1, silver: 1, gold: 2, diamond: 3 };
export const tierRank = (t) => TIER_RANK[t] || 0;

// Recognition tier for a numeric gold value, highest first ('' = none).
export const tierForGold = (g) => {
  for (const t of RECOGNITION_TIERS) if (g >= t.min) return t.tier;
  return '';
};

// The recognition tier this project currently qualifies for ('' = none), based
// on supervisor stars alone (the "intentional" recognition path).
projectSchema.methods.tier = function () {
  return tierForGold(this.gold());
};

// --- Community engagement stars (added on top of supervisor stars) -----------
// Beyond supervisors' intentional ratings, engagement contributes stars in the
// background, on a scale anchored to the platform's user population. Baseline
// (per 1000 users): 20 (likes+comments pooled) = 1★, 50 saves = 1★, each
// collaboration (approved extension) = 2★, a spotlight recommendation = 3★.
// As the platform grows the scale only gets HARDER — never easier than the
// 1000-user baseline — so the divisor is max(1, users/1000).
projectSchema.methods.engagementGold = function (users = 0) {
  const scale = Math.max(1, (users || 0) / 1000);
  const social = (this.likes.length + this.comments.length) / 20 + this.bookmarks.length / 50;
  const collab = (this.extensionCount || 0) * 2;
  const reco = this.spotlight && this.spotlight.recommended ? 3 : 0;
  return (social + collab + reco) / scale;
};

// The project's total stars: intentional supervisor stars + background
// engagement stars. This is the number shown everywhere and used for ranking,
// recognition tiers and spotlight eligibility.
projectSchema.methods.totalGold = function (users = 0) {
  return this.gold() + this.engagementGold(users);
};

// Recognition tier from the TOTAL star count (supervisor + engagement).
projectSchema.methods.totalTier = function (users = 0) {
  return tierForGold(this.totalGold(users));
};

projectSchema.methods.avgRating = function () {
  if (!this.ratings.length) return 0;
  const totalW = this.ratings.reduce((s, r) => s + r.weight, 0);
  const weighted = this.ratings.reduce((s, r) => s + r.value * r.weight, 0);
  return Number((weighted / totalW).toFixed(1));
};

// Text index for search
projectSchema.index({ title: 'text', summary: 'text', problem: 'text', dept: 'text' });

export default mongoose.model('Project', projectSchema);
