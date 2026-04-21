import './env.js';

import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import analyticsRoutes from './routes/analytics.js';
import unsubscribeRoutes from './routes/unsubscribe.js';
import welcomeRoutes from './routes/welcome.js';

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST'],
}));
app.use(express.json());

app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Demasiadas solicitudes, espera un minuto.' },
}));

app.use('/api', (req, res, next) => {
  const auth = req.headers.authorization || '';
  const secret = process.env.ANALYTICS_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  return next();
});

app.use('/api/analytics', analyticsRoutes);
app.use('/api/welcome', welcomeRoutes);
app.use('/', unsubscribeRoutes);

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err, _req, res, _next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

export default app;
