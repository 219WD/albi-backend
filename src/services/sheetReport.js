import { getSheetRows } from './sheets.js';

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

function normalizeText(value) {
  return String(value || '').trim();
}

function titleCase(value) {
  const text = normalizeText(value);
  if (!text || text === '-') return 'Sin dato';
  return text
    .replace(/^kit\s+/i, 'Kit ')
    .split(' ')
    .map((word, index) => {
      const lower = word.toLocaleLowerCase('es-AR');
      if (index > 0 && ['de', 'del', 'la', 'el', 'y'].includes(lower)) return lower;
      return lower ? `${lower.charAt(0).toLocaleUpperCase('es-AR')}${lower.slice(1)}` : lower;
    })
    .join(' ');
}

function formatProductLabel(value) {
  const text = normalizeText(value);
  if (!text || text === '-') return 'Sin dato';

  const normalized = canonicalKey(text).replace(/[^a-z0-9]/g, '');
  const labels = {
    gps: 'Seguridad Vehicular',
    kitalarmacamera: 'Kit Alarma y Camara',
    camaras: 'Camaras',
    camara: 'Camaras',
    alarmas: 'Alarmas',
    alarma: 'Alarmas',
    incendio: 'Incendio',
    seguridadintegral: 'Seguridad Integral',
  };

  return labels[normalized] || titleCase(text);
}

function formatSystemLabel(product, value) {
  const label = titleCase(value);
  if (label === 'Sin dato') return label;

  const productLabel = formatProductLabel(product);
  const labelKey = canonicalKey(label).replace(/[^a-z0-9]/g, '');
  const alreadyContextual = ['kit', 'gps', 'camara', 'camara', 'alarma', 'incendio', 'controldeaccesos']
    .some(prefix => labelKey.startsWith(prefix));

  if (alreadyContextual) return label;

  const genericSystems = new Set(['chico', 'mediano', 'grande', 'personalizado', 'control']);
  if (!genericSystems.has(labelKey)) return label;

  const productKey = canonicalKey(productLabel).replace(/[^a-z0-9]/g, '');
  const prefixes = {
    camaras: 'Camara',
    camara: 'Camara',
    alarmas: 'Alarma',
    alarma: 'Alarma',
    kitalarmacamara: 'Kit',
    kitalarmacamaras: 'Kit',
    seguridadintegral: 'Sistema',
    gps: 'Seguridad Vehicular',
    seguridadvehicular: 'Seguridad Vehicular',
  };

  const prefix = prefixes[productKey];
  return prefix ? `${prefix} ${label}` : label;
}

function canonicalKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function getField(row, field) {
  const value = normalizeText(row[field]);
  return value && value !== '-' ? value : 'Sin dato';
}

function hasMeaningfulValue(value) {
  const normalized = normalizeText(value).toLowerCase();
  return Boolean(normalized && normalized !== '-' && normalized !== 'n/a' && normalized !== 'sin dato');
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(value));
}

