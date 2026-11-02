import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const baseUrl = process.env.API_URL ?? 'http://localhost:3000';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const testUserIds = [];

async function request(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), options);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

async function createUser(username) {
  const { response, body } = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'concurrency-test-password' })
  });
  assert.equal(response.status, 201, `Could not register ${username}: ${JSON.stringify(body)}`);
  testUserIds.push(body.user.id);
  return body;
}

function sendTransfer(user, receiverId, amount, idempotencyKey = randomUUID()) {
  return request('/api/transfers', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${user.token}`,
      'idempotency-key': idempotencyKey
    },
    body: JSON.stringify({ receiverId, amount, senderId: receiverId })
  });
}

async function cleanup() {
  if (testUserIds.length > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM audit_logs WHERE user_id = ANY($1::int[])', [testUserIds]);
      await client.query(
        'DELETE FROM transfers WHERE sender_id = ANY($1::int[]) OR receiver_id = ANY($1::int[])',
        [testUserIds]
      );
      await client.query('DELETE FROM users WHERE id = ANY($1::int[])', [testUserIds]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

try {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
  const alice = await createUser(`test_a_${suffix}`);
  const bob = await createUser(`test_b_${suffix}`);

  const doubleSpendResults = await Promise.all([
    sendTransfer(alice, bob.user.id, 800),
    sendTransfer(alice, bob.user.id, 800)
  ]);
  assert.deepEqual(
    doubleSpendResults.map(({ response }) => response.status).sort(),
    [201, 409],
    'Exactly one simultaneous withdrawal may spend the available balance'
  );

  const crossTransfers = await Promise.all([
    sendTransfer(alice, bob.user.id, 50),
    sendTransfer(bob, alice.user.id, 50)
  ]);
  assert.deepEqual(
    crossTransfers.map(({ response }) => response.status),
    [201, 201],
    'Both opposite-direction transfers should complete without deadlock'
  );

  const retryKey = randomUUID();
  const idempotentResults = await Promise.all([
    sendTransfer(alice, bob.user.id, 10, retryKey),
    sendTransfer(alice, bob.user.id, 10, retryKey)
  ]);
  assert.deepEqual(
    idempotentResults.map(({ response }) => response.status),
    [201, 201],
    'A repeated Idempotency-Key should return the original success'
  );
  assert.deepEqual(
    idempotentResults[0].body,
    idempotentResults[1].body,
    'A repeated Idempotency-Key should return the original response body'
  );

  const reusedKeyResult = await sendTransfer(alice, bob.user.id, 11, retryKey);
  assert.equal(reusedKeyResult.response.status, 409, 'A key cannot be reused for a different request');

  const balances = await pool.query(
    'SELECT id, balance FROM users WHERE id = ANY($1::int[]) ORDER BY id',
    [testUserIds]
  );
  const totalBalance = balances.rows.reduce((sum, user) => sum + BigInt(user.balance), 0n);
  assert.equal(totalBalance, 2000n, 'The total balance must remain exactly conserved');
  assert.ok(
    balances.rows.every((user) => BigInt(user.balance) >= 0n),
    'No account balance may become negative'
  );

  const audit = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM transfers
        WHERE sender_id = ANY($1::int[]) AND receiver_id = ANY($1::int[])) AS transfer_count,
       (SELECT COUNT(*)::int FROM audit_logs
        WHERE user_id = ANY($1::int[]) AND event_type = 'transfer.failed') AS failure_count,
       (SELECT COUNT(*)::int FROM audit_logs
        WHERE user_id = ANY($1::int[]) AND event_type = 'transfer.idempotency_replayed') AS replay_count`,
    [testUserIds]
  );
  assert.equal(audit.rows[0].transfer_count, 4, 'Only committed transfers should have transfer rows');
  assert.equal(audit.rows[0].failure_count, 2, 'Both rejected operations should be audited');
  assert.equal(audit.rows[0].replay_count, 1, 'The idempotent retry should be audited');

  console.log('Concurrency test passed:');
  console.log('- simultaneous double spending allowed exactly one withdrawal');
  console.log('- opposite-direction transfers completed without deadlock');
  console.log('- repeated idempotency key returned the original response');
  console.log(`- system invariant preserved: combined balance is ${totalBalance}`);
} finally {
  try {
    await cleanup();
  } finally {
    await pool.end();
  }
}
