import express from 'express';
import { supervisorDashboard } from '../controllers/dashboardController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
router.get('/dashboard', protect, authorize('supervisor', 'admin'), supervisorDashboard);
export default router;
