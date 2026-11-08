import { Router } from 'express';
import {
  executeTransferController,
  getTransferHistoryController
} from '../controllers/transferController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';

const router = Router();

router.get('/', authMiddleware, asyncHandler(getTransferHistoryController));
router.post('/', authMiddleware, asyncHandler(executeTransferController));

export default router;
