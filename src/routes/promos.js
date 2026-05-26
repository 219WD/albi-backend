import { Router } from 'express';

import { requireEmailMktAdmin } from '../services/adminAuth.js';
import { createPromo, getActivePromo, listPromos, recordPromoEvent, updatePromo } from '../services/promos.js';

const router = Router();

router.get('/active', async (_req, res, next) => {
  try {
    const promo = await getActivePromo();
    res.json({ ok: true, promo });
  } catch (error) {
    next(error);
  }
});

router.post('/:promoId/events', async (req, res, next) => {
  try {
    const result = await recordPromoEvent(req.params.promoId, req.body?.type);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.use(requireEmailMktAdmin);

router.get('/', async (_req, res, next) => {
  try {
    const promos = await listPromos();
    res.json({ ok: true, promos });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const promo = await createPromo(req.body, req.adminUser);
    res.status(201).json({ ok: true, promo });
  } catch (error) {
    next(error);
  }
});

router.put('/:promoId', async (req, res, next) => {
  try {
    const promo = await updatePromo(req.params.promoId, req.body, req.adminUser);
    res.json({ ok: true, promo });
  } catch (error) {
    next(error);
  }
});

router.patch('/:promoId', async (req, res, next) => {
  try {
    const promo = await updatePromo(req.params.promoId, req.body, req.adminUser);
    res.json({ ok: true, promo });
  } catch (error) {
    next(error);
  }
});

export default router;
