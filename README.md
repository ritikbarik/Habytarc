# HabytARC

A habit and task tracking app built with React, Vite, Firebase, and an optional AI API server.

## Tech Stack

- React 18
- React Router
- Vite
- Firebase Auth + Firestore
- Node.js (optional AI server)

## Required Files

- `client/src/config/firebase.js` (Firebase client config)
- `.env` (only if running AI API server)
- `package.json`

## Project Structure

```text
HabytARC/
|- client/
|  |- src/
|  |  |- pages/
|  |  |- components/
|  |  |- utils/
|  |  `- config/firebase.js
|- server.mjs
|- .env.example
|- package.json
`- vite.config.js
```

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure Firebase in:

```text
client/src/config/firebase.js
```

3. Run frontend:

```bash
npm run dev
```

Frontend default URL: `http://localhost:5173`

## Optional: AI API Server

1. Create `.env` from `.env.example`
2. Set provider and keys
3. Keep only one `AI_PROVIDER` line in `.env`
4. Restart the backend after changing `.env`
3. Run:

```bash
npm run dev:api
```

## Push Notifications (FCM)

For reliable reminders after deployment (including background/closed-tab), configure:

1. `VITE_FIREBASE_VAPID_KEY` in frontend env.
2. Backend env in `.env`:
   - `PUSH_CRON_SECRET`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (with `\n` escaped line breaks)
3. Deploy API server and trigger this endpoint every minute via cron:

```text
POST /api/push/run-due-reminders
Header: X-Cron-Secret: <PUSH_CRON_SECRET>
```

## Scripts

- `npm run dev` - start frontend
- `npm run dev:api` - start AI API server
- `npm run build` - production build
- `npm run preview` - preview production build

## Notes

- Keep credentials out of version control.
- Use `.env` and Firebase rules to secure data.
