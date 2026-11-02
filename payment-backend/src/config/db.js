import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'secure-wallet-backend'
});

pool.on('error', (error) => {
  console.error('Unexpected idle PostgreSQL client error:', error);
});
