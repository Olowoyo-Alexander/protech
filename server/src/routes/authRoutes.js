import express from 'express';
import { register, verifySupervisor, resendCode, login, me } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', register);
router.post('/verify', verifySupervisor);
router.post('/resend', resendCode);
router.post('/login', login);
router.get('/me', protect, me);

export default router;
