import { Router } from 'express';
import { appendLeadEventToSheet } from '../services/sheets.js';

const router = Router();
const GRAPH_API_VERSION = 'v21.0';

const cleanObject = (value = {}) =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => (
      entry !== undefined &&
      entry !== null &&
      entry !== ''
    ))
  );

const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.headers['x-real-ip'] || req.socket?.remoteAddress;
};

const isLeadEvent = (eventName) => String(eventName || '').endsWith('FormularioEnviado_WhatsApp');

const inferProductFromEvent = (eventName) => {
  const name = String(eventName || '');

  if (name.startsWith('Alarmas_')) return 'Alarmas';
  if (name.startsWith('Camaras_')) return 'Camaras';
  if (name.startsWith('GPS_')) return 'GPS';
  if (name.startsWith('Incendio_')) return 'Incendio';
  if (name.startsWith('SeguridadIntegral_')) return 'SeguridadIntegral';

  return 'KitAlarmaCamara';
};

router.post('/capi', async (req, res, next) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const pixelId = process.env.META_PIXEL_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (!pixelId || !accessToken) {
      return res.status(500).json({ error: 'Meta CAPI no esta configurado' });
    }

    const {
      event_name: eventName,
      event_id: eventId,
      event_source_url: eventSourceUrl,
      custom_data: customData,
      fbp,
      fbc,
    } = body;

    if (!eventName) {
      return res.status(400).json({ error: 'Falta event_name' });
    }

    const event = cleanObject({
      event_name: String(eventName),
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: eventSourceUrl || req.headers.referer,
      action_source: 'website',
      user_data: cleanObject({
        client_ip_address: getClientIp(req),
        client_user_agent: req.headers['user-agent'],
        fbp,
        fbc,
      }),
      custom_data: cleanObject(customData),
    });

    const payload = { data: [event] };

    if (process.env.META_TEST_EVENT_CODE) {
      payload.test_event_code = process.env.META_TEST_EVENT_CODE;
    }

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
    const metaResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await metaResponse.json().catch(() => ({}));

    if (isLeadEvent(eventName)) {
      try {
        await appendLeadEventToSheet({
          eventName,
          email: customData?.email,
          nombre: customData?.nombre,
          codigo: customData?.codigo,
          tipo: customData?.tipo,
          ubicacion: customData?.ubicacion,
          sistema: customData?.sistema,
          producto: customData?.producto || inferProductFromEvent(eventName),
          bienvenidaEnviada: customData?.bienvenida_enviada,
        });
      } catch (sheetError) {
        console.error('[Sheets] No se pudo guardar el lead', sheetError);
      }
    }

    if (!metaResponse.ok) {
      console.error('[Meta CAPI]', result);
      return res.status(502).json({ error: 'Meta CAPI rechazo el evento', details: result });
    }

    return res.json({ ok: true, result });
  } catch (err) {
    return next(err);
  }
});

export default router;
