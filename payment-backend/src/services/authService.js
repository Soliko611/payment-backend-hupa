import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

const bcryptRounds = 12;
const usernamePattern = /^[a-zA-Z0-9_]{3,50}$/;

function validateCredentials(username, password) {
  if (typeof username !== 'string' || !usernamePattern.test(username)) {
    throw new HttpError(400, 'Username must be 3-50 letters, numbers, or underscores');
  }
  if (
    typeof password !== 'string' ||
    password.length < 12 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw new HttpError(400, 'Password must be at least 12 characters and no more than 72 bytes');
  }
}

function createToken(user) {
  return jwt.sign(
    { username: user.username },
    env.jwtSecret,
    { algorithm: 'HS256', subject: String(user.id), expiresIn: env.jwtExpiresIn }
  );
}

export async function register(username, password) {
  validateCredentials(username, password);
  const normalizedUsername = username.toLowerCase();
  const passwordHash = await bcrypt.hash(password, bcryptRounds);

  try {
    const result = await pool.query(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       RETURNING id, username, balance`,
      [normalizedUsername, passwordHash]
    );
    const user = result.rows[0];
    return { user: { ...user, balance: String(user.balance) }, token: createToken(user) };
  } catch (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'Username is already registered', { cause: error });
    }
    throw error;
  }
}

export async function login(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new HttpError(400, 'Username and password are required');
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new HttpError(401, 'Invalid username or password');
  }

  const result = await pool.query(
    `SELECT id, username, password_hash, balance
     FROM users
     WHERE username = $1`,
    [username.toLowerCase()]
  );
  const user = result.rows[0];
  const passwordMatches = user
    ? await bcrypt.compare(password, user.password_hash)
    : await bcrypt.compare(password, '$2b$12$C6UzMDM.H6dfI/f/IKcEe.OUrFlF5S8o4d6eN2CZWfI7Oiy1Kgm5K');

  if (!user || !passwordMatches) {
    throw new HttpError(401, 'Invalid username or password');
  }

  return {
    user: { id: user.id, username: user.username, balance: String(user.balance) },
    token: createToken(user)
  };
}
