import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import transferRoutes from './routes/transferRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { errorMiddleware, notFoundMiddleware } from './middlewares/errorMiddleware.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: env.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key']
}));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts; try again later' }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/users', userRoutes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
