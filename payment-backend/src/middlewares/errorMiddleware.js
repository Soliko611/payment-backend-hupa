import { HttpError } from '../utils/httpError.js';

export function notFoundMiddleware(req, res) {
  res.status(404).json({ error: 'Route not found' });
}

export function errorMiddleware(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }

  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (error?.code === '23505') {
    return res.status(409).json({ error: 'Username is already registered' });
  }

  console.error('Unhandled request error:', error);
  return res.status(500).json({ error: 'Internal server error' });
}
