import { Router } from 'express';
import {
  authenticateAdmin,
  createAdminToken,
  registerAdminUser,
  requireEmailMktAdmin,
} from '../services/adminAuth.js';
import {
  previewEmailMarketingRecipients,
  sendEmailMarketingCampaign,
} from '../services/emailmkt.js';

const router = Router();

router.post('/register', async (req, res, next) => {
  try {
    const admin = await registerAdminUser(req.body || {});

    return res.status(201).json({
      ok: true,
      admin,
      message: 'Usuario creado. Cambiale el rango en Mongo a emailmkt, admin o superadmin para habilitarlo.',
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  const { username, password } = req.body || {};

  try {
    const admin = await authenticateAdmin(String(username || '').trim(), String(password || ''));

    if (!admin) {
      return res.status(401).json({ error: 'Usuario o contrasena incorrectos' });
    }

    return res.json({
      ok: true,
      token: createAdminToken(admin),
      admin,
    });
  } catch (error) {
    return next(error);
  }
});

router.use(requireEmailMktAdmin);

router.get('/recipients', async (req, res, next) => {
  try {
    const result = await previewEmailMarketingRecipients(req.query.campaignId);
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
