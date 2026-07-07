import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    title: { type: String, default: '' }, // honorific, e.g. Dr./Professor (supervisors)
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: {
      type: String,
      enum: ['observer', 'student', 'supervisor', 'admin'],
      default: 'student',
    },
    active: { type: Boolean, default: true }, // admins can deactivate accounts
    dept: { type: String, default: '' },
    set: { type: String, default: '' }, // academic set/year (students)
    level: { type: String, default: '' }, // academic level, e.g. '300 Level' (students)
    matric: { type: String, default: '' }, // matric number, e.g. ETC/22/001 (students)
    // Supervisor handle: an exclusive alphanumeric tag (letters+numbers, no
    // spaces, ≥6 chars) a supervisor creates for themselves. It is the ONLY way
    // students tag them on a project or add them in Messages. Unique across
    // supervisors (enforced in the controller, case-insensitively).
    supervisorTag: { type: String, default: '' },
    bio: { type: String, default: '' }, // short about/headline shown on the profile
    verified: { type: Boolean, default: true }, // supervisors start false until email verified
    verifyCode: { type: String, select: false },
    verifyExpires: { type: Date, select: false },
    avatarColor: { type: String, default: 'av-amber' },
    // Soft-delete / anonymize flag. When an admin "deletes" an account we keep the
    // record (so projects it authored stay attributed to a real name) but strip it
    // of anything that lets it function or reappear: it can't sign in and is
    // filtered out of every directory, search and messaging surface. Its name is
    // preserved and shown as "(inactive)" on the projects it belongs to.
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// No two supervisors may share a tag. Enforced case-insensitively at the DB
// level (collation strength 2) as a hard guard against races — the controller
// also checks before saving. The partial filter limits the constraint to
// supervisors with a non-empty tag, so blank tags never collide.
userSchema.index(
  { supervisorTag: 1 },
  {
    unique: true,
    partialFilterExpression: { role: 'supervisor', supervisorTag: { $gt: '' } },
    collation: { locale: 'en', strength: 2 },
    name: 'supervisorTag_unique_ci',
  }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

export default mongoose.model('User', userSchema);
