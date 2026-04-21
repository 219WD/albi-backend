import '../env.js';
import nodemailer from 'nodemailer';

function getEmailConfig() {
  return {
    emailUser: String(process.env.EMAIL_USER || '').trim(),
    emailPass: String(process.env.EMAIL_PASS || '')
      .trim()
      .replace(/\s+/g, ''),
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

const buildWelcomeHtml = ({ nombre, codigo, email }) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;background:#f4f4f4;}.wrap{max-width:600px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.1);}.header{background:linear-gradient(135deg,#7D1522,#961C2C);padding:32px 24px;text-align:center;}.header img{width:90px;margin-bottom:14px;display:block;margin-left:auto;margin-right:auto;}.header h1{color:#fff;font-size:24px;font-weight:700;margin-bottom:6px;}.header p{color:rgba(255,255,255,0.85);font-size:14px;}.body{padding:28px 32px;}.body h2{font-size:20px;color:#1a1a1a;margin-bottom:12px;}.body p{font-size:14px;color:#555;line-height:1.7;margin-bottom:10px;}.descuento{margin:20px 0;border:2px dashed #961C2C;border-radius:12px;padding:24px;text-align:center;background:#fff5f6;}.descuento .label{font-size:10px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#961C2C;margin-bottom:8px;}.descuento .num{font-size:48px;font-weight:900;color:#961C2C;line-height:1;}.descuento .off{font-size:12px;font-weight:700;color:#961C2C;letter-spacing:0.1em;margin-bottom:10px;}.descuento .desc{font-size:12px;color:#666;margin-bottom:14px;}.codigo{display:inline-block;background:#1a1a1a;color:#f5a623;font-family:monospace;font-size:20px;font-weight:900;letter-spacing:0.12em;padding:10px 22px;border-radius:8px;margin-bottom:6px;}.codigo-hint{font-size:11px;color:#999;}.beneficios{margin:20px 0;}.beneficios h3{font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:12px;}.item{margin-bottom:10px;}.itd{font-size:18px;width:32px;vertical-align:top;padding-top:1px;}.itd2{vertical-align:top;}.itd2 strong{display:block;font-size:12px;color:#1a1a1a;}.itd2 span{font-size:11px;color:#777;}.cta{text-align:center;margin:24px 0;}.cta a{display:inline-block;background:#961C2C;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 32px;border-radius:10px;}.contacto{background:#f8f8f8;border-radius:10px;padding:18px;margin-bottom:20px;}.contacto h4{font-size:12px;font-weight:700;color:#1a1a1a;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.08em;}.contacto p{font-size:12px;color:#555;margin-bottom:5px;}.contacto a{color:#961C2C;text-decoration:none;}.footer{background:#1a1a1a;padding:18px 32px;text-align:center;}.footer p{font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:5px;line-height:1.6;}.footer a{color:rgba(255,255,255,0.5);}.social a{display:inline-block;margin:0 5px;color:rgba(255,255,255,0.6);font-size:12px;}</style></head><body>
<div class="wrap">
  <div class="header">
    <img src="https://res.cloudinary.com/dtxdv136u/image/upload/v1763499836/logo_alb_ged07k.png" alt="Albiero Seguridad">
    <h1>¡Bienvenido/a, ${escapeHtml(nombre)}!</h1>
    <p>Albiero Seguridad · +40 años protegiendo Tucumán</p>
  </div>
  <div class="body">
    <h2>Nos alegra tenerte con nosotros 🎉</h2>
    <p>Hola <strong>${escapeHtml(nombre)}</strong>, gracias por registrarte. Tu beneficio exclusivo ya está activo:</p>
    <div class="descuento">
      <div class="label">🎁 Tu beneficio de bienvenida</div>
      <div class="num">10%</div>
      <div class="off">OFF</div>
      <div class="desc">en tu primera instalación de alarma o sistema de cámaras</div>
      <div class="codigo">${escapeHtml(codigo)}</div>
      <div class="codigo-hint">Mostrá este código al momento de contratar</div>
    </div>
    <div class="beneficios">
      <h3>¿Por qué elegir Albiero?</h3>
      <div class="item"><table cellpadding="0" cellspacing="0"><tr><td class="itd">🛡️</td><td class="itd2"><strong>+40 años de experiencia</strong><span>Líderes en seguridad en Tucumán desde 1984</span></td></tr></table></div>
      <div class="item"><table cellpadding="0" cellspacing="0"><tr><td class="itd">📡</td><td class="itd2"><strong>Monitoreo 24/7</strong><span>Central de monitoreo propia, respuesta inmediata</span></td></tr></table></div>
      <div class="item"><table cellpadding="0" cellspacing="0"><tr><td class="itd">🔧</td><td class="itd2"><strong>Instalación profesional sin costo</strong><span>Incluida en el servicio</span></td></tr></table></div>
      <div class="item"><table cellpadding="0" cellspacing="0"><tr><td class="itd">✅</td><td class="itd2"><strong>Garantía 12 meses</strong><span>En todos nuestros equipos e instalaciones</span></td></tr></table></div>
    </div>
    <div class="cta">
      <a href="https://wa.me/5493813522339?text=Hola!%20Quiero%20usar%20mi%20beneficio%20${encodeURIComponent(codigo)}">Usar mi beneficio ahora →</a>
    </div>
    <div class="contacto">
      <h4>Contacto directo</h4>
      <p>📞 <a href="tel:+543814531300">0381 453 1300</a></p>
      <p>📧 <a href="mailto:info@albiero.com.ar">info@albiero.com.ar</a></p>
      <p>📍 Catamarca 479, San Miguel de Tucumán</p>
    </div>
  </div>
  <div class="footer">
    <div class="social">
      <a href="https://instagram.com/albieroseguridad.tuc/">Instagram</a>
      <a href="https://facebook.com/albieroseguridad.tuc/">Facebook</a>
      <a href="https://wa.me/5493813522339">WhatsApp</a>
    </div>
    <p><a href="${buildUnsubscribeUrl(email)}" style="color:rgba(255,255,255,0.4);">Cancelar suscripción</a></p>
  </div>
</div>
</body></html>`;

export async function sendWelcomeEmail(lead) {
  const { emailUser, emailPass } = getEmailConfig();

  if (!emailUser || !emailPass) {
    throw new Error('Faltan EMAIL_USER o EMAIL_PASS en el archivo .env.');
  }

  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"Albiero" <${emailUser}>`,
    to: lead.email,
    subject: `🎉 Bienvenido/a ${lead.nombre}, tu beneficio exclusivo te espera`,
    html: buildWelcomeHtml(lead),
  });
}
