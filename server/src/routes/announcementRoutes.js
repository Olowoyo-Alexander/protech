import express from 'express';
import {
  listAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
} from '../controllers/announcementController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.get('/', listAnnouncements);
router.post('/', authorize('admin'), createAnnouncement);
router.delete('/:id', authorize('admin'), deleteAnnouncement);

export default router;
