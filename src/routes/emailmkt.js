import { Router } from 'express';
import {
  previewEmailMarketingRecipients,
  sendEmailMarketingCampaign,
} from '../services/emailmkt.js';

const router = Router();

router.get('/recipients', async (_req, res, next) => {
  try {
    const result = await previewEmailMarketingRecipients();
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
});

router.post('/send', async (req, res, next) => {
  try {
    const result = await sendEmailMarketingCampaign(req.body || {});
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
});

export default router;
