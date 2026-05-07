import '../env.js';
import nodemailer from 'nodemailer';
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

function getNewsletterRecipients(rows) {
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

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#f4f4f4;font-family:Arial,sans-serif;color:#1a1a1a}.preheader{display:none;max-height:0;overflow:hidden;opacity:0}.wrap{max-width:620px;margin:28px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.1)}.header{background:linear-gradient(135deg,#7D1522,#961C2C);padding:32px 24px;text-align:center}.header img{width:92px;margin:0 auto 14px;display:block}.header h1{color:#fff;font-size:25px;line-height:1.25;margin:0}.header p{color:rgba(255,255,255,.84);font-size:13px;margin:8px 0 0}.body{padding:30px 34px}.body p{font-size:15px;line-height:1.7;color:#555;margin:0 0 14px}.cta{text-align:center;margin:26px 0 6px}.cta-btn{display:inline-block;background:#961C2C;color:#fff!important;text-decoration:none;font-size:14px;font-weight:700;padding:13px 28px;border-radius:10px;margin:6px}.contacto{background:#f8f8f8;border-radius:10px;padding:18px;margin-top:24px}.contacto h4{font-size:12px;font-weight:700;color:#1a1a1a;margin:0 0 10px;text-transform:uppercase;letter-spacing:.08em}.contacto p{font-size:12px;color:#555;margin:0 0 5px}.contacto a{color:#961C2C;text-decoration:none}.footer{background:#1a1a1a;padding:18px 32px;text-align:center}.footer p{font-size:11px;color:rgba(255,255,255,.44);margin:0 0 6px;line-height:1.6}.footer a{color:rgba(255,255,255,.62)}</style></head><body><span class="preheader">${escapeHtml(preheader)}</span><div class="wrap"><div class="header"><img src="https://res.cloudinary.com/dtxdv136u/image/upload/v1763499836/logo_alb_ged07k.png" alt="Albiero Seguridad"><h1>${escapeHtml(title)}</h1><p>Albiero Seguridad · +40 años protegiendo Tucumán</p></div><div class="body">${contentToHtml(campaign.content)}${buttonsHtml ? `<div class="cta">${buttonsHtml}</div>` : ''}<div class="contacto"><h4>Contacto directo</h4><p>Tel: <a href="tel:+543814531300">0381 453 1300</a></p><p>Email: <a href="mailto:info@albiero.com.ar">info@albiero.com.ar</a></p><p>Catamarca 479, San Miguel de Tucumán</p></div></div><div class="footer"><p>Recibiste este email porque te registraste en Albiero Seguridad.</p><p><a href="${buildUnsubscribeUrl(recipient.email)}">Cancelar suscripción</a></p></div></div></body></html>`;
}

function validateCampaign(campaign = {}) {
  const subject = String(campaign.subject || '').trim();
  const title = String(campaign.title || '').trim();
  const content = String(campaign.content || '').trim();

  if (!subject) throw new Error('Falta el asunto.');
  if (!title) throw new Error('Falta el titulo.');
  if (!content) throw new Error('Falta el contenido.');

  return {
    subject,
    title,
    preheader: String(campaign.preheader || '').trim(),
    content,
    buttons: normalizeButtons(campaign.buttons),
  };
}

export async function previewEmailMarketingRecipients() {
  const rows = await getSheetRows();
  const recipients = getNewsletterRecipients(rows);

  return {
    totalRows: rows.length,
    recipients: recipients.length,
    preview: recipients.slice(0, 15),
  };
}

export async function sendEmailMarketingCampaign(campaignInput = {}) {
  const campaign = validateCampaign(campaignInput);
  const { emailUser, emailPass } = getEmailConfig();

  if (!emailUser || !emailPass) {
    throw new Error('Faltan EMAIL_USER o EMAIL_PASS en el archivo .env.');
  }

  const rows = await getSheetRows();
  const recipients = getNewsletterRecipients(rows);
  const transporter = createTransporter();
  const concurrency = Math.max(1, Math.min(Number(process.env.EMAILMKT_CONCURRENCY || 3), 5));
  const result = {
    recipients: recipients.length,
    sent: 0,
    failed: [],
  };

  for (let index = 0; index < recipients.length; index += concurrency) {
    const batch = recipients.slice(index, index + concurrency);

    await Promise.all(batch.map(async (recipient) => {
      try {
        await transporter.sendMail({
          from: `"Albiero Seguridad" <${emailUser}>`,
          to: recipient.email,
          subject: campaign.subject,
          html: buildCampaignHtml({ recipient, campaign }),
        });
        result.sent += 1;
      } catch (error) {
        result.failed.push({
          email: recipient.email,
          message: error.message,
        });
      }
    }));
  }

  return result;
}
