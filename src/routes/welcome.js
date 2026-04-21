import { Router } from 'express';
import { processWelcomeEmails } from '../services/welcomeFlow.js';

const router = Router();

router.post('/process', async (req, res, next) => {
  try {
    const result = await processWelcomeEmails({
      dryRun: req.query.dryRun === '1' || req.query.dryRun === 'true',
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
});

export default router;
