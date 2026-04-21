import { Router } from 'express';
import { markEmailAsCancelled } from '../services/sheets.js';

const router = Router();

const confirmationHtml = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;background:#f4f4f4;display:flex;align-items:center;justify-content:center;min-height:100vh;}.card{background:#fff;padding:40px;border-radius:12px;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.1);max-width:400px;}h1{color:#961C2C;margin-bottom:12px;font-size:22px;}p{color:#555;font-size:14px;line-height:1.6;margin-top:8px;}</style></head><body><div class="card"><h1>Suscripción cancelada ✓</h1><p>Tu email fue eliminado de nuestra lista correctamente.</p><p style="font-size:12px;color:#999;">Si fue un error podés volver a registrarte en albiero.com.ar</p></div></body></html>';

router.get('/unsubscribe', async (req, res, next) => {
  try {
    const email = String(req.query.email || '').trim();

    if (!email) {
      return res.status(400).send('Falta el email.');
    }

    await markEmailAsCancelled(email);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.type('html').send(confirmationHtml);
  } catch (error) {
    return next(error);
  }
});

export default router;
