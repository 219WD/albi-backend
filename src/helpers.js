// server/src/helpers.js

// ── Construye el dateRange a partir de query params ───────────────────────────
// ?range=7d | 30d | 90d | custom&from=2024-01-01&to=2024-01-31
export const buildDateRange = (query) => {
  const { range, from, to } = query;

  if (range === 'custom') {
    if (!from || !to) {
      throw new Error('Parámetros "from" y "to" requeridos para rango personalizado');
    }
    // Validación básica de formato YYYY-MM-DD
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso.test(from) || !iso.test(to)) {
      throw new Error('Formato de fecha inválido. Usar YYYY-MM-DD');
    }
    if (new Date(from) > new Date(to)) {
      throw new Error('"from" debe ser anterior a "to"');
    }
    return { startDate: from, endDate: to };
  }

  const map = { '7d': '7daysAgo', '30d': '30daysAgo', '90d': '90daysAgo' };
  return { startDate: map[range] || '30daysAgo', endDate: 'today' };
};

// ── Mapeo de eventos por producto ─────────────────────────────────────────────
export const EVENTO_MAP = {
  KitAlarmaCamara: {
    paso1: 'tipo_selected',
    paso2: 'ubicacion_selected',
    paso3: 'sistema_selected',
    lead:  'generate_lead',
  },
  Alarmas: {
    paso1: 'alarmas_tipo_selected',
    paso2: 'alarmas_ubicacion_selected',
    paso3: 'alarmas_sistema_selected',
    lead:  'generate_lead',
  },
  Camaras: {
    paso1: 'camaras_tipo_selected',
    paso2: 'camaras_ubicacion_selected',
    paso3: 'camaras_sistema_selected',
    lead:  'generate_lead',
  },
  GPS: {
    paso1: 'gps_tipo_selected',
    paso2: 'gps_ubicacion_selected',
    paso3: 'gps_sistema_selected',
    lead:  'generate_lead',
  },
};

export const PRODUCTOS_VALIDOS = Object.keys(EVENTO_MAP);

export const PASO_LABELS = {
  paso1: 'Paso 1 — Tipo',
  paso2: 'Paso 2 — Ubicación',
  paso3: 'Paso 3 — Sistema',
  lead:  'Lead enviado',
};