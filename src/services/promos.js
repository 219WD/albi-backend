import mongoose from 'mongoose';
import Promo from '../models/Promo.js';

const DEFAULT_PROMO = {
  id: 'default',
  title: 'Accede a tu beneficio ahora',
  subtitle: 'Completa tus datos y recibi tu codigo exclusivo para la instalacion.',
  badge: 'BENEFICIO EXCLUSIVO',
  discountValue: '10%',
  discountLabel: 'OFF',
  offerText: 'Aprovecha este beneficio en la instalacion de tu sistema de seguridad.',
  features: [
    'Instalacion profesional sin costo',
    'Equipos confiables y garantia oficial',
    'Mas de 40 anos protegiendo Tucuman',
  ],
  ctaText: 'QUIERO MI BENEFICIO AHORA',
  successTitle: 'Listo. Tu beneficio ya esta activo',
  successText: 'Guarda este codigo y usalo al momento de coordinar la instalacion.',
  whatsappText: 'Hola, quiero usar mi beneficio de Albiero Seguridad.',
  active: true,
  metrics: {
    views: 0,
    clicks: 0,
    subscribes: 0,
    clickRate: 0,
    subscribeRate: 0,
  },
};

async function ensureMongoConnection() {
  if (mongoose.connection.readyState === 1) return;

  if (!process.env.MONGO_URI) {
    throw new Error('Falta MONGO_URI para promociones.');
  }

  await mongoose.connect(process.env.MONGO_URI);
}

function normalizeText(value) {
  return String(value || '').trim();
}

function parseOptionalDate(value, fieldName) {
  if (!value) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${fieldName} no tiene una fecha valida.`);
    error.statusCode = 400;
    throw error;
  }

  return date;
}

function toPublicPromo(promo) {
  if (!promo) return DEFAULT_PROMO;

  const views = Number(promo.metrics?.views || 0);
  const clicks = Number(promo.metrics?.clicks || 0);
  const subscribes = Number(promo.metrics?.subscribes || 0);

  return {
    id: String(promo._id || promo.id),
    title: promo.title,
    subtitle: promo.subtitle,
    badge: promo.badge,
    discountValue: promo.discountValue,
    discountLabel: promo.discountLabel,
    offerText: promo.offerText,
    features: promo.features || [],
    ctaText: promo.ctaText,
    successTitle: promo.successTitle,
    successText: promo.successText,
    whatsappText: promo.whatsappText,
    startAt: promo.startAt || null,
    endAt: promo.endAt || null,
    active: promo.active,
    metrics: {
      views,
      clicks,
      subscribes,
      clickRate: views > 0 ? Math.round((clicks / views) * 1000) / 10 : 0,
      subscribeRate: views > 0 ? Math.round((subscribes / views) * 1000) / 10 : 0,
    },
    createdAt: promo.createdAt || null,
    updatedAt: promo.updatedAt || null,
  };
}

function sanitizePromoInput(input = {}) {
  const title = normalizeText(input.title);

  if (!title) {
    const error = new Error('La promo necesita titulo.');
    error.statusCode = 400;
    throw error;
  }

  const features = Array.isArray(input.features)
    ? input.features.map(normalizeText).filter(Boolean).slice(0, 5)
    : normalizeText(input.features).split('\n').map(normalizeText).filter(Boolean).slice(0, 5);

  return {
    title,
    subtitle: normalizeText(input.subtitle),
    badge: normalizeText(input.badge) || 'BENEFICIO EXCLUSIVO',
    discountValue: normalizeText(input.discountValue) || '10%',
    discountLabel: normalizeText(input.discountLabel) || 'OFF',
    offerText: normalizeText(input.offerText),
    features,
    ctaText: normalizeText(input.ctaText) || 'QUIERO MI BENEFICIO AHORA',
    successTitle: normalizeText(input.successTitle) || 'Listo. Tu beneficio ya esta activo',
    successText: normalizeText(input.successText) || 'Guarda este codigo y usalo al coordinar la instalacion.',
    whatsappText: normalizeText(input.whatsappText),
    startAt: parseOptionalDate(input.startAt, 'startAt'),
    endAt: parseOptionalDate(input.endAt, 'endAt'),
    active: input.active !== false,
  };
}

export async function getActivePromo() {
  try {
    await ensureMongoConnection();
  } catch {
    return DEFAULT_PROMO;
  }

  const now = new Date();
  const promo = await Promo
    .findOne({
      active: true,
      $and: [
        { $or: [{ startAt: { $exists: false } }, { startAt: null }, { startAt: { $lte: now } }] },
        { $or: [{ endAt: { $exists: false } }, { endAt: null }, { endAt: { $gte: now } }] },
      ],
    })
    .sort({ startAt: -1, createdAt: -1 })
    .lean();

  return toPublicPromo(promo);
}

export async function listPromos() {
  await ensureMongoConnection();
  const promos = await Promo.find({}).sort({ createdAt: -1 }).lean();
  return promos.map(toPublicPromo);
}

export async function createPromo(input = {}, admin = {}) {
  await ensureMongoConnection();
  const payload = sanitizePromoInput(input);

  const promo = await Promo.create({
    ...payload,
    createdBy: admin.username || admin.email || '',
    updatedBy: admin.username || admin.email || '',
  });

  return toPublicPromo(promo);
}

export async function updatePromo(promoId, input = {}, admin = {}) {
  await ensureMongoConnection();

  if (!mongoose.Types.ObjectId.isValid(promoId)) {
    const error = new Error('Promo invalida.');
    error.statusCode = 400;
    throw error;
  }

  const payload = sanitizePromoInput(input);
  const promo = await Promo.findByIdAndUpdate(
    promoId,
    {
      ...payload,
      updatedBy: admin.username || admin.email || '',
    },
    { new: true, runValidators: true },
  );

  if (!promo) {
    const error = new Error('Promo no encontrada.');
    error.statusCode = 404;
    throw error;
  }

  return toPublicPromo(promo);
}

export async function recordPromoEvent(promoId, eventType) {
  if (!mongoose.Types.ObjectId.isValid(promoId)) {
    return { ok: true, ignored: true };
  }

  const eventMap = {
    view: 'metrics.views',
    click: 'metrics.clicks',
    subscribe: 'metrics.subscribes',
  };
  const field = eventMap[eventType];

  if (!field) {
    const error = new Error('Evento de promo invalido.');
    error.statusCode = 400;
    throw error;
  }

  await ensureMongoConnection();
  await Promo.updateOne({ _id: promoId }, { $inc: { [field]: 1 } });

  return { ok: true };
}
