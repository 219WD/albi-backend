import { Router } from 'express';
import { requireEmailMktAdmin } from '../services/adminAuth.js';
import {
  getLeaderboard,
  getUserPredictions,
  getWorldCupFixture,
  loginWorldCupUser,
  registerWorldCupUser,
  requireWorldCupUser,
  saveMatchResult,
  savePrediction,
} from '../services/worldCup.js';

const router = Router();

router.post('/register', async (req, res, next) => {
  try {
    const result = await registerWorldCupUser(req.body || {});
    return res.status(201).json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const result = await loginWorldCupUser(req.body?.email, req.body?.password);
    if (!result) return res.status(401).json({ error: 'Email o contrasena incorrectos' });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
});

router.get('/fixture', async (_req, res, next) => {
  try {
    const fixture = await getWorldCupFixture();
    return res.json({ ok: true, ...fixture });
  } catch (error) {
    return next(error);
  }
});

router.get('/leaderboard', async (_req, res, next) => {
  try {
    const leaderboard = await getLeaderboard();
    return res.json({ ok: true, leaderboard });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', requireWorldCupUser, async (req, res, next) => {
  try {
    const predictions = await getUserPredictions(req.worldCupUser.id);
    return res.json({ ok: true, user: req.worldCupUser, predictions });
  } catch (error) {
    return next(error);
  }
});

router.put('/predictions/:matchId', requireWorldCupUser, async (req, res, next) => {
  try {
    const prediction = await savePrediction(req.worldCupUser.id, req.params.matchId, req.body || {});
    return res.json({ ok: true, prediction });
  } catch (error) {
    return next(error);
  }
});

router.patch('/matches/:matchId/result', requireEmailMktAdmin, async (req, res, next) => {
  try {
    const result = await saveMatchResult(req.params.matchId, req.body || {}, req.admin || {});
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
});

export default router;
