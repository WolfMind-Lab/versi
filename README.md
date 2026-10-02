# VERSI — release PostgreSQL/Neon

Questa release mantiene il contratto API di VERSI e sostituisce il database SQLite con PostgreSQL/Neon.

## Struttura
- `server.js` — backend Express + PostgreSQL
- `public/` — frontend VERSI da mantenere dalla versione completa del repository
- `package.json` — dipendenze Node
- `render.yaml` — configurazione Render
- `.env.example` — variabili richieste

## Render
Impostare:
- `DATABASE_URL` = connection string Neon
- `JWT_SECRET` = segreto lungo e casuale

Non committare `.env` o credenziali reali.

## Health check
`GET /api/health`
