# VERSI — Social poetico

MVP full-stack del social dedicato alla poesia.

## Funzioni incluse

- Registrazione e login
- Ruolo `writer` / `reader`
- JWT authentication
- Database SQLite
- Feed pubblico
- Filtri per emozione
- Ricerca
- Pubblicazione poesie
- Visibilità pubblica / follower / privata (base dati pronta)
- Like
- Salvataggi
- Follow
- Commenti
- Notifiche
- Profilo autore
- API REST

## Avvio locale

Richiede Node.js 20+.

```bash
npm install
npm start
```

Apri `http://localhost:3000`.

Per produzione imposta una variabile:

```bash
JWT_SECRET=una-chiave-lunga-e-casuale
```

## Struttura

- `server.js` backend Express + SQLite
- `public/index.html` shell
- `public/app.js` interfaccia e chiamate API
- `public/style.css` stile
- `versi.db` viene creato automaticamente al primo avvio

## Prossimi moduli

Storage immagini, email verification, password reset, moderazione, messaggistica, ricerca avanzata, paginazione, rate limiting, backup DB, HTTPS, analytics, PWA/app mobile e monetizzazione.
