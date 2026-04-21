// server/src/ga4Client.js
// ─────────────────────────────────────────────────────────────────────────────
// Inicializa el cliente de GA4 una sola vez.
// Soporta dos modos:
//   1. GOOGLE_APPLICATION_CREDENTIALS apunta a un archivo JSON (local / dev)
//   2. GOOGLE_APPLICATION_CREDENTIALS_JSON tiene el contenido del JSON (Railway, Render)
// ─────────────────────────────────────────────────────────────────────────────
import { BetaAnalyticsDataClient } from '@google-analytics/data';

let client;

const getClient = () => {
  if (client) return client;

  const jsonEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (jsonEnv) {
    // Modo producción: credenciales como variable de entorno
    const credentials = JSON.parse(jsonEnv);
    client = new BetaAnalyticsDataClient({ credentials });
  } else {
    // Modo desarrollo: GOOGLE_APPLICATION_CREDENTIALS apunta al archivo
    client = new BetaAnalyticsDataClient();
  }

  return client;
};

export default getClient;