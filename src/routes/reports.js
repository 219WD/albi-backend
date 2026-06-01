import { Router } from 'express';

import { requireEmailMktAdmin } from '../services/adminAuth.js';
import { createReport, getPublicReport, listReports, updateReport } from '../services/reports.js';

const router = Router();

router.get('/public/:token', async (req, res, next) => {
  try {
    const result = await getPublicReport(req.params.token);
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.use(requireEmailMktAdmin);

router.get('/', async (_req, res, next) => {
  try {
    const reports = await listReports();
    res.json({ ok: true, reports });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const report = await createReport(req.body, req.adminUser);
    res.status(201).json({ ok: true, report });
  } catch (error) {
    next(error);
  }
});

router.patch('/:reportId', async (req, res, next) => {
  try {
    const report = await updateReport(req.params.reportId, req.body, req.adminUser);
    res.json({ ok: true, report });
  } catch (error) {
    next(error);
  }
});

export default router;
