import express from 'express';
import {
  listUsers,
  changeRole,
  setMatric,
  verifyUser,
  setActive,
  deleteUser,
  resetUserPassword,
  overview,
  listGroups,
  getAdminSetupKey,
} from '../controllers/adminController.js';
import { updateSettings } from '../controllers/settingsController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
router.use(protect, authorize('admin'));

router.get('/overview', overview);
router.get('/setup-key', getAdminSetupKey);
router.get('/groups', listGroups);
router.get('/users', listUsers);
router.patch('/users/:id/role', changeRole);
router.patch('/users/:id/matric', setMatric);
router.patch('/users/:id/verify', verifyUser);
router.patch('/users/:id/active', setActive);
router.patch('/users/:id/password', resetUserPassword);
router.delete('/users/:id', deleteUser);
router.put('/settings', updateSettings);

export default router;
