import { Router } from 'express';
import { executeTransferController } from '../controllers/transferController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';

const router = Router();

router.post('/', authMiddleware, asyncHandler(executeTransferController));

export default router;
