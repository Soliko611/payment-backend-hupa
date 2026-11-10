import { Router } from 'express';
import { loginController, logoutController, registerController } from '../controllers/authController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';

const router = Router();

router.post('/register', asyncHandler(registerController));
router.post('/login', asyncHandler(loginController));
router.post('/logout', logoutController);

export default router;
