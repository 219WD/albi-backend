// server/src/routes/analytics.js
import { Router } from 'express';
import getClient  from '../ga4Client.js';
import {
  buildDateRange,
  EVENTO_MAP,
  PRODUCTOS_VALIDOS,
  PASO_LABELS,
} from '../helpers.js';
import { getSheetRows } from '../services/sheets.js';

const router   = Router();
const PROPERTY = () => `properties/${process.env.GA4_PROPERTY_ID}`;

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

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

function getSheetDateBounds(query) {
  if (query.range === 'custom') {
    if (!query.from || !query.to) throw new Error('Parametros "from" y "to" requeridos para rango personalizado');

    const from = new Date(`${query.from}T00:00:00`);
    const to = new Date(`${query.to}T23:59:59.999`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new Error('Rango de fechas invalido');
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

function normalizeText(value) {
  return String(value || '').trim();
}

function titleCase(value) {
  const text = normalizeText(value);
  if (!text || text === '-') return 'Sin dato';
  return text.replace(/^kit\s+/i, 'Kit ').replace(/\b\w/g, letter => letter.toUpperCase());
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

function isLeadRow(row) {
  const eventName = normalizeText(row.event_name);
  if (eventName) return eventName.endsWith('FormularioEnviado_WhatsApp');
  return Boolean(normalizeText(row.tipo) || normalizeText(row.ubicacion) || normalizeText(row.sistema));
}

function filterRowsByRange(rows, query) {
  const { from, to } = getSheetDateBounds(query);
  return rows.filter((row) => {
    const parsedDate = parseSheetDate(row);
    if (!parsedDate) return true;
    return parsedDate >= from && parsedDate <= to;
  });
}

router.get('/sheet-summary', async (req, res, next) => {
  try {
    const allRows = await getSheetRows();
    const leadRows = filterRowsByRange(allRows.filter(isLeadRow), req.query);
    const byTipo = countBy(leadRows, 'tipo');
    const byUbicacion = countBy(leadRows, 'ubicacion');
    const bySistema = countBy(leadRows, 'sistema');
    const byProducto = countBy(leadRows, 'producto', value => normalizeText(value) || 'Sin dato');

    const recentLeads = leadRows
      .slice()
      .sort((a, b) => (parseSheetDate(b)?.getTime() || 0) - (parseSheetDate(a)?.getTime() || 0))
      .slice(0, 8)
      .map(row => ({
        fecha: parseSheetDate(row)?.toISOString() || '',
        tipo: getField(row, 'tipo'),
        ubicacion: getField(row, 'ubicacion'),
        sistema: getField(row, 'sistema'),
        producto: getField(row, 'producto'),
        nombre: getField(row, 'nombre'),
        email: getField(row, 'email'),
      }));

    res.json({
      source: 'google_sheets',
      generatedAt: new Date().toISOString(),
      totals: {
        leads: leadRows.length,
        sheetRows: allRows.length,
        ubicaciones: byUbicacion.length,
        tipos: byTipo.length,
      },
      breakdowns: {
        tipo: byTipo,
        ubicacion: byUbicacion,
        sistema: bySistema,
        producto: byProducto,
      },
      dailyLeads: buildDailyLeads(leadRows),
      recentLeads,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/pageviews
// Page views y sesiones por día en el rango seleccionado
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pageviews', async (req, res, next) => {
  try {
    const dateRange = buildDateRange(req.query);
    const client    = getClient();

    const [response] = await client.runReport({
      property:   PROPERTY(),
      dateRanges: [dateRange],
      dimensions: [{ name: 'date' }],
      metrics:    [
        { name: 'screenPageViews' },
        { name: 'sessions'        },
        { name: 'activeUsers'     },
      ],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    });

    const data = (response.rows || []).map(row => ({
      date:        row.dimensionValues[0].value,           // "20240115"
      pageviews:   parseInt(row.metricValues[0].value, 10),
      sessions:    parseInt(row.metricValues[1].value, 10),
      activeUsers: parseInt(row.metricValues[2].value, 10),
    }));

    // Totales para las stat cards
    const totals = data.reduce((acc, d) => ({
      pageviews:   acc.pageviews   + d.pageviews,
      sessions:    acc.sessions    + d.sessions,
      activeUsers: acc.activeUsers + d.activeUsers,
    }), { pageviews: 0, sessions: 0, activeUsers: 0 });

    res.json({ data, totals });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/funnel
// Pasos completados por producto — para ver qué paso completan más
// ─────────────────────────────────────────────────────────────────────────────
router.get('/funnel', async (req, res, next) => {
  try {
    const dateRange = buildDateRange(req.query);
    const client    = getClient();

    // Todos los eventos de todos los productos
    const allEvents = Object.values(EVENTO_MAP).flatMap(m => Object.values(m));
    const uniqueEvents = [...new Set(allEvents)];

    const [response] = await client.runReport({
      property:   PROPERTY(),
      dateRanges: [dateRange],
      dimensions: [
        { name: 'eventName'            },
        { name: 'customEvent:producto' },
      ],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName:     'eventName',
          inListFilter:  { values: uniqueEvents },
        },
      },
    });

    // Construir mapa { producto: { paso1: N, paso2: N, ... } }
    const byProduct = {};

    PRODUCTOS_VALIDOS.forEach(p => {
      byProduct[p] = { paso1: 0, paso2: 0, paso3: 0, lead: 0 };
    });

    (response.rows || []).forEach(row => {
      const evento   = row.dimensionValues[0].value;
      const producto = row.dimensionValues[1].value;
      const count    = parseInt(row.metricValues[0].value, 10);

      PRODUCTOS_VALIDOS.forEach(prod => {
        const map = EVENTO_MAP[prod];
        Object.entries(map).forEach(([paso, ev]) => {
          if (ev === evento) {
            // Para generate_lead, solo sumamos si el producto coincide o si el evento
            // es el mismo (generate_lead se comparte entre productos)
            if (ev === 'generate_lead') {
              // Usamos el parámetro producto del evento
              if (producto === prod) {
                byProduct[prod][paso] += count;
              }
            } else {
              byProduct[prod][paso] += count;
            }
          }
        });
      });
    });

    // Formatear para el frontend
    const data = PRODUCTOS_VALIDOS.map(prod => ({
      producto: prod,
      pasos: Object.entries(byProduct[prod]).map(([paso, count]) => ({
        paso,
        label: PASO_LABELS[paso],
        count,
      })),
    }));

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/conversions
// Leads por producto en el período
// ─────────────────────────────────────────────────────────────────────────────
router.get('/conversions', async (req, res, next) => {
  try {
    const dateRange = buildDateRange(req.query);
    const client    = getClient();

    const [response] = await client.runReport({
      property:   PROPERTY(),
      dateRanges: [dateRange],
      dimensions: [{ name: 'customEvent:producto' }],
      metrics:    [{ name: 'eventCount'           }],
      dimensionFilter: {
        filter: {
          fieldName:    'eventName',
          stringFilter: { value: 'generate_lead', matchType: 'EXACT' },
        },
      },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    });

    const data = (response.rows || []).map(row => ({
      producto: row.dimensionValues[0].value || 'Sin clasificar',
      leads:    parseInt(row.metricValues[0].value, 10),
    }));

    const total = data.reduce((s, d) => s + d.leads, 0);

    res.json({ data, total });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/abandonment?producto=KitAlarmaCamara
// Tasa de abandono paso a paso para un producto específico
// ─────────────────────────────────────────────────────────────────────────────
router.get('/abandonment', async (req, res, next) => {
  try {
    const { producto = 'KitAlarmaCamara' } = req.query;

    if (!PRODUCTOS_VALIDOS.includes(producto)) {
      return res.status(400).json({
        error: `Producto inválido. Usar: ${PRODUCTOS_VALIDOS.join(', ')}`,
      });
    }

    const dateRange = buildDateRange(req.query);
    const client    = getClient();
    const eventos   = Object.values(EVENTO_MAP[producto]);

    const [response] = await client.runReport({
      property:   PROPERTY(),
      dateRanges: [dateRange],
      dimensions: [{ name: 'eventName' }],
      metrics:    [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName:    'eventName',
          inListFilter: { values: eventos },
        },
      },
    });

    // Mapa evento → count
    const countMap = {};
    (response.rows || []).forEach(row => {
      countMap[row.dimensionValues[0].value] = parseInt(row.metricValues[0].value, 10);
    });

    const pasos  = Object.entries(EVENTO_MAP[producto]);
    const data   = pasos.map(([paso, evento], i) => {
      const count    = countMap[evento] || 0;
      const prevEv   = i > 0 ? pasos[i - 1][1] : null;
      const prev     = prevEv ? (countMap[prevEv] || 0) : count;
      const abandono = (i > 0 && prev > 0)
        ? Math.round(((prev - count) / prev) * 100)
        : 0;

      return {
        paso,
        label:    PASO_LABELS[paso],
        evento,
        count,
        abandono,                                   // % que abandonó antes de este paso
        retencion: i === 0 ? 100 : (prev > 0 ? Math.round((count / prev) * 100) : 0),
      };
    });

    res.json({ data, producto });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/summary
// Resumen general: totales de todos los endpoints en una sola llamada
// ─────────────────────────────────────────────────────────────────────────────
router.get('/summary', async (req, res, next) => {
  try {
    const dateRange = buildDateRange(req.query);
    const client    = getClient();

    const [response] = await client.runReport({
      property:   PROPERTY(),
      dateRanges: [dateRange],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'sessions'        },
        { name: 'activeUsers'     },
        { name: 'bounceRate'      },
      ],
    });

    const row = response.rows?.[0];
    const summary = row ? {
      pageviews:   parseInt(row.metricValues[0].value, 10),
      sessions:    parseInt(row.metricValues[1].value, 10),
      activeUsers: parseInt(row.metricValues[2].value, 10),
      bounceRate:  parseFloat(row.metricValues[3].value).toFixed(1),
    } : { pageviews: 0, sessions: 0, activeUsers: 0, bounceRate: 0 };

    res.json({ summary });
  } catch (err) {
    next(err);
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/breakdown/tipo
// Desglose del paso 1: Casa vs Comercio por producto
// ─────────────────────────────────────────────────────────────────────────────
router.get("/breakdown/tipo", async (req, res, next) => {
  try {
    const dateRange = buildDateRange(req.query);
    const client    = getClient();

    const [response] = await client.runReport({
      property:   PROPERTY(),
      dateRanges: [dateRange],
      dimensions: [
        { name: "customEvent:producto" },
        { name: "customEvent:tipo"     },
      ],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName:    "eventName",
          inListFilter: { values: ["tipo_selected", "alarmas_tipo_selected", "camaras_tipo_selected"] },
        },
      },
    });

    const byProduct = {};
    (response.rows || []).forEach(row => {
      const producto = row.dimensionValues[0].value || "KitAlarmaCamara";
      const tipo     = row.dimensionValues[1].value || "(not set)";
      const count    = parseInt(row.metricValues[0].value, 10);
      if (!byProduct[producto]) byProduct[producto] = {};
      byProduct[producto][tipo] = (byProduct[producto][tipo] || 0) + count;
    });

    const data = Object.entries(byProduct).map(([producto, tipos]) => ({
      producto,
      desglose: Object.entries(tipos).map(([tipo, count]) => ({ tipo, count })),
    }));

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/breakdown/ubicacion
// Desglose del paso 2: por zona
// ─────────────────────────────────────────────────────────────────────────────
router.get("/breakdown/ubicacion", async (req, res, next) => {
  try {
    const dateRange = buildDateRange(req.query);
    const client    = getClient();

    const [response] = await client.runReport({
      property:   PROPERTY(),
      dateRanges: [dateRange],
      dimensions: [
        { name: "customEvent:producto"  },
        { name: "customEvent:ubicacion" },
      ],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName:    "eventName",
          inListFilter: {
            values: [
              "ubicacion_selected",
              "alarmas_ubicacion_selected",
              "camaras_ubicacion_selected",
              "gps_ubicacion_selected",
            ],
          },
        },
      },
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    });

    const byProduct = {};
    (response.rows || []).forEach(row => {
      const producto  = row.dimensionValues[0].value || "KitAlarmaCamara";
      const ubicacion = row.dimensionValues[1].value || "(not set)";
      const count     = parseInt(row.metricValues[0].value, 10);
      if (!byProduct[producto]) byProduct[producto] = {};
      byProduct[producto][ubicacion] = (byProduct[producto][ubicacion] || 0) + count;
    });

    const data = Object.entries(byProduct).map(([producto, zonas]) => ({
      producto,
      desglose: Object.entries(zonas)
        .map(([ubicacion, count]) => ({ ubicacion, count }))
        .sort((a, b) => b.count - a.count),
    }));

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