function parseSheetDate(row) {
  const raw = row.timestamp || row.marca_temporal || row.fecha || row.created_at || '';
  if (!raw) return null;

  const directDate = new Date(raw);
  if (!Number.isNaN(directDate.getTime())) return directDate;

  const match = String(raw).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;

  const [, day, month, year, hour = '0', minute = '0', second = '0'] = match;
  const fullYear = year.length === 2 ? `20${year}` : year;
  const parsed = new Date(Number(fullYear), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDateBounds(query = {}) {
  if (query.range === 'custom') {
    if (!query.from || !query.to) {
      const error = new Error('El informe necesita fecha desde y hasta.');
      error.statusCode = 400;
      throw error;
    }

    const from = new Date(`${query.from}T00:00:00`);
    const to = new Date(`${query.to}T23:59:59.999`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      const error = new Error('Rango de fechas invalido.');
      error.statusCode = 400;
      throw error;
    }
    return { from, to };
  }

  const days = RANGE_DAYS[query.range] || RANGE_DAYS['30d'];
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

function percent(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function countBy(rows, field, formatter = titleCase) {
  const map = new Map();

  rows.forEach((row) => {
    const rawValue = getField(row, field);
    const key = canonicalKey(rawValue);
    const current = map.get(key) || { label: formatter(rawValue), count: 0 };
    current.count += 1;
    map.set(key, current);
  });

  const total = rows.length || 0;
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map(item => ({
      ...item,
      percent: total > 0 ? Math.round((item.count / total) * 100) : 0,
    }));
}

function countByProduct(rows, field, formatter = titleCase) {
  const groups = new Map();

  rows.forEach((row) => {
    const rawProduct = getField(row, 'producto');
    const key = canonicalKey(rawProduct);
    const current = groups.get(key) || {
      label: formatProductLabel(rawProduct),
      count: 0,
      rows: [],
    };

    current.count += 1;
    current.rows.push(row);
    groups.set(key, current);
  });

  const total = rows.length || 0;
  return Array.from(groups.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map(group => ({
      label: group.label,
      count: group.count,
      percent: percent(group.count, total),
      rows: countBy(
        group.rows,
        field,
        value => (field === 'sistema' ? formatSystemLabel(group.label, value) : formatter(value))
      ),
    }));
}

function isCompleteLead(row) {
  return ['tipo', 'ubicacion', 'sistema', 'producto'].every(field => hasMeaningfulValue(row[field]));
}

function isLeadRow(row) {
  const eventName = normalizeText(row.event_name);
  if (eventName) return eventName.endsWith('FormularioEnviado_WhatsApp');
  return Boolean(normalizeText(row.tipo) || normalizeText(row.ubicacion) || normalizeText(row.sistema));
}

function isStepRow(row, step) {
  const eventName = normalizeText(row.event_name).toLowerCase();
  const category = normalizeText(row.content_category).toLowerCase();

  if (eventName.includes(`paso${step}`) || category.includes(`paso${step}`)) return true;

  if (step === 1) return hasMeaningfulValue(row.tipo);
  if (step === 2) return hasMeaningfulValue(row.tipo) && hasMeaningfulValue(row.ubicacion);
  if (step === 3) return isCompleteLead(row);
  return false;
}

function matchesFilters(row, filters = {}) {
  return Object.entries(filters).every(([field, value]) => {
    if (!value) return true;
    if (field === 'producto') {
      return canonicalKey(row[field]) === canonicalKey(value)
        || canonicalKey(formatProductLabel(row[field])) === canonicalKey(value);
    }
    return canonicalKey(row[field]) === canonicalKey(value);
  });
}

function buildDailyLeads(rows) {
  const map = new Map();

  rows.forEach((row) => {
    const parsedDate = parseSheetDate(row);
    if (!parsedDate) return;

    const key = parsedDate.toISOString().slice(0, 10);
    const current = map.get(key) || {
      date: key,
      label: parsedDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
      leads: 0,
    };
    current.leads += 1;
    map.set(key, current);
  });

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function buildFunnel(rows, leadRows) {
  const steps = [
    { key: 'paso1', label: 'Paso 1', count: rows.filter(row => isStepRow(row, 1)).length },
    { key: 'paso2', label: 'Paso 2', count: rows.filter(row => isStepRow(row, 2)).length },
    { key: 'paso3', label: 'Paso 3', count: rows.filter(row => isStepRow(row, 3)).length },
    { key: 'lead', label: 'Lead completo', count: leadRows.length },
  ];

  return steps.map((step, index) => {
    const previous = index === 0 ? step.count : steps[index - 1].count;
    return {
      ...step,
      retention: index === 0 ? 100 : percent(step.count, previous),
      dropoff: index === 0 ? 0 : Math.max(0, 100 - percent(step.count, previous)),
    };
  });
}

function buildLocationConversion(rows, leadRows) {
  const visitsByLocation = new Map();
  const leadsByLocation = new Map();

  rows.filter(row => isStepRow(row, 2)).forEach((row) => {
    const raw = getField(row, 'ubicacion');
    const key = canonicalKey(raw);
    const current = visitsByLocation.get(key) || { label: titleCase(raw), visits: 0 };
    current.visits += 1;
    visitsByLocation.set(key, current);
  });

  leadRows.forEach((row) => {
    const raw = getField(row, 'ubicacion');
    const key = canonicalKey(raw);
    const current = leadsByLocation.get(key) || { label: titleCase(raw), leads: 0 };
    current.leads += 1;
    leadsByLocation.set(key, current);
    if (!visitsByLocation.has(key)) visitsByLocation.set(key, { label: titleCase(raw), visits: 0 });
  });

  return Array.from(visitsByLocation.entries())
    .map(([key, location]) => {
      const leads = leadsByLocation.get(key)?.leads || 0;
      const visits = Math.max(location.visits, leads);
      return {
        label: location.label,
        visits,
        leads,
        conversion: percent(leads, visits),
      };
    })
    .sort((a, b) => b.leads - a.leads || b.conversion - a.conversion || a.label.localeCompare(b.label));
}

function countNewsletterSubscribers(rows) {
  const seenEmails = new Set();

  rows.forEach((row) => {
    const email = normalizeText(row.email).toLowerCase();
    const bienvenida = normalizeText(row.bienvenida_enviada).toLowerCase();

    if (!isValidEmail(email) || bienvenida === 'cancelado' || seenEmails.has(email)) return;
    seenEmails.add(email);
  });

  return seenEmails.size;
}

function leadToPublic(row) {
  return {
    fecha: parseSheetDate(row)?.toISOString() || '',
    tipo: getField(row, 'tipo'),
    ubicacion: getField(row, 'ubicacion'),
    sistema: getField(row, 'sistema'),
    producto: getField(row, 'producto'),
    nombre: getField(row, 'nombre'),
    email: getField(row, 'email'),
    estado: getField(row, 'estado_lead'),
  };
}

function filterRowsByRange(rows, query) {
  const { from, to } = getDateBounds(query);
  return rows.filter((row) => {
    const parsedDate = parseSheetDate(row);
    if (!parsedDate) return true;
    return parsedDate >= from && parsedDate <= to;
  });
}

export async function buildSheetReportSummary(config = {}) {
  const allRows = await getSheetRows();
  const query = {
    range: config.range || '30d',
    from: config.from || '',
    to: config.to || '',
  };
  const filters = config.filters || {};
  const rangedRows = filterRowsByRange(allRows, query);
  const filteredRows = rangedRows.filter(row => matchesFilters(row, filters));
  const baseLeadRows = rangedRows.filter(isLeadRow);
  const leadRows = baseLeadRows.filter(row => matchesFilters(row, filters));
  const byTipo = countBy(leadRows, 'tipo');
  const byUbicacion = countBy(leadRows, 'ubicacion');
  const bySistema = countBy(leadRows, 'sistema');
  const byProducto = countBy(leadRows, 'producto', formatProductLabel);
  const tipoPorProducto = countByProduct(leadRows, 'tipo');
  const sistemaPorProducto = countByProduct(leadRows, 'sistema');
  const withName = leadRows.filter(row => hasMeaningfulValue(row.nombre)).length;
  const withEmail = leadRows.filter(row => isValidEmail(row.email)).length;
  const completeLeads = leadRows.filter(isCompleteLead).length;
  const completeContactLeads = leadRows.filter(row =>
    isCompleteLead(row) && hasMeaningfulValue(row.nombre) && isValidEmail(row.email)
  ).length;

  return {
    source: 'google_sheets',
    sheetUrl: process.env.SPREADSHEET_ID
      ? `https://docs.google.com/spreadsheets/d/${process.env.SPREADSHEET_ID}/edit`
      : '',
    generatedAt: new Date().toISOString(),
    appliedFilters: filters,
    totals: {
      leads: leadRows.length,
      sheetRows: allRows.length,
      filteredRows: filteredRows.length,
      ubicaciones: byUbicacion.length,
      tipos: byTipo.length,
      newsletterSubscribers: countNewsletterSubscribers(allRows),
      withName,
      withNamePercent: percent(withName, leadRows.length),
      withEmail,
      withEmailPercent: percent(withEmail, leadRows.length),
      completeLeads,
      completeLeadsPercent: percent(completeLeads, leadRows.length),
      completeContactLeads,
      completeContactLeadsPercent: percent(completeContactLeads, leadRows.length),
    },
    breakdowns: {
      tipo: byTipo,
      ubicacion: byUbicacion,
      sistema: bySistema,
      producto: byProducto,
      tipoPorProducto,
      sistemaPorProducto,
    },
    funnel: buildFunnel(filteredRows, leadRows),
    locationConversion: buildLocationConversion(filteredRows, leadRows),
    dailyLeads: buildDailyLeads(leadRows),
    recentLeads: leadRows
      .slice()
      .sort((a, b) => (parseSheetDate(b)?.getTime() || 0) - (parseSheetDate(a)?.getTime() || 0))
      .slice(0, 10)
      .map(leadToPublic),
  };
}
