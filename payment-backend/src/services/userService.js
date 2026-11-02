import { pool } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';

export async function getUserById(userId) {
  const result = await pool.query(
    'SELECT id, username, balance, created_at FROM users WHERE id = $1',
    [userId]
  );
  if (result.rowCount === 0) {
    throw new HttpError(404, 'User account not found');
  }
  const user = result.rows[0];
  return { ...user, balance: String(user.balance) };
}
