import express from 'express';
import { readSettings } from '../controllers/settingsController.js';

// Public read — the department/set taxonomy needs to populate registration
// forms for logged-out visitors too. Writing stays admin-only via adminRoutes.
const router = express.Router();
router.get('/', readSettings);
export default router;
