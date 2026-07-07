import mongoose from 'mongoose';

// A pending invitation to join the group. The invitee must accept before they
// become a member (see groupController accept/decline).
const inviteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    dept: { type: String, default: '' },

    // Admin-chosen colour theme (one of the keys in GROUP_THEMES on the client).
    // Drives the group's tag colour wherever its posts appear on the feed.
    theme: { type: String, default: 'indigo' },

    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Accepted participants (includes the creator). Only students & supervisors
    // ever land here — observers/admins can't be members.
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Group admins — a subset of members with management rights. The creator
    // starts here. NOTE: any supervisor member is treated as an admin too (see
    // isGroupAdmin) even if not listed here.
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Outstanding invitations awaiting the invitee's acceptance.
    invites: [inviteSchema],

    // A single chat message an admin has pinned to the top of the group (like
    // WhatsApp). null = nothing pinned.
    pinnedMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMessage', default: null },

    // Group chat (Phase 2) — admins toggle this; the flag lives here now so the
    // control is available immediately. Enabling chat is only temporary: it auto-
    // resets to disabled 24h after it was last turned on. `chatEnabledAt` records
    // when it was enabled so that expiry can be evaluated lazily on access.
    chatEnabled: { type: Boolean, default: true },
    chatEnabledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Compare ids that may be raw ObjectIds OR populated documents ({ _id }), so the
// helpers work whether `group` came from a plain findById or a populated query.
const idOf = (x) => String(x && x._id ? x._id : x);
const has = (list, id) => list.some((x) => idOf(x) === String(id));

// Group-level admin rights. Listed admins qualify; so does ANY supervisor who is
// a member (supervisors have all the powers of a group admin — requirement 10).
export function isGroupAdmin(group, user) {
  if (!user) return false;
  if (has(group.admins, user._id)) return true;
  return user.role === 'supervisor' && has(group.members, user._id);
}

export function isGroupMember(group, user) {
  return !!user && has(group.members, user._id);
}

export function isGroupInvitee(group, user) {
  return !!user && group.invites.some((i) => idOf(i.user) === String(user._id));
}

export default mongoose.model('Group', groupSchema);
