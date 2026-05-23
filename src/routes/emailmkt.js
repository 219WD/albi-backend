import { Router } from 'express';
import {
  authenticateAdmin,
  createAdminToken,
  registerAdminUser,
  requireEmailMktAdmin,
} from '../services/adminAuth.js';
import {
  createEmailMarketingTemplate,
  deleteEmailMarketingTemplate,
  getEmailMarketingCampaignDetail,
  getEmailMarketingCampaigns,
  getEmailMarketingTemplate,
  getEmailMarketingTemplates,
  previewEmailMarketingRecipients,
  sendEmailMarketingCampaign,
  updateEmailMarketingTemplate,
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

router.get('/campaigns', async (_req, res, next) => {
  try {
    const campaigns = await getEmailMarketingCampaigns();
    return res.json({ ok: true, campaigns });
  } catch (error) {
    return next(error);
  }
});

router.get('/campaigns/:campaignId', async (req, res, next) => {
  try {
    const campaign = await getEmailMarketingCampaignDetail(req.params.campaignId);
    return res.json({ ok: true, campaign });
  } catch (error) {
    return next(error);
  }
});

router.get('/templates', async (_req, res, next) => {
  try {
    const templates = await getEmailMarketingTemplates();
    return res.json({ ok: true, templates });
  } catch (error) {
    return next(error);
  }
});

router.get('/templates/:templateId', async (req, res, next) => {
  try {
    const template = await getEmailMarketingTemplate(req.params.templateId);
    return res.json({ ok: true, template });
  } catch (error) {
    return next(error);
  }
});

router.post('/templates', async (req, res, next) => {
  try {
    const template = await createEmailMarketingTemplate(req.body || {}, req.admin || {});
    return res.status(201).json({ ok: true, template });
  } catch (error) {
    return next(error);
  }
});

router.put('/templates/:templateId', async (req, res, next) => {
  try {
    const template = await updateEmailMarketingTemplate(req.params.templateId, req.body || {}, req.admin || {});
    return res.json({ ok: true, template });
  } catch (error) {
    return next(error);
  }
});

router.delete('/templates/:templateId', async (req, res, next) => {
  try {
    const template = await deleteEmailMarketingTemplate(req.params.templateId);
    return res.json({ ok: true, template });
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
