import { Router } from 'express';
import { getCurrentUserController } from '../controllers/userController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';

const router = Router();

router.get('/me', authMiddleware, asyncHandler(getCurrentUserController));

export default router;
