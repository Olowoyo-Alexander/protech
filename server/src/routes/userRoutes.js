import express from 'express';
import {
  listUsers,
  lookupUser,
  searchSupervisors,
  supervisorByTag,
  updateMe,
  changePassword,
  getMyStats,
} from '../controllers/userController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.get('/supervisors', protect, searchSupervisors);
router.get('/supervisor-by-tag', protect, supervisorByTag);
router.get('/lookup', protect, lookupUser);
router.get('/me/stats', protect, getMyStats);
router.put('/me/password', protect, changePassword);
router.put('/me', protect, updateMe);
router.get('/', protect, listUsers);
export default router;
