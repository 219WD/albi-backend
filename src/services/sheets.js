import '../env.js';
import { google } from 'googleapis';

const SHEET_NAME = process.env.SPREADSHEET_SHEET_NAME || 'Respuestas de formulario 1';
const SHEET_RANGE = `${SHEET_NAME}!A:ZZ`;

function hasRealEnvValue(value) {
  const normalized = String(value || '').trim();
  return normalized !== '' && normalized !== '...';
}

function createGoogleAuth() {
  if (hasRealEnvValue(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)) {
    try {
      return new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    } catch (error) {
      console.warn('[Sheets] GOOGLE_SERVICE_ACCOUNT_JSON invalido, usando credenciales alternativas.');
    }
  }

  if (hasRealEnvValue(process.env.GOOGLE_CLIENT_EMAIL) && hasRealEnvValue(process.env.GOOGLE_PRIVATE_KEY)) {
    return new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  return new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'service-account.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

const auth = createGoogleAuth();
const sheets = google.sheets({ version: 'v4', auth });

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function mapRow(headers, row, rowNumber) {
  const record = { rowNumber };
  headers.forEach((header, index) => {
    if (header) {
      record[header] = row[index] ?? '';
    }
  });
  return record;
}

function toColumnLetter(index) {
  let current = index + 1;
  let column = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    current = Math.floor((current - 1) / 26);
  }

  return column;
}

export async function getSheetSnapshot() {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: SHEET_RANGE,
  });

  const [rawHeaders = [], ...rows] = response.data.values || [];
  const headers = rawHeaders.map(normalizeHeader);
  const headerIndexes = headers.reduce((acc, header, index) => {
    if (header) {
      acc[header] = index;
    }
    return acc;
  }, {});

  return {
    headers,
    headerIndexes,
    rows: rows.map((row, index) => mapRow(headers, row, index + 2)),
  };
}

export async function getSheetRows() {
  const snapshot = await getSheetSnapshot();
  return snapshot.rows;
}

export async function updateLeadStatusByRow(rowNumber, status) {
  const snapshot = await getSheetSnapshot();
  let columnIndex = snapshot.headerIndexes.estado_lead ?? snapshot.headerIndexes.estado;

  if (columnIndex === undefined) {
    columnIndex = snapshot.headers.length;
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${SHEET_NAME}!${toColumnLetter(columnIndex)}1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['estado_lead']],
      },
    });
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${SHEET_NAME}!${toColumnLetter(columnIndex)}${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[status]],
    },
  });
}

export async function appendLeadEventToSheet(lead = {}) {
  const { headers, headerIndexes } = await getSheetSnapshot();
  const now = new Date().toISOString();
  const row = Array.from({ length: headers.length }, () => '');

  const setValue = (header, value) => {
    const index = headerIndexes[header];
    if (index !== undefined && value !== undefined && value !== null) {
      row[index] = value;
    }
  };

  setValue('marca_temporal', now);
  setValue('timestamp', now);
  setValue('event_name', lead.eventName);
  setValue('email', lead.email || '-');
  setValue('nombre', lead.nombre || '-');
  setValue('codigo', lead.codigo || '-');
  setValue('tipo', lead.tipo);
  setValue('ubicacion', lead.ubicacion);
  setValue('sistema', lead.sistema);
  setValue('producto', lead.producto);
  setValue('bienvenida_enviada', lead.bienvenidaEnviada || '');

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:${toColumnLetter(Math.max(headers.length - 1, 0))}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [row],
    },
  });
}

export function getPendingWelcomeRows(rows) {
  const seenEmails = new Set();
  const isMeaningfulValue = (value) => {
    const normalized = String(value || '').trim();
    return normalized !== '' && normalized !== '-' && normalized.toLowerCase() !== 'n/a';
  };
  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

  return rows.filter((row) => {
    const email = String(row.email || '').trim().toLowerCase();
    const nombre = String(row.nombre || '').trim();
    const bienvenida = String(row.bienvenida_enviada || '').trim().toLowerCase();

    if (!isMeaningfulValue(email) || !isMeaningfulValue(nombre) || !isValidEmail(email)) {
      return false;
    }

    if (bienvenida && bienvenida !== 'cancelado') {
      return false;
    }

    if (bienvenida === 'cancelado') {
      return false;
    }

    if (seenEmails.has(email)) {
      return false;
    }

    seenEmails.add(email);
    return true;
  });
}

export async function updateBienvenidaStatusByRow(rowNumber, status) {
  const { headerIndexes } = await getSheetSnapshot();
  const columnIndex = headerIndexes.bienvenida_enviada;

  if (columnIndex === undefined) {
    throw new Error('No se encontró la columna Bienvenida_Enviada en Google Sheets.');
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${SHEET_NAME}!${toColumnLetter(columnIndex)}${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[status]],
    },
  });
}

export async function markEmailAsCancelled(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const rows = await getSheetRows();
  const matches = rows.filter((row) => String(row.email || '').trim().toLowerCase() === normalizedEmail);

  await Promise.all(matches.map((row) => updateBienvenidaStatusByRow(row.rowNumber, 'Cancelado')));

  return matches.length;
}
