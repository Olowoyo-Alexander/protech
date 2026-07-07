import Notification from '../models/Notification.js';
import { emitToUser } from '../socket/index.js';

/**
 * Create a notification for a user and push it in real time.
 * Skips self-notifications (acting on your own content).
 */
export async function notify({ user, actor, text, type, project }) {
  if (!user) return null;
  if (actor && String(user) === String(actor)) return null;

  const n = await Notification.create({ user, text, type, project });
  emitToUser(user, 'notification', n);
  return n;
}
