import express from 'express';
import { getThread, sendMessage, unreadCounts, deleteMessage } from '../controllers/messageController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);
router.get('/', unreadCounts);
router.delete('/msg/:messageId', deleteMessage);
router.get('/:userId', getThread);
router.post('/:userId', sendMessage);
export default router;
