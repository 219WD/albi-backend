import '../env.js';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import CampaignSend from '../models/CampaignSend.js';
import EmailTemplate from '../models/EmailTemplate.js';
import Lead from '../models/Lead.js';
import { getSheetRows } from './sheets.js';

function getEmailConfig() {
  return {
    emailUser: String(process.env.EMAIL_USER || '').trim(),
    emailPass: String(process.env.EMAIL_PASS || '').trim().replace(/\s+/g, ''),
  };
}

function createTransporter() {
  const { emailUser, emailPass } = getEmailConfig();

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });
}

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildUnsubscribeUrl = (email) => {
  const baseUrl = (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
  return `${baseUrl}/unsubscribe?email=${encodeURIComponent(email)}`;
};

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

async function ensureMongoConnection() {
  if (mongoose.connection.readyState === 1) return;

  if (!process.env.MONGO_URI) {
    throw new Error('Falta MONGO_URI para guardar historial de campanas.');
  }

  await mongoose.connect(process.env.MONGO_URI);
}

function getNewsletterRecipientsFromRows(rows) {
  const seen = new Set();

  return rows
    .map((row) => ({
      email: String(row.email || '').trim().toLowerCase(),
      nombre: String(row.nombre || '').trim(),
      bienvenida: String(row.bienvenida_enviada || '').trim().toLowerCase(),
    }))
    .filter((row) => isValidEmail(row.email))
    .filter((row) => row.bienvenida !== 'cancelado')
    .filter((row) => {
      if (seen.has(row.email)) return false;
      seen.add(row.email);
      return true;
    });
}

function serializeLeadRecipient(lead = {}) {
  return {
    email: String(lead.email || '').trim().toLowerCase(),
    nombre: String(lead.nombre || '').trim(),
    bienvenida: lead.unsubscribed ? 'cancelado' : '',
  };
}

function getUniqueRecipients(recipients = []) {
  const seen = new Set();

  return recipients
    .map((row) => ({
      email: String(row.email || '').trim().toLowerCase(),
      nombre: String(row.nombre || '').trim(),
      bienvenida: String(row.bienvenida || '').trim().toLowerCase(),
    }))
    .filter((row) => isValidEmail(row.email))
    .filter((row) => row.bienvenida !== 'cancelado')
    .filter((row) => {
      if (seen.has(row.email)) return false;
      seen.add(row.email);
      return true;
    });
}

export async function saveEmailMarketingLead(input = {}) {
  const email = String(input.email || '').trim().toLowerCase();
  const nombre = String(input.nombre || '').trim();

  if (!isValidEmail(email)) {
    const error = new Error('Ingresa un email valido.');
    error.statusCode = 400;
    throw error;
  }

  await ensureMongoConnection();

  const lead = await Lead.findOneAndUpdate(
    { email },
    {
      $set: {
        nombre,
        codigo: String(input.codigo || '').trim(),
        source: String(input.source || 'website').trim(),
        promoId: String(input.promoId || '').trim(),
        tipo: String(input.tipo || '').trim(),
        ubicacion: String(input.ubicacion || '').trim(),
        sistema: String(input.sistema || '').trim(),
        producto: String(input.producto || '').trim(),
        bienvenidaEnviada: Boolean(input.bienvenidaEnviada),
        unsubscribed: false,
      },
      $setOnInsert: {
        abVariant: String(input.abVariant || '').trim(),
      },
    },
    { new: true, upsert: true, runValidators: true }
  ).lean();

  return serializeLeadRecipient(lead);
}

async function getNewsletterRecipients() {
  await ensureMongoConnection();

  const leads = await Lead.find({ unsubscribed: { $ne: true } })
    .sort({ updatedAt: -1 })
    .select('email nombre unsubscribed')
    .lean();

  const dbRecipients = getUniqueRecipients(leads.map(serializeLeadRecipient));
  if (dbRecipients.length > 0) {
    return { rows: leads, recipients: dbRecipients, source: 'mongodb' };
  }

  const rows = await getSheetRows();
  return { rows, recipients: getNewsletterRecipientsFromRows(rows), source: 'google_sheets' };
}

function contentToHtml(content = '') {
  return String(content)
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function normalizeButtons(buttons = []) {
  return buttons
    .filter((button) => String(button?.label || '').trim() && String(button?.url || '').trim())
    .slice(0, 3)
    .map((button) => ({
      label: String(button.label).trim(),
      url: String(button.url).trim(),
    }));
}

function buildCampaignHtml({ recipient, campaign }) {
  const title = campaign.title || campaign.subject;
  const preheader = campaign.preheader || campaign.subject;
  const buttons = normalizeButtons(campaign.buttons);
  const buttonsHtml = buttons
    .map((button) => `<a class="cta-btn" href="${escapeHtml(button.url)}">${escapeHtml(button.label)}</a>`)
    .join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#f4f4f4;font-family:Arial,sans-serif;color:#1a1a1a}.preheader{display:none;max-height:0;overflow:hidden;opacity:0}.wrap{max-width:620px;margin:28px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.1)}.header{background:linear-gradient(135deg,#7D1522,#961C2C);padding:32px 24px;text-align:center}.header img{width:92px;margin:0 auto 14px;display:block}.header h1{color:#fff;font-size:25px;line-height:1.25;margin:0}.header p{color:rgba(255,255,255,.84);font-size:13px;margin:8px 0 0}.body{padding:30px 34px}.body p{font-size:15px;line-height:1.7;color:#555;margin:0 0 14px}.cta{text-align:center;margin:26px 0 6px}.cta-btn{display:inline-block;background:#961C2C;color:#fff!important;text-decoration:none;font-size:14px;font-weight:700;padding:13px 28px;border-radius:10px;margin:6px}.contacto{background:#f8f8f8;border-radius:10px;padding:18px;margin-top:24px}.contacto h4{font-size:12px;font-weight:700;color:#1a1a1a;margin:0 0 10px;text-transform:uppercase;letter-spacing:.08em}.contacto p{font-size:12px;color:#555;margin:0 0 5px}.contacto a{color:#961C2C;text-decoration:none}.footer{background:#1a1a1a;padding:18px 32px;text-align:center}.footer p{font-size:11px;color:rgba(255,255,255,.44);margin:0 0 6px;line-height:1.6}.footer a{color:rgba(255,255,255,.62)}</style></head><body><span class="preheader">${escapeHtml(preheader)}</span><div class="wrap"><div class="header"><img src="https://res.cloudinary.com/dtxdv136u/image/upload/v1763499836/logo_alb_ged07k.png" alt="Albiero Seguridad"><h1>${escapeHtml(title)}</h1><p>Albiero Seguridad &middot; +40 anos protegiendo Tucuman</p></div><div class="body">${contentToHtml(campaign.content)}${buttonsHtml ? `<div class="cta">${buttonsHtml}</div>` : ''}<div class="contacto"><h4>Contacto directo</h4><p>Tel: <a href="tel:+543814531300">0381 453 1300</a></p><p>Email: <a href="mailto:info@albiero.com.ar">info@albiero.com.ar</a></p><p>Catamarca 479, San Miguel de Tucuman</p></div></div><div class="footer"><p>Recibiste este email porque te registraste en Albiero Seguridad.</p><p><a href="${buildUnsubscribeUrl(recipient.email)}">Cancelar suscripcion</a></p></div></div></body></html>`;
}

function validateCampaign(campaign = {}) {
  const campaignId = String(campaign.campaignId || '').trim();
  const subject = String(campaign.subject || '').trim();
  const title = String(campaign.title || '').trim();
  const content = String(campaign.content || '').trim();

  if (!campaignId) throw new Error('Falta el ID de campana.');
  if (!/^[a-zA-Z0-9_-]{3,80}$/.test(campaignId)) {
    throw new Error('El ID de campana solo puede tener letras, numeros, guiones y guion bajo.');
  }
  if (!subject) throw new Error('Falta el asunto.');
  if (!title) throw new Error('Falta el titulo.');
  if (!content) throw new Error('Falta el contenido.');

  return {
    campaignId,
    subject,
    title,
    preheader: String(campaign.preheader || '').trim(),
    content,
    buttons: normalizeButtons(campaign.buttons),
  };
}

function normalizeTemplatePayload(template = {}) {
  const name = String(template.name || '').trim();
  const subject = String(template.subject || '').trim();
  const title = String(template.title || '').trim();
  const content = String(template.content || '').trim();

  if (!name) throw new Error('Falta el nombre de la plantilla.');
  if (name.length < 3 || name.length > 90) {
    throw new Error('El nombre de la plantilla debe tener entre 3 y 90 caracteres.');
  }
  if (!subject) throw new Error('Falta el asunto de la plantilla.');
  if (!title) throw new Error('Falta el titulo de la plantilla.');
  if (!content) throw new Error('Falta el contenido de la plantilla.');

  return {
    name,
    subject,
    title,
    preheader: String(template.preheader || '').trim(),
    content,
    buttons: normalizeButtons(template.buttons),
  };
}

const serializeTemplate = (template) => ({
  id: String(template._id),
  name: template.name || '',
  subject: template.subject || '',
  title: template.title || '',
  preheader: template.preheader || '',
  content: template.content || '',
  buttons: normalizeButtons(template.buttons || []),
  createdBy: template.createdBy || '',
  updatedBy: template.updatedBy || '',
  createdAt: template.createdAt,
  updatedAt: template.updatedAt,
});

export async function getEmailMarketingTemplates() {
  await ensureMongoConnection();

  const templates = await EmailTemplate.find({})
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();

  return templates.map(serializeTemplate);
}

export async function getEmailMarketingTemplate(templateId = '') {
  await ensureMongoConnection();

  const template = await EmailTemplate.findById(String(templateId || '').trim()).lean();
  if (!template) throw new Error('Plantilla no encontrada.');

  return serializeTemplate(template);
}

export async function createEmailMarketingTemplate(templateInput = {}, admin = {}) {
  await ensureMongoConnection();

  const payload = normalizeTemplatePayload(templateInput);
  const username = admin.username || admin.email || '';

  const existing = await EmailTemplate.findOne({ name: payload.name }).select('_id').lean();
  if (existing) throw new Error('Ya existe una plantilla con ese nombre.');

  const template = await EmailTemplate.create({
    ...payload,
    createdBy: username,
    updatedBy: username,
  });

  return serializeTemplate(template.toObject());
}

export async function updateEmailMarketingTemplate(templateId = '', templateInput = {}, admin = {}) {
  await ensureMongoConnection();

  const payload = normalizeTemplatePayload(templateInput);
  const id = String(templateId || '').trim();
  const username = admin.username || admin.email || '';

  const existing = await EmailTemplate.findOne({ name: payload.name, _id: { $ne: id } }).select('_id').lean();
  if (existing) throw new Error('Ya existe otra plantilla con ese nombre.');

  const template = await EmailTemplate.findByIdAndUpdate(
    id,
    { $set: { ...payload, updatedBy: username } },
    { new: true, runValidators: true }
  ).lean();

  if (!template) throw new Error('Plantilla no encontrada.');

  return serializeTemplate(template);
}

export async function deleteEmailMarketingTemplate(templateId = '') {
  await ensureMongoConnection();

  const result = await EmailTemplate.findByIdAndDelete(String(templateId || '').trim()).lean();
  if (!result) throw new Error('Plantilla no encontrada.');

  return serializeTemplate(result);
}

async function filterAlreadySentRecipients(campaignId, recipients) {
  await ensureMongoConnection();

  const sentRows = await CampaignSend.find({
    campaignId,
    email: { $in: recipients.map((recipient) => recipient.email) },
    status: 'sent',
  }).select('email').lean();
  const sentEmails = new Set(sentRows.map((row) => row.email));

  return {
    sentEmails,
    eligibleRecipients: recipients.filter((recipient) => !sentEmails.has(recipient.email)),
  };
}

export async function previewEmailMarketingRecipients(campaignId = '') {
  const { rows, recipients, source } = await getNewsletterRecipients();
  const normalizedCampaignId = String(campaignId || '').trim();
  const filtered = normalizedCampaignId
    ? await filterAlreadySentRecipients(normalizedCampaignId, recipients)
    : { sentEmails: new Set(), eligibleRecipients: recipients };

  return {
    source,
    totalRows: rows.length,
    recipients: recipients.length,
    alreadySent: filtered.sentEmails.size,
    eligible: filtered.eligibleRecipients.length,
    preview: filtered.eligibleRecipients.slice(0, 15),
  };
}

export async function getEmailMarketingCampaigns() {
  await ensureMongoConnection();

  const campaigns = await CampaignSend.aggregate([
    {
      $group: {
        _id: '$campaignId',
        subject: { $last: '$subject' },
        total: { $sum: 1 },
        sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        firstSentAt: { $min: '$sentAt' },
        lastSentAt: { $max: '$sentAt' },
      },
    },
    { $sort: { lastSentAt: -1 } },
    { $limit: 100 },
  ]);

  return campaigns.map((campaign) => ({
    campaignId: campaign._id,
    subject: campaign.subject || '',
    total: campaign.total,
    sent: campaign.sent,
    failed: campaign.failed,
    firstSentAt: campaign.firstSentAt,
    lastSentAt: campaign.lastSentAt,
  }));
}

export async function getEmailMarketingCampaignDetail(campaignId = '') {
  await ensureMongoConnection();

  const normalizedCampaignId = String(campaignId || '').trim();

  if (!normalizedCampaignId) {
    throw new Error('Falta el ID de campana.');
  }

  const rows = await CampaignSend.find({ campaignId: normalizedCampaignId })
    .sort({ sentAt: -1, updatedAt: -1 })
    .limit(300)
    .select('campaignId email subject status error sentAt updatedAt')
    .lean();

  const summary = rows.reduce((acc, row) => {
    acc.total += 1;
    if (row.status === 'sent') acc.sent += 1;
    if (row.status === 'failed') acc.failed += 1;
    return acc;
  }, { total: 0, sent: 0, failed: 0 });

  return {
    campaignId: normalizedCampaignId,
    ...summary,
    recipients: rows.map((row) => ({
      email: row.email,
      subject: row.subject || '',
      status: row.status,
      error: row.error || '',
      sentAt: row.sentAt,
      updatedAt: row.updatedAt,
    })),
  };
}

export async function sendEmailMarketingCampaign(campaignInput = {}) {
  const campaign = validateCampaign(campaignInput);
  const { emailUser, emailPass } = getEmailConfig();

  if (!emailUser || !emailPass) {
    throw new Error('Faltan EMAIL_USER o EMAIL_PASS en el archivo .env.');
  }

  const { recipients: allRecipients } = await getNewsletterRecipients();
  const { sentEmails, eligibleRecipients } = await filterAlreadySentRecipients(campaign.campaignId, allRecipients);
  const transporter = createTransporter();
  const concurrency = Math.max(1, Math.min(Number(process.env.EMAILMKT_CONCURRENCY || 3), 5));
  const result = {
    campaignId: campaign.campaignId,
    recipients: allRecipients.length,
    alreadySent: sentEmails.size,
    eligible: eligibleRecipients.length,
    sent: 0,
    failed: [],
  };

  for (let index = 0; index < eligibleRecipients.length; index += concurrency) {
    const batch = eligibleRecipients.slice(index, index + concurrency);

    await Promise.all(batch.map(async (recipient) => {
      try {
        await transporter.sendMail({
          from: `"Albiero Seguridad" <${emailUser}>`,
          to: recipient.email,
          subject: campaign.subject,
          html: buildCampaignHtml({ recipient, campaign }),
        });
        await CampaignSend.updateOne(
          { campaignId: campaign.campaignId, email: recipient.email },
          {
            $set: {
              subject: campaign.subject,
              status: 'sent',
              error: '',
              sentAt: new Date(),
            },
          },
          { upsert: true }
        );
        result.sent += 1;
      } catch (error) {
        await CampaignSend.updateOne(
          { campaignId: campaign.campaignId, email: recipient.email },
          {
            $set: {
              subject: campaign.subject,
              status: 'failed',
              error: error.message,
            },
          },
          { upsert: true }
        ).catch(() => {});
        result.failed.push({
          email: recipient.email,
          message: error.message,
        });
      }
    }));
  }

  return result;
}

