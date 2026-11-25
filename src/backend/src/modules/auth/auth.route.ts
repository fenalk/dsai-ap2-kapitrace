import { Router } from 'express';
import { register, login, refreshToken } from './auth.controller';
import { authenticate } from '../../middleware/auth';
import { limitLogin } from '../../middleware/login-limit';

const router = Router();

router.post('/register', register);
router.post('/login', limitLogin, login);
router.post('/refresh', authenticate, refreshToken);

export default router;
