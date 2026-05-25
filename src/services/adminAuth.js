import '../env.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import EmailMktUser from '../models/EmailMktUser.js';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_KEYLEN = 64;
const PASSWORD_RANGOS = new Set(['emailmkt', 'admin', 'superadmin']);
const USER_RANGOS = new Set(['pendiente', 'emailmkt', 'admin', 'superadmin', 'bloqueado']);

const base64url = (value) => Buffer.from(value).toString('base64url');

const getSecret = () => process.env.EMAILMKT_TOKEN_SECRET || process.env.ANALYTICS_SECRET || 'emailmkt-dev-secret';

const normalizeText = (value) => String(value || '').trim();
const normalizeUsername = (value) => String(value || '').trim().toLowerCase();
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));

const httpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

async function ensureMongoConnection() {
  if (mongoose.connection.readyState === 1) return;

  if (!process.env.MONGO_URI) {
    throw new Error('Falta MONGO_URI para usuarios de email marketing.');
  }

  await mongoose.connect(process.env.MONGO_URI);
}

const safeEqual = (left = '', right = '') => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) return false;

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(String(password), salt, PASSWORD_KEYLEN).toString('base64url');

  return `scrypt:${salt}:${hash}`;
};

const verifyPassword = (password, storedHash = '') => {
  const [algorithm, salt, hash] = String(storedHash).split(':');

  if (algorithm !== 'scrypt' || !salt || !hash) return false;

  const candidate = crypto.scryptSync(String(password), salt, PASSWORD_KEYLEN).toString('base64url');
  return safeEqual(candidate, hash);
};

const signPayload = (payload) =>
  crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('base64url');

const publicAdmin = (admin) => ({
  id: String(admin._id || admin.id || ''),
  username: admin.username,
  email: admin.email,
  rango: admin.rango,
  active: admin.active !== false,
  lastLoginAt: admin.lastLoginAt || null,
  createdAt: admin.createdAt || null,
  updatedAt: admin.updatedAt || null,
});

export async function registerAdminUser(input = {}) {
  await ensureMongoConnection();

  const username = normalizeUsername(input.username);
  const email = normalizeEmail(input.email);
  const password = String(input.password || '');

  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    throw httpError('El usuario debe tener 3 a 40 caracteres: letras, numeros, punto, guion o guion bajo.', 400);
  }

  if (!isValidEmail(email)) {
    throw httpError('Ingresa un email valido.', 400);
  }

  if (password.length < 8) {
    throw httpError('La contrasena debe tener al menos 8 caracteres.', 400);
  }

  const existing = await EmailMktUser.findOne({
    $or: [{ username }, { email }],
  }).lean();

  if (existing) {
    throw httpError('Ya existe un usuario con ese usuario o email.', 409);
  }

  const user = await EmailMktUser.create({
    username,
    email,
    passwordHash: hashPassword(password),
    rango: 'pendiente',
    active: true,
  });

  return publicAdmin(user);
}

export async function authenticateAdmin(usernameOrEmail, password) {
  await ensureMongoConnection();

  const login = normalizeUsername(usernameOrEmail);
  const user = await EmailMktUser.findOne({
    $or: [{ username: login }, { email: login }],
  });

  if (!user || !user.active || user.rango === 'bloqueado' || !verifyPassword(password, user.passwordHash)) {
    return null;
  }

  if (!PASSWORD_RANGOS.has(user.rango)) {
    throw httpError('Tu usuario esta registrado, pero todavia no tiene rango admin.', 403);
  }

  user.lastLoginAt = new Date();
  await user.save();

  return publicAdmin(user);
}

export function createAdminToken(admin) {
  const payload = base64url(JSON.stringify({
    username: admin.username,
    email: admin.email,
    rango: admin.rango,
    exp: Date.now() + TOKEN_TTL_MS,
  }));
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

export function verifyAdminToken(token = '') {
  const [payload, signature] = String(token).split('.');

  if (!payload || !signature || !safeEqual(signPayload(payload), signature)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));

    if (!decoded.username || Date.now() > decoded.exp || !PASSWORD_RANGOS.has(decoded.rango)) {
      return null;
    }

    return {
      username: decoded.username,
      email: decoded.email,
      rango: decoded.rango,
    };
  } catch {
    return null;
  }
}

export async function requireEmailMktAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const admin = verifyAdminToken(token);

  if (!admin) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    await ensureMongoConnection();

    const currentUser = await EmailMktUser.findOne({ username: admin.username }).lean();

    if (
      !currentUser
      || !currentUser.active
      || currentUser.rango === 'bloqueado'
      || !PASSWORD_RANGOS.has(currentUser.rango)
    ) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    req.admin = publicAdmin(currentUser);
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireSuperAdmin(req, res, next) {
  if (req.admin?.rango !== 'superadmin') {
    return res.status(403).json({ error: 'Solo super admin puede acceder a usuarios.' });
  }

  return next();
}

export async function listAdminUsers() {
  await ensureMongoConnection();

  const users = await EmailMktUser
    .find({})
    .sort({ createdAt: -1 })
    .lean();

  return users.map(publicAdmin);
}

export async function updateAdminUserAccess(userId, input = {}, actor = {}) {
  await ensureMongoConnection();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw httpError('Usuario invalido.', 400);
  }

  const nextRango = normalizeText(input.rango).toLowerCase();
  const nextActive = input.active === undefined ? undefined : Boolean(input.active);

  if (!USER_RANGOS.has(nextRango)) {
    throw httpError('Rango invalido.', 400);
  }

  const user = await EmailMktUser.findById(userId);

  if (!user) {
    throw httpError('Usuario no encontrado.', 404);
  }

  const isDemotingSuperAdmin =
    user.rango === 'superadmin'
    && (nextRango !== 'superadmin' || nextActive === false);

  if (isDemotingSuperAdmin) {
    const activeSuperAdmins = await EmailMktUser.countDocuments({
      _id: { $ne: user._id },
      rango: 'superadmin',
      active: true,
    });

    if (activeSuperAdmins < 1) {
      throw httpError('No podes quitar el ultimo super admin activo.', 400);
    }
  }

  user.rango = nextRango;
  if (nextActive !== undefined) user.active = nextActive;
  user.updatedBy = actor.username || actor.email || '';
  await user.save();

  return publicAdmin(user);
}
