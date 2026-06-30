import '../env.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { WORLD_CUP_FIXTURE, WORLD_CUP_GROUPS, WORLD_CUP_PRIZES, WORLD_CUP_TEAMS } from '../data/worldCupFixture.js';
import WorldCupPrediction from '../models/WorldCupPrediction.js';
import WorldCupResult from '../models/WorldCupResult.js';
import WorldCupUser from '../models/WorldCupUser.js';

const TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const PASSWORD_KEYLEN = 64;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeText = (value) => String(value || '').trim();
const base64url = (value) => Buffer.from(value).toString('base64url');
const getSecret = () => process.env.WORLDCUP_TOKEN_SECRET || process.env.EMAILMKT_TOKEN_SECRET || process.env.ANALYTICS_SECRET || 'worldcup-dev-secret';
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function ensureMongoConnection() {
  if (mongoose.connection.readyState === 1) return;

  if (!process.env.MONGO_URI) {
    throw new Error('Falta MONGO_URI para Mundial Albiero.');
  }

  await mongoose.connect(process.env.MONGO_URI);
}

function safeEqual(left = '', right = '') {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(String(password), salt, PASSWORD_KEYLEN).toString('base64url');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedHash = '') {
  const [algorithm, salt, hash] = String(storedHash).split(':');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, PASSWORD_KEYLEN).toString('base64url');
  return safeEqual(candidate, hash);
}

function signPayload(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

function publicUser(user) {
  return {
    id: String(user._id || user.id || ''),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt || null,
  };
}

function createWorldCupToken(user) {
  const payload = base64url(JSON.stringify({
    id: String(user._id || user.id || ''),
    name: user.name,
    email: user.email,
    exp: Date.now() + TOKEN_TTL_MS,
  }));
  return `${payload}.${signPayload(payload)}`;
}

function verifyWorldCupToken(token = '') {
  const [payload, signature] = String(token).split('.');
  if (!payload || !signature || !safeEqual(signPayload(payload), signature)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.id || Date.now() > decoded.exp) return null;
    return decoded;
  } catch {
    return null;
  }
}

function getMatchById(matchId) {
  return WORLD_CUP_FIXTURE.find((match) => match.id === matchId);
}

function teamPayload(code) {
  return WORLD_CUP_TEAMS[code] || { code, name: code, flag: '🏳️' };
}

function serializeMatch(match, resultMap = new Map()) {
  const result = resultMap.get(match.id);
  return {
    ...match,
    homeTeam: teamPayload(match.home),
    awayTeam: teamPayload(match.away),
    result: result
      ? {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          homePenaltyScore: result.homePenaltyScore ?? null,
          awayPenaltyScore: result.awayPenaltyScore ?? null,
          updatedAt: result.updatedAt || null,
        }
      : null,
    locked: new Date(match.kickoff).getTime() <= Date.now(),
  };
}

function matchOutcome(homeScore, awayScore) {
  if (homeScore > awayScore) return 'H';
  if (homeScore < awayScore) return 'A';
  return 'D';
}

function scorePredictionDetail(prediction, result) {
  const predictedOutcome = matchOutcome(prediction.homeScore, prediction.awayScore);
  const predictedDiff = prediction.homeScore - prediction.awayScore;

  if (!result) {
    return {
      points: null,
      code: 'pending',
      reason: 'Pendiente: todavia no hay resultado oficial.',
      predictedOutcome,
      realOutcome: null,
      predictedDiff,
      realDiff: null,
    };
  }

  const realOutcome = matchOutcome(result.homeScore, result.awayScore);
  const realDiff = result.homeScore - result.awayScore;

  if (prediction.homeScore === result.homeScore && prediction.awayScore === result.awayScore) {
    return {
      points: 5,
      code: 'exact',
      reason: 'Resultado exacto: acerto marcador y ganador.',
      predictedOutcome,
      realOutcome,
      predictedDiff,
      realDiff,
    };
  }

  if (predictedOutcome !== realOutcome) {
    return {
      points: -1,
      code: 'miss',
      reason: 'No acerto el ganador ni el empate del partido.',
      predictedOutcome,
      realOutcome,
      predictedDiff,
      realDiff,
    };
  }

  if (predictedDiff === realDiff) {
    return {
      points: 4,
      code: 'difference',
      reason: 'Acerto ganador/empate y diferencia de goles.',
      predictedOutcome,
      realOutcome,
      predictedDiff,
      realDiff,
    };
  }

  return {
    points: 3,
    code: 'outcome',
    reason: 'Acerto ganador/empate, pero no el marcador ni la diferencia.',
    predictedOutcome,
    realOutcome,
    predictedDiff,
    realDiff,
  };
}

