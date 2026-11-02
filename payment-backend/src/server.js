import app from './app.js';
import { env } from './config/env.js';
import { pool } from './config/db.js';

const server = app.listen(env.port, () => {
  console.log(`Wallet API listening on port ${env.port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  server.close(async (serverError) => {
    try {
      await pool.end();
      if (serverError) {
        console.error('HTTP server shutdown failed:', serverError);
        process.exitCode = 1;
      }
    } catch (error) {
      console.error('Database pool shutdown failed:', error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
