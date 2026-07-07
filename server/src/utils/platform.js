import User from '../models/User.js';

// The engagement→stars scale is anchored to the platform's user population, so
// star computations need the total user count constantly. Counting on every
// serialize would be wasteful, so we cache it and refresh in the background
// (kept warm at startup and every few minutes, and lazily on read).
let cached = 0;
let lastFetch = 0;
let inflight = null;
const TTL = 5 * 60 * 1000; // 5 minutes

export const platformUsers = () => cached;

export async function refreshPlatformUsers() {
  cached = await User.countDocuments();
  lastFetch = Date.now();
  return cached;
}

// Non-blocking freshness nudge — safe to call from sync code paths (serialize).
export function touchPlatformUsers() {
  if (!inflight && Date.now() - lastFetch > TTL) {
    inflight = refreshPlatformUsers()
      .catch(() => {})
      .finally(() => { inflight = null; });
  }
}