function scorePrediction(prediction, result) {
  const detail = scorePredictionDetail(prediction, result);
  return detail.points ?? 0;
}

async function getResultMap() {
  await ensureMongoConnection();
  const results = await WorldCupResult.find({}).lean();
  return new Map(results.map((result) => [result.matchId, result]));
}

export async function registerWorldCupUser(input = {}) {
  await ensureMongoConnection();

  const name = normalizeText(input.name);
  const email = normalizeEmail(input.email);
  const password = String(input.password || '');

  if (name.length < 2) throw httpError('Ingresa tu nombre.', 400);
  if (!isValidEmail(email)) throw httpError('Ingresa un email valido.', 400);
  if (password.length < 6) throw httpError('La contrasena debe tener al menos 6 caracteres.', 400);

  const existing = await WorldCupUser.findOne({ email }).lean();
  if (existing) throw httpError('Ya existe un usuario con ese email.', 409);

  const user = await WorldCupUser.create({
    name,
    email,
    passwordHash: hashPassword(password),
    active: true,
  });

  return { user: publicUser(user), token: createWorldCupToken(user) };
}

export async function loginWorldCupUser(email, password) {
  await ensureMongoConnection();

  const user = await WorldCupUser.findOne({ email: normalizeEmail(email) });
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) return null;

  user.lastLoginAt = new Date();
  await user.save();

  return { user: publicUser(user), token: createWorldCupToken(user) };
}

export async function requireWorldCupUser(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const decoded = verifyWorldCupToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    await ensureMongoConnection();
    const user = await WorldCupUser.findById(decoded.id).lean();
    if (!user || !user.active) return res.status(401).json({ error: 'No autorizado' });
    req.worldCupUser = publicUser(user);
    return next();
  } catch (error) {
    return next(error);
  }
}

export async function getWorldCupFixture() {
  const resultMap = await getResultMap();
  return {
    teams: Object.values(WORLD_CUP_TEAMS),
    groups: WORLD_CUP_GROUPS,
    prizes: WORLD_CUP_PRIZES,
    matches: WORLD_CUP_FIXTURE.map((match) => serializeMatch(match, resultMap)),
  };
}

export async function getUserPredictions(userId) {
  await ensureMongoConnection();
  const predictions = await WorldCupPrediction.find({ userId }).lean();
  const resultMap = await getResultMap();

  return predictions.map((prediction) => ({
    id: String(prediction._id),
    matchId: prediction.matchId,
    homeScore: prediction.homeScore,
    awayScore: prediction.awayScore,
    points: scorePrediction(prediction, resultMap.get(prediction.matchId)),
    updatedAt: prediction.updatedAt || null,
  }));
}

export async function savePrediction(userId, matchId, input = {}) {
  await ensureMongoConnection();
  const match = getMatchById(matchId);
  if (!match) throw httpError('Partido invalido.', 404);
  if (new Date(match.kickoff).getTime() <= Date.now()) throw httpError('Este partido ya esta bloqueado.', 409);

  const homeScore = Number(input.homeScore);
  const awayScore = Number(input.awayScore);
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0 || homeScore > 20 || awayScore > 20) {
    throw httpError('Resultado invalido.', 400);
  }

  const existingPrediction = await WorldCupPrediction.findOne({ userId, matchId }).lean();
  if (existingPrediction) {
    throw httpError('Este pronostico ya fue guardado y no se puede modificar.', 409);
  }

  const prediction = await WorldCupPrediction.create({
    userId,
    matchId,
    homeScore,
    awayScore,
  });

  return {
    id: String(prediction._id),
    matchId: prediction.matchId,
    homeScore: prediction.homeScore,
    awayScore: prediction.awayScore,
    updatedAt: prediction.updatedAt || null,
  };
}

