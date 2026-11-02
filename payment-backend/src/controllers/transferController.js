import { executeTransfer } from '../services/transferService.js';

export async function executeTransferController(req, res) {
  const result = await executeTransfer(
    req.user.id,
    req.body?.receiverId,
    req.body?.amount,
    req.get('Idempotency-Key')
  );
  return res.status(201).json(result.responseBody);
}
