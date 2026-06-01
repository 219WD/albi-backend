import './env.js';

import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import analyticsRoutes from './routes/analytics.js';
import emailmktRoutes from './routes/emailmkt.js';
import metaCapiRoutes from './routes/metaCapi.js';
import promosRoutes from './routes/promos.js';
import reportsRoutes from './routes/reports.js';
import unsubscribeRoutes from './routes/unsubscribe.js';
import welcomeRoutes from './routes/welcome.js';
import { requireEmailMktAdmin } from './services/adminAuth.js';

const app = express();
const defaultOrigins = [
  'http://localhost:5173',
  'https://albiero.com.ar',
  'https://www.albiero.com.ar',
];
const envOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]))
  .map(origin => origin.replace(/\/$/, ''));
const corsOptions = {
  origin(origin, callback) {
    const normalizedOrigin = String(origin || '').replace(/\/$/, '');

    if (!origin || allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use('/meta', express.text({ type: 'text/plain' }));

app.use('/meta', rateLimit({
  windowMs: 60 * 1000,
  max: 3000,
  message: { error: 'Demasiados eventos, espera un minuto.' },
}));
app.use('/meta', metaCapiRoutes);

app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Demasiadas solicitudes, espera un minuto.' },
}));

app.use('/api/emailmkt', emailmktRoutes);
app.use('/api/promos', promosRoutes);
app.use('/api/reports', reportsRoutes);

app.use('/api', (req, res, next) => {
  const auth = req.headers.authorization || '';
  const secret = process.env.ANALYTICS_SECRET;

  if (secret && auth === `Bearer ${secret}`) {
    return next();
  }

  return requireEmailMktAdmin(req, res, next);
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
  const statusCode = Number(err.statusCode || err.status || 500);
  const safeStatusCode = statusCode >= 400 && statusCode < 600 ? statusCode : 500;
  res.status(safeStatusCode).json({
    error: safeStatusCode >= 500 ? 'Error interno del servidor' : err.message,
  });
});

export default app;