export async function saveMatchResult(matchId, input = {}, admin = {}) {
  await ensureMongoConnection();
  const match = getMatchById(matchId);
  if (!match) throw httpError('Partido invalido.', 404);

  const homeScore = Number(input.homeScore);
  const awayScore = Number(input.awayScore);
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0 || homeScore > 20 || awayScore > 20) {
    throw httpError('Resultado invalido.', 400);
  }

  const hasHomePenalty = input.homePenaltyScore !== '' && input.homePenaltyScore !== null && input.homePenaltyScore !== undefined;
  const hasAwayPenalty = input.awayPenaltyScore !== '' && input.awayPenaltyScore !== null && input.awayPenaltyScore !== undefined;
  let homePenaltyScore = null;
  let awayPenaltyScore = null;

  if (homeScore === awayScore && (hasHomePenalty || hasAwayPenalty)) {
    homePenaltyScore = Number(input.homePenaltyScore);
    awayPenaltyScore = Number(input.awayPenaltyScore);
    if (
      !Number.isInteger(homePenaltyScore)
      || !Number.isInteger(awayPenaltyScore)
      || homePenaltyScore < 0
      || awayPenaltyScore < 0
      || homePenaltyScore > 20
      || awayPenaltyScore > 20
    ) {
      throw httpError('Penales invalidos.', 400);
    }
    if (homePenaltyScore === awayPenaltyScore) {
      throw httpError('Los penales no pueden quedar empatados.', 400);
    }
  }

  const result = await WorldCupResult.findOneAndUpdate(
    { matchId },
    {
      homeScore,
      awayScore,
      homePenaltyScore,
      awayPenaltyScore,
      updatedBy: admin.username || admin.email || '',
    },
    { upsert: true, new: true, runValidators: true },
  );

  return {
    match: serializeMatch(match, new Map([[matchId, result]])),
  };
}

