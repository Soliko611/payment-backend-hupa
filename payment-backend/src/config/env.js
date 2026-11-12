import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const jwtSecret = required('JWT_SECRET');
if (Buffer.byteLength(jwtSecret, 'utf8') < 32) {
  throw new Error('JWT_SECRET must be at least 32 bytes');
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const poolMax = Number.parseInt(process.env.PG_POOL_MAX ?? '10', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}
if (!Number.isInteger(poolMax) || poolMax < 1) {
  throw new Error('PG_POOL_MAX must be a positive integer');
}

const corsOrigins = [
  'http://localhost:5173',
  'https://soli-demo.onrender.com',
  ...(process.env.CORS_ORIGIN ?? '').split(',').map((origin) => origin.trim()).filter(Boolean)
];
const cookieSecure = nodeEnv === 'production' || process.env.COOKIE_SECURE === 'true';

export const env = Object.freeze({
  nodeEnv,
  port,
  databaseUrl: required('DATABASE_URL'),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  cookieSecure,
  cookieSameSite: cookieSecure ? 'none' : 'lax',
  corsOrigins: [...new Set(corsOrigins)],
  poolMax
});
