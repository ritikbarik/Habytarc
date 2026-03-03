# HabytARC

Habit tracker built with React + Firebase, with an optional AI coach API.

## Tech Stack

- Frontend: React 18, React Router, Vite
- Backend (optional): Node.js HTTP server (`server.mjs`)
- Database/Auth: Firebase (Firestore + Google Sign-In)

## Features

- Google authentication
- Daily habit tracking with calendar view
- Stats dashboard
- Profile and career-based habit setup
- AI chat page (`/chat`) with provider support:
  - OpenAI
  - Gemini
  - Ollama
  - Cloudflare Workers AI

## Project Structure

```text
HabytARC/
|- client/                 # React app
|  |- src/
|  |  |- pages/            # Login, Home, Calendar, Habits, Stats, Profile, AIChat
|  |  |- components/
|  |  |- utils/
|  |  `- config/firebase.js
|- server.mjs              # Optional AI API server
|- .env.example            # AI server environment template
|- package.json
`- vite.config.js          # Vite root: ./client, /api proxy -> :8787
```

## Prerequisites

- Node.js 18+ (Node 20 recommended)
- npm
- Firebase project with:
  - Google sign-in enabled
  - Firestore database created

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure Firebase in `client/src/config/firebase.js`.

3. Start frontend dev server:

```bash
npm run dev
```

Frontend runs on `http://localhost:5173`.

## AI Chat Setup (Optional)

The frontend sends `/api/chat` requests. In development, Vite proxies `/api` to `http://localhost:8787` (see `vite.config.js`), so the AI API server must be running for chat responses.

1. Create `.env` from `.env.example`.
2. Set `AI_PROVIDER` and matching credentials.
3. Start AI server:

```bash
npm run dev:api
```

Supported providers:

- `openai`: needs `OPENAI_API_KEY`
- `gemini`: needs `GEMINI_API_KEY`
- `ollama`: needs local Ollama server and model
- `cloudflare`: needs `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`

### Example `.env` (OpenAI)

```env
AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
AI_API_PORT=8787
```

### Example `.env` (Gemini)

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-flash
GEMINI_MODEL_FALLBACKS=gemini-2.0-flash,gemini-1.5-flash,gemini-1.5-flash-8b
AI_API_PORT=8787
```

## Available Scripts

- `npm run dev`: start Vite dev server
- `npm run dev:api`: start AI API server using `.env`
- `npm run build`: production build to `dist/`
- `npm run preview`: preview production build

## Production Build

```bash
npm run build
npm run preview
```

## Common Issues

- Chat returns errors:
  - Ensure `npm run dev:api` is running.
  - Verify API keys and `AI_PROVIDER` in `.env`.
- Firebase auth or Firestore permission errors:
  - Verify Firebase configuration.
  - Check Firestore security rules and Authentication settings.
- Port conflicts:
  - Change frontend port: `npm run dev -- --port 3000`
  - Change API port: set `AI_API_PORT` in `.env` and update Vite proxy if needed.

## Notes

- `dist/` is generated build output.
- `node_modules/` should not be committed.