export async function getAdminPredictionAudit(filters = {}) {
  await ensureMongoConnection();

  const matchId = normalizeText(filters.matchId);
  const userId = normalizeText(filters.userId);
  const resultStatus = normalizeText(filters.resultStatus);
  const scoreCode = normalizeText(filters.scoreCode);
  const query = {};
  if (matchId && matchId !== 'all') query.matchId = matchId;
  if (userId && userId !== 'all' && mongoose.Types.ObjectId.isValid(userId)) query.userId = userId;

  const [users, predictions, results, allPredictions] = await Promise.all([
    WorldCupUser.find({}).select('name email active createdAt updatedAt').lean(),
    WorldCupPrediction.find(query).sort({ updatedAt: -1, createdAt: -1 }).lean(),
    WorldCupResult.find({}).lean(),
    WorldCupPrediction.find({}).select('userId').lean(),
  ]);
  const userMap = new Map(users.map((user) => [String(user._id), user]));
  const resultMap = new Map(results.map((result) => [result.matchId, result]));
  const predictionCountByUser = new Map();
  allPredictions.forEach((prediction) => {
    const key = String(prediction.userId);
    predictionCountByUser.set(key, (predictionCountByUser.get(key) || 0) + 1);
  });

  let rows = predictions.map((prediction) => {
    const match = getMatchById(prediction.matchId);
    const user = userMap.get(String(prediction.userId));
    const result = resultMap.get(prediction.matchId);
    const score = scorePredictionDetail(prediction, result);

    return {
      id: String(prediction._id),
      matchId: prediction.matchId,
      match: match ? serializeMatch(match, resultMap) : null,
      user: user
        ? { ...publicUser(user), active: Boolean(user.active) }
        : { id: String(prediction.userId), name: 'Usuario eliminado', email: '', active: false },
      homeScore: prediction.homeScore,
      awayScore: prediction.awayScore,
      result: result
        ? {
            homeScore: result.homeScore,
            awayScore: result.awayScore,
            homePenaltyScore: result.homePenaltyScore ?? null,
            awayPenaltyScore: result.awayPenaltyScore ?? null,
            updatedAt: result.updatedAt || null,
          }
        : null,
      points: score.points,
      score,
      createdAt: prediction.createdAt || null,
      updatedAt: prediction.updatedAt || null,
    };
  });

  if (resultStatus === 'finished') {
    rows = rows.filter((row) => Boolean(row.result));
  }

  if (resultStatus === 'pending') {
    rows = rows.filter((row) => !row.result);
  }

  if (scoreCode && scoreCode !== 'all') {
    rows = rows.filter((row) => row.score?.code === scoreCode);
  }

  const summary = rows.reduce((acc, row) => {
    acc.predictions += 1;
    if (row.points === null || row.points === undefined) {
      acc.pending += 1;
      return acc;
    }

    acc.played += 1;
    acc.points += row.points;
    if (row.score?.code === 'exact') acc.exact += 1;
    if (row.score?.code === 'difference') acc.difference += 1;
    if (row.score?.code === 'outcome') acc.outcome += 1;
    if (row.score?.code === 'miss') acc.miss += 1;
    return acc;
  }, {
    predictions: 0,
    played: 0,
    pending: 0,
    points: 0,
    exact: 0,
    difference: 0,
    outcome: 0,
    miss: 0,
  });

  const byMatchMap = new Map();
  rows.forEach((row) => {
    const key = row.matchId;
    if (!byMatchMap.has(key)) {
      byMatchMap.set(key, {
        matchId: key,
        match: row.match,
        count: 0,
      });
    }
    byMatchMap.get(key).count += 1;
  });

  const byMatch = [...byMatchMap.values()].sort((left, right) => {
    const leftTime = new Date(left.match?.kickoff || 0).getTime();
    const rightTime = new Date(right.match?.kickoff || 0).getTime();
    return leftTime - rightTime || left.matchId.localeCompare(right.matchId);
  });

  return {
    total: rows.length,
    summary,
    byMatch,
    users: users
      .map((user) => ({
        ...publicUser(user),
        active: Boolean(user.active),
        predictions: predictionCountByUser.get(String(user._id)) || 0,
      }))
      .sort((left, right) => right.predictions - left.predictions || left.name.localeCompare(right.name, 'es')),
    rows,
  };
}

export async function getLeaderboard() {
  await ensureMongoConnection();
  const [users, predictions, results] = await Promise.all([
    WorldCupUser.find({ active: true }).lean(),
    WorldCupPrediction.find({}).lean(),
    WorldCupResult.find({}).lean(),
  ]);
  const fixtureMatchIds = new Set(WORLD_CUP_FIXTURE.map((match) => match.id));
  const resultMap = new Map(results.map((result) => [result.matchId, result]));
  const userMap = new Map(users.map((user) => [String(user._id), user]));
  const rows = users.map((user) => ({
    user: publicUser(user),
    points: 0,
    exact: 0,
    played: 0,
    predictions: 0,
    fixturePredictions: 0,
    stalePredictions: 0,
    totalMatches: WORLD_CUP_FIXTURE.length,
  }));
  const rowMap = new Map(rows.map((row) => [row.user.id, row]));

  predictions.forEach((prediction) => {
    const userId = String(prediction.userId);
    if (!userMap.has(userId)) return;

    const row = rowMap.get(userId);
    const result = resultMap.get(prediction.matchId);
    row.predictions += 1;
    if (fixtureMatchIds.has(prediction.matchId)) {
      row.fixturePredictions += 1;
    } else {
      row.stalePredictions += 1;
    }
    if (!result) return;

    const points = scorePrediction(prediction, result);
    row.points += points;
    row.played += 1;
    if (points === 5) row.exact += 1;
  });

  return rows
    .sort((a, b) => b.points - a.points || b.exact - a.exact || b.predictions - a.predictions || a.user.name.localeCompare(b.user.name))
    .map((row, index) => ({ ...row, position: index + 1 }));
}
