# VERSI — versione ufficiale

Social network poetico con autenticazione, PostgreSQL/Neon, poesie, categorie, ricerca, Mi piace, salvataggi, preferiti, raccolte, follower, commenti, notifiche, profili e visibilità pubblica/follower/privata.

## Deploy Render + Neon
1. Crea un database PostgreSQL su Neon.
2. In Render imposta `DATABASE_URL` con la connection string Neon e `JWT_SECRET` con un segreto lungo e casuale.
3. Build command: `npm install`.
4. Start command: `npm start`.
5. Il database viene inizializzato automaticamente al primo avvio.

## Locale
Copia `.env.example` in `.env`, imposta le variabili e avvia `npm install && npm start`.

Nota: questa versione usa PostgreSQL persistente. Un eventuale vecchio file SQLite `versi.db` non viene importato automaticamente.
