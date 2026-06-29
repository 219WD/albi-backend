import { Router } from 'express';
import crypto from 'crypto';
import { appendLeadEventToSheet } from '../services/sheets.js';
import { saveEmailMarketingLead } from '../services/emailmkt.js';

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

const normalizeEmail = (value = '') => {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
};

const normalizeName = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const normalizePhone = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('549')) return digits;
  if (digits.startsWith('54')) return `549${digits.slice(2)}`;
  return `549${digits}`;
};

const sha256 = (value = '') =>
  crypto
    .createHash('sha256')
    .update(String(value))
    .digest('hex');

const buildAdvancedUserData = ({ customData = {}, userData = {} }) => {
  const email = normalizeEmail(userData.em || userData.email || customData.email);
  const phone = normalizePhone(userData.ph || userData.phone || customData.telefono || customData.phone);
  const nombre = normalizeName(userData.nombre || customData.nombre);
  const nameParts = nombre.split(/\s+/).filter(Boolean);
  const firstName = normalizeName(userData.fn) || nameParts[0] || '';
  const lastName = normalizeName(userData.ln) || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');
  const city = normalizeName(userData.ct || customData.ciudad || customData.ubicacion);
  const state = normalizeName(userData.st || customData.provincia || 'Tucuman');
  const country = normalizeName(userData.country || customData.pais || 'ar');
  const zip = String(userData.zp || customData.codigo_postal || customData.cp || '4000').trim().toLowerCase();
  const externalId = String(userData.external_id || customData.external_id || '').trim();

  return cleanObject({
    em: email ? [sha256(email)] : undefined,
    ph: phone ? [sha256(phone)] : undefined,
    fn: firstName ? [sha256(firstName)] : undefined,
    ln: lastName ? [sha256(lastName)] : undefined,
    ct: city ? [sha256(city)] : undefined,
    st: state ? [sha256(state)] : undefined,
    country: country ? [sha256(country)] : undefined,
    zp: zip ? [sha256(zip)] : undefined,
    external_id: externalId || undefined,
  });
};

const stripMetaCustomData = (customData = {}) => {
  const {
    email,
    nombre,
    telefono,
    phone,
    ciudad,
    provincia,
    pais,
    codigo_postal: codigoPostal,
    cp,
    external_id: externalId,
    codigo,
    bienvenida_enviada: bienvenidaEnviada,
    ...safeCustomData
  } = customData || {};

  return safeCustomData;
};

const needsValueCurrency = (eventName = '') => {
  const name = String(eventName || '');
  return name.includes('Paso3_') || name === 'Paso3_SistemaSeleccionado' || name.endsWith('FormularioEnviado_WhatsApp');
};

const normalizeValueCurrency = (eventName = '', customData = {}) => {
  if (!needsValueCurrency(eventName)) return customData || {};

  const value = Number(customData?.value ?? customData?.valor_lead);
  const currency = String(customData?.currency || customData?.currency_code || '').trim().toUpperCase();

  return {
    ...(customData || {}),
    value: Number.isFinite(value) && value > 0 ? value : 1,
    valor_lead: Number.isFinite(value) && value > 0 ? value : 1,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'ARS',
  };
};

const inferProductFromEvent = (eventName) => {
  const name = String(eventName || '');

  if (name.startsWith('Alarmas_')) return 'Alarmas';
  if (name.startsWith('Camaras_')) return 'Camaras';
  if (name.startsWith('GPS_')) return 'GPS';
  if (name.startsWith('Incendio_')) return 'Incendio';
  if (name.startsWith('SeguridadIntegral_')) return 'SeguridadIntegral';

  return 'KitAlarmaCamara';
};

const handleCapiEvent = async (req, res, next) => {
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
      user_data: browserUserData,
      test_event_code: requestTestEventCode,
      fbp,
      fbc,
    } = body;

    if (!eventName) {
      return res.status(400).json({ error: 'Falta event_name' });
    }

    const normalizedCustomData = normalizeValueCurrency(eventName, customData);

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
        ...buildAdvancedUserData({ customData: normalizedCustomData, userData: browserUserData }),
      }),
      custom_data: cleanObject(stripMetaCustomData(normalizedCustomData)),
    });

    const payload = { data: [event] };

    const testEventCode = String(requestTestEventCode || process.env.META_TEST_EVENT_CODE || '').trim();
    if (testEventCode) {
      payload.test_event_code = testEventCode;
    }

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
    const metaResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await metaResponse.json().catch(() => ({}));

    const leadEmail = normalizeEmail(normalizedCustomData?.email || browserUserData?.em || browserUserData?.email);
    if (leadEmail) {
      try {
        await saveEmailMarketingLead({
          email: leadEmail,
          nombre: normalizedCustomData?.nombre || browserUserData?.nombre,
          telefono: normalizedCustomData?.telefono || normalizedCustomData?.phone || browserUserData?.ph,
          codigo: normalizedCustomData?.codigo,
          source: String(eventName || '').startsWith('Promo_') ? 'promo' : 'meta_capi',
          promoId: normalizedCustomData?.promo_id,
          tipo: normalizedCustomData?.tipo,
          ubicacion: normalizedCustomData?.ubicacion,
          sistema: normalizedCustomData?.sistema,
          producto: normalizedCustomData?.producto || inferProductFromEvent(eventName),
          bienvenidaEnviada: Boolean(normalizedCustomData?.bienvenida_enviada),
        });
      } catch (leadError) {
        console.error('[Leads] No se pudo guardar el lead en Mongo', leadError);
      }
    }

    if (isLeadEvent(eventName)) {
      try {
        await appendLeadEventToSheet({
          eventName,
          email: normalizedCustomData?.email,
          nombre: normalizedCustomData?.nombre,
          telefono: normalizedCustomData?.telefono || normalizedCustomData?.phone || browserUserData?.ph,
          codigo: normalizedCustomData?.codigo,
          tipo: normalizedCustomData?.tipo,
          ubicacion: normalizedCustomData?.ubicacion,
          sistema: normalizedCustomData?.sistema,
          producto: normalizedCustomData?.producto || inferProductFromEvent(eventName),
          bienvenidaEnviada: normalizedCustomData?.bienvenida_enviada,
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
};

router.post('/capi', handleCapiEvent);
router.post('/track', handleCapiEvent);

export default router;

