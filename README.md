# Analytics Backend

Backend Express para Albiero, preparado para deploy en Vercel Hobby con scheduler externo por GitHub Actions.

## Endpoints

- `GET /health`
- `POST /api/welcome/process`
- `POST /api/welcome/process?dryRun=true`
- `GET /unsubscribe?email=...`

## Variables de entorno

Crear las variables del archivo `.env` tambien en Vercel:

- `ANALYTICS_SECRET`
- `FRONTEND_URL`
- `PUBLIC_BASE_URL`
- `GA4_PROPERTY_ID`
- `SPREADSHEET_ID`
- `SPREADSHEET_SHEET_NAME`
- `EMAIL_USER`
- `EMAIL_PASS`
- `GOOGLE_SERVICE_ACCOUNT_JSON` o, alternativamente, `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

## Credenciales de Google en Vercel

No subir `service-account.json` a Vercel. Usar estas variables:

- `GOOGLE_SERVICE_ACCOUNT_JSON`: contenido completo del JSON de la service account
- `GOOGLE_CLIENT_EMAIL`: `client_email` del JSON
- `GOOGLE_PRIVATE_KEY`: `private_key` del JSON, conservando los saltos de linea como `\n`

## Scheduler externo

El workflow `.github/workflows/welcome-scheduler.yml` ejecuta cada 15 minutos y llama al backend desplegado.

Configurar estos secrets en GitHub:

- `WELCOME_PROCESS_URL`: URL completa del endpoint, por ejemplo `https://tu-backend.vercel.app/api/welcome/process`
- `WELCOME_PROCESS_TOKEN`: mismo valor que `ANALYTICS_SECRET`
