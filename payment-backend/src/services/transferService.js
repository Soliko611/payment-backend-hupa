import { pool } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';

export async function executeTransfer(senderId, receiverId, amount) {
  //"guard closer" - func validateTransferData
  if (!Number.isSafeInteger(senderId) || senderId < 1) {
    throw new HttpError(401, 'Invalid authenticated user');
  }
  if (!Number.isSafeInteger(receiverId) || receiverId < 1) {
    throw new HttpError(400, 'receiverId must be a positive integer');
  }
  if (receiverId === senderId) {
    throw new HttpError(400, 'Cannot transfer funds to the same account');
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new HttpError(400, 'amount must be a positive safe integer');
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    // Lock rows in ascending ID order so opposite-direction transfers cannot deadlock.
    const lockOrder = [senderId, receiverId].sort((left, right) => left - right);
    const lockedUsers = new Map();
    for (const userId of lockOrder) {
      const result = await client.query(
        'SELECT id, balance FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );
      if (result.rowCount === 0) {
        throw new HttpError(404, 'Sender or receiver account not found');
      }
      lockedUsers.set(userId, BigInt(result.rows[0].balance));
    }

    const senderBalance = lockedUsers.get(senderId);
    if (senderBalance < BigInt(amount)) {
      throw new HttpError(409, 'Insufficient funds');
    }

    // Both balance mutations and the audit record commit or roll back together.
    await client.query(
      'UPDATE users SET balance = balance - $1 WHERE id = $2',
      [amount, senderId]
    );
    await client.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2',
      [amount, receiverId]
    );
    const transferResult = await client.query(
      `INSERT INTO transfers (sender_id, receiver_id, amount, status)
       VALUES ($1, $2, $3, 'completed')
       RETURNING id, sender_id, receiver_id, amount, status, created_at`,
      [senderId, receiverId, amount]
    );

    await client.query('COMMIT');
    transactionStarted = false;
    const transfer = transferResult.rows[0];
    return { ...transfer, amount: String(transfer.amount) };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Failed to roll back transfer transaction:', rollbackError);
      }
    }
    throw error;
  } finally {
    client.release();
  }
}
