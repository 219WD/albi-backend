import crypto from 'crypto';
import mongoose from 'mongoose';
import ReportShare from '../models/ReportShare.js';
import { buildSheetReportSummary } from './sheetReport.js';

async function ensureMongoConnection() {
  if (mongoose.connection.readyState === 1) return;

  if (!process.env.MONGO_URI) {
    throw new Error('Falta MONGO_URI para informes.');
  }

  await mongoose.connect(process.env.MONGO_URI);
}

function normalizeText(value) {
  return String(value || '').trim();
}

function sanitizeFilters(filters = {}) {
  return {
    producto: normalizeText(filters.producto),
    tipo: normalizeText(filters.tipo),
    ubicacion: normalizeText(filters.ubicacion),
    sistema: normalizeText(filters.sistema),
  };
}

function sanitizeReportInput(input = {}) {
  const title = normalizeText(input.title);
  if (!title) {
    const error = new Error('El informe necesita titulo.');
    error.statusCode = 400;
    throw error;
  }

  const range = ['7d', '30d', '90d', 'custom'].includes(input.range) ? input.range : 'custom';
  const from = normalizeText(input.from);
  const to = normalizeText(input.to);

  if (range === 'custom') {
    const fromDate = new Date(`${from}T00:00:00`);
    const toDate = new Date(`${to}T23:59:59.999`);
    if (!from || !to || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
      const error = new Error('Rango de fechas invalido.');
      error.statusCode = 400;
      throw error;
    }
  }

  let expiresAt;
  if (input.expiresAt) {
    expiresAt = new Date(input.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      const error = new Error('Fecha de vencimiento invalida.');
      error.statusCode = 400;
      throw error;
    }
  }

  return {
    title,
    periodLabel: normalizeText(input.periodLabel),
    range,
    from,
    to,
    filters: sanitizeFilters(input.filters),
    active: input.active !== false,
    expiresAt,
  };
}

function toPublicReport(report) {
  return {
    id: String(report._id),
    token: report.token,
    title: report.title,
    periodLabel: report.periodLabel,
    range: report.range,
    from: report.from,
    to: report.to,
    filters: sanitizeFilters(report.filters),
    active: report.active,
    expiresAt: report.expiresAt || null,
    createdAt: report.createdAt || null,
    updatedAt: report.updatedAt || null,
  };
}

export async function listReports() {
  await ensureMongoConnection();
  const reports = await ReportShare.find({}).sort({ createdAt: -1 }).lean();
  return reports.map(toPublicReport);
}

export async function createReport(input = {}, admin = {}) {
  await ensureMongoConnection();
  const payload = sanitizeReportInput(input);

  const report = await ReportShare.create({
    ...payload,
    token: crypto.randomBytes(16).toString('hex'),
    createdBy: admin.username || admin.email || '',
    updatedBy: admin.username || admin.email || '',
  });

  return toPublicReport(report);
}

export async function updateReport(reportId, input = {}, admin = {}) {
  await ensureMongoConnection();

  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    const error = new Error('Informe invalido.');
    error.statusCode = 400;
    throw error;
  }

  const current = await ReportShare.findById(reportId);
  if (!current) {
    const error = new Error('Informe no encontrado.');
    error.statusCode = 404;
    throw error;
  }

  const payload = sanitizeReportInput({
    ...current.toObject(),
    ...input,
    filters: input.filters || current.filters,
  });

  Object.assign(current, payload, {
    updatedBy: admin.username || admin.email || '',
  });
  await current.save();

  return toPublicReport(current);
}

export async function getPublicReport(token) {
  await ensureMongoConnection();

  const report = await ReportShare.findOne({ token: normalizeText(token), active: true }).lean();
  if (!report) {
    const error = new Error('Informe no encontrado.');
    error.statusCode = 404;
    throw error;
  }

  if (report.expiresAt && new Date(report.expiresAt).getTime() < Date.now()) {
    const error = new Error('Este informe ya vencio.');
    error.statusCode = 410;
    throw error;
  }

  const summary = await buildSheetReportSummary(report);
  return {
    report: toPublicReport(report),
    summary,
  };
}
