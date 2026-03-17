# HabytARC

HabytARC is a React + Firebase productivity app for habits, to-dos, calendar tracking, AI chat, and exam preparation.

## What It Includes

- Habit tracking with streak-aware progress
- To-do management
- Calendar and stats views
- AI chat with provider-based backend
- Exam Mode for:
  - subject-wise syllabus management
  - AI syllabus extraction from text, images, and PDFs
  - unit/chapter-wise topic grouping
  - study material tracking
  - cloud-backed file uploads with Firebase Storage
  - in-app file preview with full-screen support

## Tech Stack

- React 18
- React Router
- Vite
- Firebase Auth
- Firestore
- Firebase Storage
- Node.js AI API server

## Project Structure

```text
HabytARC/
|- client/
|  |- public/
|  |- src/
|  |  |- components/
|  |  |- config/
|  |  |- pages/
|  |  `- utils/
|- server.mjs
|- firestore.rules
|- storage.rules
|- firebase.json
|- .env.example
`- package.json
```

## Prerequisites

- Node.js 18+
- npm
- A Firebase project
- At least one AI provider key if you want AI chat or syllabus extraction

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure Firebase client settings in [client/src/config/firebase.js](./client/src/config/firebase.js).

3. Create a local `.env` from `.env.example` if you want the AI backend:

```bash
copy .env.example .env
```

4. In `.env`, keep only one `AI_PROVIDER` line.

5. If the frontend should call the local AI server, set:

```env
VITE_AI_API_BASE_URL=http://localhost:8787
```

## Run Locally

Frontend:

```bash
npm run dev
```

Backend:

```bash
npm run dev:api
```

Default URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8787`

## AI Provider Notes

Supported providers:

- `openai`
- `gemini`
- `ollama`
- `cloudflare`

Notes:

- Gemini is the most complete path for uploaded image/PDF syllabus extraction.
- PDFs are also parsed locally before AI structuring, which improves reliability.
- Cloudflare and Ollama are more limited for direct uploaded-file extraction.
- After changing `.env`, restart the backend.

## Exam Mode

Exam Mode lets users:

- create subjects
- add syllabus manually or via AI extraction
- keep topics grouped by unit/module/chapter
- mark syllabus items as done, skipped, or pending
- upload study materials or attach links/YouTube resources
- store uploaded study materials in Firebase Storage
- open PDFs, images, text files, Office links, and YouTube resources inside the app

## Firebase Deployment

Deploy Firestore rules:

```bash
firebase deploy --only firestore:rules
```

Deploy Storage rules:

```bash
firebase deploy --only storage
```

Storage uploads for study materials and syllabus files will not work correctly until Storage rules are deployed.

## Push Notifications

For reminder notifications after deployment:

1. Set `VITE_FIREBASE_VAPID_KEY`
2. Set backend values in `.env`:
   - `PUSH_CRON_SECRET`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
3. Call this endpoint from a cron job:

```text
POST /api/push/run-due-reminders
Header: X-Cron-Secret: <PUSH_CRON_SECRET>
```

## Scripts

- `npm run dev` - start Vite frontend
- `npm run dev:api` - start AI API server
- `npm run build` - create production build
- `npm run preview` - preview production build

## Important Notes

- Keep secrets out of version control.
- Uploaded files now use Firebase Storage for cloud access.
- Older browser-local files may still appear for backward compatibility.
- If UI changes do not appear during development, restart `npm run dev` and hard refresh the browser.
