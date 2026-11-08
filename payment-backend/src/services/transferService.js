import { createHash } from 'node:crypto';
import { pool } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createRequestHash(receiverId, amount) {
  return createHash('sha256')
    .update(JSON.stringify({ receiverId, amount: String(amount) }))
    .digest('hex');
}

function validateTransferData(senderId, receiverId, amount, idempotencyKey) {
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
  if (idempotencyKey !== undefined && idempotencyKey !== null) {
    if (typeof idempotencyKey !== 'string' || !uuidPattern.test(idempotencyKey)) {
      throw new HttpError(400, 'Idempotency-Key must be a UUID');
    }
  }
}

function assertMatchingRequest(record, requestHash) {
  if (record.request_hash.trim() !== requestHash) {
    throw new HttpError(409, 'Idempotency-Key was already used for a different request');
  }
}

function transferResponseBody(transfer) {
  return { ...transfer, amount: String(transfer.amount) };
}

async function recordReplay(queryable, senderId, receiverId, amount, idempotencyKey) {
  await queryable.query(
    `INSERT INTO audit_logs (event_type, user_id, details, success)
     VALUES ('TRANSFER_IDEMPOTENCY_REPLAYED', $1, $2::jsonb, true)`,
    [
      senderId,
      JSON.stringify({
        sender_id: senderId,
        receiver_id: receiverId,
        amount: String(amount),
        idempotency_key: idempotencyKey
      })
    ]
  );
}

async function recordFailure(senderId, receiverId, amount, error) {
  await pool.query(
    `INSERT INTO audit_logs (event_type, user_id, details, success)
     VALUES ('TRANSFER_FAILED', $1, $2::jsonb, false)`,
    [
      senderId,
      JSON.stringify({
        sender_id: senderId,
        receiver_id: receiverId,
        amount: String(amount),
        reason: error instanceof Error ? error.message : String(error)
      })
    ]
  );
}

async function throwAfterFailureAudit(senderId, receiverId, amount, error) {
  try {
    await recordFailure(senderId, receiverId, amount, error);
  } catch (auditError) {
    console.error('Failed to write transfer failure audit log:', auditError);
    throw new AggregateError(
      [error, auditError],
      'Transfer failed and its failure audit could not be recorded',
      { cause: error }
    );
  }
  throw error;
}

export async function executeTransfer(senderId, receiverId, amount, idempotencyKey) {
  validateTransferData(senderId, receiverId, amount, idempotencyKey);
  const requestHash = idempotencyKey
    ? createRequestHash(receiverId, amount)
    : null;

  // Completed requests can be replayed without acquiring a transaction connection.
  if (idempotencyKey) {
    const existingResult = await pool.query(
      `SELECT request_hash, status, response_body
       FROM idempotency_keys
       WHERE user_id = $1 AND idempotency_key = $2`,
      [senderId, idempotencyKey]
    );
    const existing = existingResult.rows[0];
    if (existing) {
      try {
        assertMatchingRequest(existing, requestHash);
      } catch (error) {
        await throwAfterFailureAudit(senderId, receiverId, amount, error);
      }
      if (existing.status === 'completed') {
        await recordReplay(pool, senderId, receiverId, amount, idempotencyKey);
        return { responseBody: existing.response_body };
      }
      await throwAfterFailureAudit(
        senderId,
        receiverId,
        amount,
        new HttpError(409, 'A request with this Idempotency-Key is already in progress')
      );
    }
  }

  let client;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    if (idempotencyKey) {
      const reservation = await client.query(
        `INSERT INTO idempotency_keys (user_id, idempotency_key, request_hash, status)
         VALUES ($1, $2, $3, 'in_progress')
         ON CONFLICT (user_id, idempotency_key) DO NOTHING
         RETURNING user_id`,
        [senderId, idempotencyKey, requestHash]
      );

      if (reservation.rowCount === 0) {
        const existingResult = await client.query(
          `SELECT request_hash, status, response_body
           FROM idempotency_keys
           WHERE user_id = $1 AND idempotency_key = $2
           FOR UPDATE`,
          [senderId, idempotencyKey]
        );
        const existing = existingResult.rows[0];
        if (!existing) {
          throw new Error('Idempotency record disappeared during transfer');
        }
        assertMatchingRequest(existing, requestHash);
        if (existing.status === 'completed') {
          await recordReplay(client, senderId, receiverId, amount, idempotencyKey);
          await client.query('COMMIT');
          transactionStarted = false;
          return { responseBody: existing.response_body };
        }
        throw new HttpError(409, 'A request with this Idempotency-Key is already in progress');
      }
    }

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

    const responseBody = transferResponseBody(transferResult.rows[0]);
    if (idempotencyKey) {
      await client.query(
        `UPDATE idempotency_keys
         SET status = 'completed', response_body = $3::jsonb, completed_at = NOW()
         WHERE user_id = $1 AND idempotency_key = $2`,
        [senderId, idempotencyKey, JSON.stringify(responseBody)]
      );
    }
    await client.query(
      `INSERT INTO audit_logs (event_type, user_id, details, success)
       VALUES ('TRANSFER_SUCCESS', $1, $2::jsonb, true)`,
      [
        senderId,
        JSON.stringify({
          sender_id: senderId,
          receiver_id: receiverId,
          amount: String(amount)
        })
      ]
    );

    await client.query('COMMIT');
    transactionStarted = false;
    return { responseBody };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Failed to roll back transfer transaction:', rollbackError);
      }
    }

    await throwAfterFailureAudit(senderId, receiverId, amount, error);
  } finally {
    client?.release();
  }
}

export async function getTransferHistory(userId) {
  const result = await pool.query(
    `SELECT
       transfers.id,
       transfers.sender_id,
       sender.username AS sender_username,
       transfers.receiver_id,
       receiver.username AS receiver_username,
       transfers.amount,
       transfers.status,
       transfers.created_at
     FROM transfers
     JOIN users AS sender ON sender.id = transfers.sender_id
     JOIN users AS receiver ON receiver.id = transfers.receiver_id
     WHERE transfers.sender_id = $1 OR transfers.receiver_id = $1
     ORDER BY transfers.created_at DESC, transfers.id DESC
     LIMIT 20`,
    [userId]
  );
  return result.rows.map((transfer) => ({
    ...transfer,
    amount: String(transfer.amount)
  }));
}
