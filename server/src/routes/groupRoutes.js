import express from 'express';
import {
  createGroup,
  listMyGroups,
  getGroup,
  inviteMember,
  acceptInvite,
  declineInvite,
  removeMember,
  setMemberAdmin,
  updateGroup,
  toggleChat,
  setGroupTheme,
  deleteGroup,
  listGroupMessages,
  sendGroupMessage,
  deleteGroupMessage,
  pinMessage,
} from '../controllers/groupController.js';
import { createSnippet } from '../controllers/snippetController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', listMyGroups);
// Only students & supervisors may create a group (observers/admins cannot).
router.post('/', authorize('student', 'supervisor'), createGroup);

router.get('/:id', getGroup);
router.patch('/:id', updateGroup);
router.delete('/:id', deleteGroup);

router.post('/:id/invite', inviteMember);
router.post('/:id/accept', acceptInvite);
router.post('/:id/decline', declineInvite);
router.patch('/:id/chat', toggleChat);
router.patch('/:id/theme', setGroupTheme);
router.post('/:id/snippets', createSnippet);

router.get('/:id/messages', listGroupMessages);
router.post('/:id/messages', sendGroupMessage);
router.delete('/:id/messages/:messageId', deleteGroupMessage);
router.patch('/:id/pin', pinMessage);

router.delete('/:id/members/:userId', removeMember);
router.patch('/:id/members/:userId/admin', setMemberAdmin);

export default router;
