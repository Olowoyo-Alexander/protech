import express from 'express';
import { readSettings } from '../controllers/settingsController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.get('/', protect, readSettings);
export default router;
