# HabytARC V3

HabytARC V3 is the third version of HabytARC: a React + Firebase productivity system split into two focused spaces:

- `HabytARC` for habits, progress, to-dos, calendar, stats, profile, and AI chat
- `Zenvy` for exam preparation, syllabus tracking, and study material management

## Core Highlights

- Minimal habit-first home dashboard focused on progress and today’s habits
- Habit creation with optional advanced settings like reminders, micro-habits, adaptive mode, and context preferences
- To-do management with reminders, recurrence, subtasks, and advanced options
- Calendar and analytics views for streaks, consistency, and progress trends
- Playful AI chat for habit guidance, streak recovery, and quick habit actions
- Post-login workspace choice between HabytARC and Zenvy

## Zenvy Exam Mode

Zenvy includes:

- subject-based exam planning
- manual syllabus entry or AI extraction from pasted text, images, and PDFs
- unit-wise or chapter-wise syllabus grouping
- topic tracking with progress inside each subject
- study material links, YouTube links, and local browser-stored file attachments
- in-app preview for supported files with fullscreen mode

Note:

- Uploaded study materials are currently stored in the local browser, not cloud storage.
- Links and metadata can still be saved with the subject data.

## Tech Stack

- React 18
- React Router
- Vite
- Firebase Auth
- Firestore
- Firebase Cloud Messaging for push notifications
- Node.js AI backend

## Project Structure

```text
HabytARC/
|- client/
|  |- public/
|  `- src/
|     |- components/
|     |- config/
|     |- pages/
|     |- styles/
|     `- utils/
|- server.mjs
|- firestore.rules
|- firebase.json
|- .env.example
`- package.json
```

## Setup

1. Install dependencies

```bash
npm install
```

2. Configure Firebase in [client/src/config/firebase.js](./client/src/config/firebase.js)

3. Create a local `.env` file

```bash
copy .env.example .env
```

4. Point the frontend to the backend during development

```env
VITE_AI_API_BASE_URL=http://localhost:8787
```

5. Keep only one active AI provider in `.env`

## Run Locally

Frontend:

```bash
npm run dev
```

Backend:

```bash
npm run dev:api
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8787`

## AI Providers

Supported:

- `gemini`
- `openai`
- `ollama`
- `cloudflare`

Current notes:

- Gemini is the strongest path for syllabus extraction from uploaded PDFs and images
- PDFs are also parsed locally before AI structuring
- if you change `.env`, restart the backend

## Firestore Rules

Deploy the rules in this repo with:

```bash
firebase deploy --only firestore:rules
```

This is important for authenticated app data and the newer public/accountability collections if you still use those features in older preview paths.

## Push Notifications

To support due reminders and push notifications:

1. Set `VITE_FIREBASE_VAPID_KEY`
2. Add these backend values in `.env`
   - `PUSH_CRON_SECRET`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
3. Trigger:

```text
POST /api/push/run-due-reminders
Header: X-Cron-Secret: <PUSH_CRON_SECRET>
```

## Scripts

- `npm run dev` starts the Vite frontend
- `npm run dev:api` starts the AI backend
- `npm run build` creates the production build
- `npm run preview` previews the production build

## Current Product Direction

HabytARC V3 is designed to feel cleaner and more focused than the earlier versions:

- less clutter on the home page
- advanced settings hidden until needed
- separated exam workspace
- more human AI chat tone

## Notes

- Keep API keys and secrets out of version control
- If UI changes do not show in development, restart `npm run dev` and hard refresh the browser
- Some older leftover Firebase Storage settings may still exist in config, but current study material uploads use the browser-local fallback
