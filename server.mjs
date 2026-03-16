import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFParse } from 'pdf-parse';
import { initializeApp as initializeAdminApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getMessaging as getAdminMessaging } from 'firebase-admin/messaging';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadDotEnv = () => {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) return;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');

    // Prefer the latest value in .env so duplicate keys behave predictably.
    process.env[key] = value;
  });
};

loadDotEnv();

const PORT = Number(process.env.AI_API_PORT || 8787);
const AI_PROVIDER = (process.env.AI_PROVIDER || 'openai').toLowerCase();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACKS = (process.env.GEMINI_MODEL_FALLBACKS ||
  'gemini-2.5-flash,gemini-2.0-flash')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_MODEL = process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.1-8b-instruct';
const PUSH_CRON_SECRET = process.env.PUSH_CRON_SECRET || '';

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Cron-Secret'
  });
  res.end(JSON.stringify(payload));
};

const parseBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 8_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });

const buildSystemPrompt = (context = {}) => {
  const name = context?.name || 'User';
  const activeHabits = Number(context?.activeHabits || 0);
  const completedCount = Number(context?.completedCount || 0);
  const pendingCount = Number(context?.pendingCount || 0);
  const cheatDay = context?.cheatDay || 'sunday';
  const now = new Date();
  const todayWeekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const todayDate = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return [
    'You are HabytARC AI, a habit coach.',
    'Give practical, concise guidance rooted in Atomic Habits principles.',
    'Use bullet points only when needed.',
    'Avoid medical, legal, or financial claims.',
    'If asked who developed HabytARC, respond: "Zavris."',
    `If asked what day/date it is today, use this server value: ${todayWeekday}, ${todayDate}.`,
    'Do not guess date/day beyond the provided server value.',
    `User: ${name}. Active habits: ${activeHabits}. Completed today: ${completedCount}. Pending work: ${pendingCount}. Cheat day: ${cheatDay}.`,
    'Always finish with one specific next action the user can do now.'
  ].join(' ');
};

const parseErrorMessage = (text, fallback) => {
  try {
    const parsed = JSON.parse(text);
    return {
      message:
        parsed?.error?.message ||
        parsed?.error?.code ||
        text ||
        fallback,
      code: parsed?.error?.code || null
    };
  } catch {
    return { message: text || fallback, code: null };
  }
};

const parseDataUrl = (value = '') => {
  const raw = String(value || '').trim();
  const matched = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (!matched) return null;
  return {
    mimeType: matched[1],
    base64: matched[2]
  };
};

const dataUrlToBuffer = (value = '') => {
  const parsed = parseDataUrl(value);
  if (!parsed?.base64) return null;
  return Buffer.from(parsed.base64, 'base64');
};

const extractPdfTextFromDataUrl = async (value = '') => {
  const buffer = dataUrlToBuffer(value);
  if (!buffer) return '';
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    return String(parsed?.text || '').trim();
  } finally {
    await parser.destroy().catch(() => {});
  }
};

const buildSyllabusPrompt = ({ manualText, fileKind }) => [
  'You extract exam syllabus topics.',
  'Return strict JSON only.',
  'Use this shape: {"units":[{"title":"Unit 1","topics":["Topic 1","Topic 2"]}]}.',
  'Keep units, modules, chapters, sections, or named syllabus blocks separate.',
  'Preserve the actual unit/module/chapter names from the source whenever they exist.',
  'Do not flatten topics from different units into one list.',
  'Do not rename a real heading like "Programming Fundamentals" into a generic label like "Unit 1".',
  'Only use generic labels like "Unit 1" when the source truly has no visible section name.',
  'Keep each topic short and actionable.',
  'Remove numbering, duplicates, headers, dates, and administrative text.',
  'If units contain subtopics, split them into separate concise topics.',
  'If content is unreadable, return {"units":[]}.',
  manualText ? `Manual text:\n${manualText}` : '',
  fileKind === 'image' ? 'Also extract the syllabus from the attached image.' : '',
  fileKind === 'pdf' ? 'Also extract the syllabus from the attached PDF document.' : ''
].filter(Boolean).join('\n\n');

const parseTopicsFromReply = (reply = '') => {
  const raw = String(reply || '').trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    const units = Array.isArray(parsed?.units) ? parsed.units : [];
    if (units.length > 0) {
      return units.flatMap((unit, unitIndex) => {
        const unitTitle = String(unit?.title || `Unit ${unitIndex + 1}`).trim() || `Unit ${unitIndex + 1}`;
        const topics = Array.isArray(unit?.topics)
          ? unit.topics
          : Array.isArray(unit?.items)
            ? unit.items
            : Array.isArray(unit?.subtopics)
              ? unit.subtopics
              : [];
        return topics
          .map((item) => String(item || '').trim())
          .filter(Boolean)
          .map((title) => ({ unit: unitTitle, title }));
      });
    }

    const topics = Array.isArray(parsed?.topics) ? parsed.topics : [];
    return topics
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .map((title) => ({ unit: 'General', title }));
  } catch {
    let currentUnit = 'General';
    return raw
      .split(/\r?\n/)
      .map((line) => line.replace(/^[\-\d.)\s]+/, '').trim())
      .filter(Boolean)
      .flatMap((line) => {
        if (/^(unit|module|chapter|section)\b/i.test(line)) {
          currentUnit = line;
          return [];
        }
        return [{ unit: currentUnit, title: line }];
      });
  }
};

const parseServiceAccount = () => {
  const projectId = process.env.FIREBASE_PROJECT_ID || '';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY || '';
  const privateKey = privateKeyRaw ? privateKeyRaw.replace(/\\n/g, '\n') : '';

  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
};

const getAdminApp = () => {
  if (getApps().length > 0) return getApps()[0];

  const serviceAccount = parseServiceAccount();
  if (serviceAccount) {
    return initializeAdminApp({ credential: cert(serviceAccount) });
  }

  return initializeAdminApp({ credential: applicationDefault() });
};

const formatDateForTimeZone = (date, timeZone) =>
  new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone
  }).format(date);

const formatTimeForTimeZone = (date, timeZone) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone
  }).format(date);

const getNowByZone = (timeZone = 'UTC') => {
  const now = new Date();
  const dateKey = formatDateForTimeZone(now, timeZone);
  const timeKey = formatTimeForTimeZone(now, timeZone);
  return { dateKey, timeKey };
};

const runPushReminderCycle = async () => {
  const adminApp = getAdminApp();
  const db = getAdminFirestore(adminApp);
  const messaging = getAdminMessaging(adminApp);

  const dueSnapshot = await db
    .collectionGroup('todos')
    .where('reminderEnabled', '==', true)
    .where('completed', '==', false)
    .get();

  const userCache = new Map();
  let scanned = 0;
  let sent = 0;
  let cleared = 0;
  let failed = 0;

  for (const todoDoc of dueSnapshot.docs) {
    scanned += 1;
    const todo = todoDoc.data() || {};
    const reminderTime = String(todo?.reminderTime || '').trim();
    if (!reminderTime) continue;

    const usersRef = todoDoc.ref.parent?.parent;
    const uid = usersRef?.id;
    if (!uid) continue;

    if (!userCache.has(uid)) {
      const userDoc = await db.collection('users').doc(uid).get();
      userCache.set(uid, userDoc.exists ? (userDoc.data() || {}) : {});
    }
    const userProfile = userCache.get(uid) || {};
    if (userProfile.todoReminderEnabled !== true) continue;

    const timeZone = String(userProfile.timeZone || 'UTC');
    const { dateKey, timeKey } = getNowByZone(timeZone);
    const dueDate = String(todo?.dueDate || dateKey);
    const isDue = dueDate < dateKey || (dueDate === dateKey && reminderTime <= timeKey);
    if (!isDue) continue;

    const pushTokenDocs = await db.collection('users').doc(uid).collection('push_tokens').get();
    const tokens = pushTokenDocs.docs
      .map((item) => String(item.data()?.token || '').trim())
      .filter(Boolean);

    if (tokens.length > 0) {
      const message = {
        notification: {
          title: 'HabytARC Task Reminder',
          body: todo?.text ? `Time for: ${todo.text}` : 'You have a scheduled to-do reminder.'
        },
        data: {
          tag: `todo_item_${todoDoc.id}_${dateKey}`,
          todoId: todoDoc.id,
          uid
        },
        tokens
      };

      try {
        const result = await messaging.sendEachForMulticast(message);
        sent += result.successCount;
        failed += result.failureCount;

        const deadRefs = [];
        result.responses.forEach((resp, index) => {
          if (resp.success) return;
          const code = String(resp?.error?.code || '');
          if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
            const bad = tokens[index];
            const matchDoc = pushTokenDocs.docs.find((d) => String(d.data()?.token || '') === bad);
            if (matchDoc) deadRefs.push(matchDoc.ref);
          }
        });
        if (deadRefs.length > 0) {
          const batch = db.batch();
          deadRefs.forEach((ref) => batch.delete(ref));
          await batch.commit();
        }
      } catch (error) {
        failed += tokens.length;
        console.error('Push send failed for todo:', todoDoc.id, error);
      }
    }

    await todoDoc.ref.update({
      reminderEnabled: false,
      reminderTime: '',
      reminderSentAtMs: Date.now()
    });
    cleared += 1;
  }

  return { scanned, sent, cleared, failed };
};

const toGeminiContents = (messages = []) =>
  messages.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

const callOpenAI = async ({ context, recentHistory, userMessage, systemPrompt }) => {
  if (!OPENAI_API_KEY) {
    return { ok: false, status: 500, error: 'Missing OPENAI_API_KEY on server', code: null };
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt || buildSystemPrompt(context) },
        ...recentHistory,
        { role: 'user', content: userMessage }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    const { message, code } = parseErrorMessage(errorText, 'OpenAI request failed');
    return { ok: false, status: response.status, error: message, code };
  }

  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    return { ok: false, status: 502, error: 'No reply from OpenAI model', code: null };
  }
  return { ok: true, reply };
};

const callOpenAISyllabus = async ({ manualText, fileDataUrl, fileKind }) => {
  if (!OPENAI_API_KEY) {
    return { ok: false, status: 500, error: 'Missing OPENAI_API_KEY on server', code: null };
  }

  if (fileKind === 'pdf') {
    return {
      ok: false,
      status: 400,
      error: 'PDF AI extraction is not available with the current OpenAI syllabus route. Use Gemini for PDF extraction or paste the syllabus text.',
      code: null
    };
  }

  const content = [];
  const prompt = buildSyllabusPrompt({ manualText, fileKind });
  content.push({ type: 'text', text: prompt });
  if (fileDataUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: fileDataUrl }
    });
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You convert syllabus text or images into structured exam topics.'
        },
        {
          role: 'user',
          content
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    const { message, code } = parseErrorMessage(errorText, 'OpenAI syllabus request failed');
    return { ok: false, status: response.status, error: message, code };
  }

  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  return { ok: true, reply };
};

const callGemini = async ({ context, recentHistory, userMessage, systemPrompt }) => {
  if (!GEMINI_API_KEY) {
    return { ok: false, status: 500, error: 'Missing GEMINI_API_KEY on server', code: null };
  }

  const modelsToTry = [GEMINI_MODEL, ...GEMINI_MODEL_FALLBACKS.filter((m) => m !== GEMINI_MODEL)];
  let lastError = { ok: false, status: 500, error: 'Gemini request failed', code: null };

  for (const modelName of modelsToTry) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt || buildSystemPrompt(context) }]
          },
          contents: toGeminiContents([
            ...recentHistory,
            { role: 'user', content: userMessage }
          ]),
          generationConfig: {
            temperature: 0.7
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      const { message, code } = parseErrorMessage(errorText, 'Gemini request failed');
      lastError = { ok: false, status: response.status, error: message, code };

      const modelMissing = String(message).toLowerCase().includes('not found');
      if (modelMissing) {
        continue;
      }
      return lastError;
    }

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!reply) {
      return { ok: false, status: 502, error: 'No reply from Gemini model', code: null };
    }
    return { ok: true, reply };
  }

  return lastError;
};

const callGeminiSyllabus = async ({ manualText, fileDataUrl, fileKind }) => {
  if (!GEMINI_API_KEY) {
    return { ok: false, status: 500, error: 'Missing GEMINI_API_KEY on server', code: null };
  }

  const modelsToTry = [GEMINI_MODEL, ...GEMINI_MODEL_FALLBACKS.filter((m) => m !== GEMINI_MODEL)];
  let lastError = { ok: false, status: 500, error: 'Gemini syllabus request failed', code: null };
  const filePayload = parseDataUrl(fileDataUrl);

  for (const modelName of modelsToTry) {
    const parts = [{ text: buildSyllabusPrompt({ manualText, fileKind }) }];
    if (filePayload) {
      parts.push({
        inlineData: {
          mimeType: filePayload.mimeType,
          data: filePayload.base64
        }
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: 'You convert syllabus text, images, or PDFs into structured exam topics.' }]
          },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      const { message, code } = parseErrorMessage(errorText, 'Gemini syllabus request failed');
      lastError = { ok: false, status: response.status, error: message, code };
      if (String(message).toLowerCase().includes('not found')) continue;
      return lastError;
    }

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!reply) {
      return { ok: false, status: 502, error: 'No reply from Gemini model', code: null };
    }
    return { ok: true, reply };
  }

  return lastError;
};

const callOllama = async ({ context, recentHistory, userMessage, systemPrompt }) => {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        options: {
          temperature: 0.7
        },
        messages: [
          { role: 'system', content: systemPrompt || buildSystemPrompt(context) },
          ...recentHistory,
          { role: 'user', content: userMessage }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      const { message, code } = parseErrorMessage(errorText, 'Ollama request failed');
      return { ok: false, status: response.status, error: message, code };
    }

    const data = await response.json();
    const reply = data?.message?.content?.trim();
    if (!reply) {
      return { ok: false, status: 502, error: 'No reply from Ollama model', code: null };
    }
    return { ok: true, reply };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: `Ollama connection failed. Start Ollama and ensure model "${OLLAMA_MODEL}" is available.`,
      code: null
    };
  }
};

const callCloudflare = async ({ context, recentHistory, userMessage, systemPrompt }) => {
  const invalidAccountId =
    !CLOUDFLARE_ACCOUNT_ID ||
    CLOUDFLARE_ACCOUNT_ID === 'your_account_id' ||
    CLOUDFLARE_ACCOUNT_ID === 'your_cloudflare_account_id';

  const invalidToken =
    !CLOUDFLARE_API_TOKEN ||
    CLOUDFLARE_API_TOKEN === 'your_api_token' ||
    CLOUDFLARE_API_TOKEN === 'your_cloudflare_api_token';

  const invalidModel =
    !CLOUDFLARE_MODEL ||
    CLOUDFLARE_MODEL === 'your_model';

  if (invalidAccountId) {
    return {
      ok: false,
      status: 500,
      error: 'Invalid CLOUDFLARE_ACCOUNT_ID. Replace placeholder with your real Cloudflare Account ID.',
      code: null
    };
  }

  if (invalidToken) {
    return {
      ok: false,
      status: 500,
      error: 'Invalid CLOUDFLARE_API_TOKEN. Replace placeholder with your real API token.',
      code: null
    };
  }

  if (invalidModel) {
    return {
      ok: false,
      status: 500,
      error: 'Invalid CLOUDFLARE_MODEL. Use a valid Workers AI model path like @cf/meta/llama-3.1-8b-instruct.',
      code: null
    };
  }

  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    return {
      ok: false,
      status: 500,
      error: 'Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN on server',
      code: null
    };
  }

  const modelPath = encodeURI(CLOUDFLARE_MODEL);

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(CLOUDFLARE_ACCOUNT_ID)}/ai/run/${modelPath}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt || buildSystemPrompt(context) },
          ...recentHistory,
          { role: 'user', content: userMessage }
        ]
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    const { message, code } = parseErrorMessage(errorText, 'Cloudflare AI request failed');
    return { ok: false, status: response.status, error: message, code };
  }

  const data = await response.json();
  const reply =
    data?.result?.response?.trim?.() ||
    (typeof data?.result === 'string' ? data.result.trim() : '');

  if (!reply) {
    return { ok: false, status: 502, error: 'No reply from Cloudflare model', code: null };
  }

  return { ok: true, reply };
};

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (reqUrl.pathname === '/api/push/run-due-reminders') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    if (!PUSH_CRON_SECRET || req.headers['x-cron-secret'] !== PUSH_CRON_SECRET) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }

    try {
      const stats = await runPushReminderCycle();
      sendJson(res, 200, { ok: true, stats });
    } catch (error) {
      console.error('Push reminder cycle failed:', error);
      sendJson(res, 500, { ok: false, error: 'Push reminder cycle failed' });
    }
    return;
  }

  if (reqUrl.pathname === '/api/exam-syllabus' && req.method === 'POST') {
    if (!['openai', 'gemini', 'ollama', 'cloudflare'].includes(AI_PROVIDER)) {
      sendJson(res, 500, { error: `Unsupported AI_PROVIDER: ${AI_PROVIDER}` });
      return;
    }

    try {
      const body = await parseBody(req);
      let manualText = String(body?.manualText || '').trim();
      const fileDataUrl = String(body?.fileDataUrl || body?.imageDataUrl || '').trim();
      const fileKind = String(body?.fileKind || '').trim().toLowerCase();

      if (!manualText && !fileDataUrl) {
        sendJson(res, 400, { error: 'manualText or fileDataUrl is required' });
        return;
      }

      let providerFileDataUrl = fileDataUrl;
      let providerFileKind = fileKind;

      if (fileKind === 'pdf' && fileDataUrl) {
        const pdfText = await extractPdfTextFromDataUrl(fileDataUrl);
        if (!pdfText) {
          sendJson(res, 400, {
            error: 'Could not read text from this PDF. Try another PDF or paste the syllabus text manually.'
          });
          return;
        }
        manualText = [manualText, pdfText].filter(Boolean).join('\n\n');
        providerFileDataUrl = '';
        providerFileKind = '';
      }

      if ((AI_PROVIDER === 'ollama' || AI_PROVIDER === 'cloudflare') && providerFileDataUrl) {
        sendJson(res, 400, {
          error: `${AI_PROVIDER} syllabus extraction from uploaded files is not available. Paste the syllabus text instead.`
        });
        return;
      }

      const providerResult =
        AI_PROVIDER === 'gemini'
          ? await callGeminiSyllabus({ manualText, fileDataUrl: providerFileDataUrl, fileKind: providerFileKind })
          : AI_PROVIDER === 'openai'
            ? await callOpenAISyllabus({ manualText, fileDataUrl: providerFileDataUrl, fileKind: providerFileKind })
          : await callOpenAI({
              context: {},
              recentHistory: [],
              userMessage: buildSyllabusPrompt({ manualText, fileKind: '' }),
              systemPrompt: 'You convert syllabus text into strict JSON: {"units":[{"title":"Unit 1","topics":["Topic 1"]}]}. Keep real unit and chapter names separate.'
            });

      if (!providerResult.ok) {
        sendJson(res, providerResult.status || 500, {
          error: providerResult.error || 'Syllabus extraction failed',
          code: providerResult.code || null
        });
        return;
      }

      sendJson(res, 200, { topics: parseTopicsFromReply(providerResult.reply) });
    } catch (error) {
      console.error('Exam syllabus extraction error:', error);
      sendJson(res, 500, { error: 'Failed to extract syllabus' });
    }
    return;
  }

  if (reqUrl.pathname !== '/api/chat' || req.method !== 'POST') {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  if (!['openai', 'gemini', 'ollama', 'cloudflare'].includes(AI_PROVIDER)) {
    sendJson(res, 500, { error: `Unsupported AI_PROVIDER: ${AI_PROVIDER}` });
    return;
  }

  try {
    const body = await parseBody(req);
    const userMessage = String(body?.message || '').trim();
    const history = Array.isArray(body?.history) ? body.history : [];
    const context = body?.context || {};
    const systemPrompt = undefined;

    if (!userMessage) {
      sendJson(res, 400, { error: 'Message is required' });
      return;
    }

    const recentHistory = history
      .slice(-10)
      .map((msg) => ({
        role: msg?.role === 'assistant' ? 'assistant' : 'user',
        content: String(msg?.text || '')
      }))
      .filter((msg) => msg.content.trim().length > 0);

    const providerResult =
      AI_PROVIDER === 'gemini'
        ? await callGemini({ context, recentHistory, userMessage, systemPrompt })
        : AI_PROVIDER === 'cloudflare'
          ? await callCloudflare({ context, recentHistory, userMessage, systemPrompt })
        : AI_PROVIDER === 'ollama'
          ? await callOllama({ context, recentHistory, userMessage, systemPrompt })
          : await callOpenAI({ context, recentHistory, userMessage, systemPrompt });

    if (!providerResult.ok) {
      sendJson(res, providerResult.status || 500, {
        error: providerResult.error || 'AI request failed',
        code: providerResult.code || null
      });
      return;
    }

    sendJson(res, 200, { reply: providerResult.reply });
  } catch (error) {
    console.error('AI chat error:', error);
    sendJson(res, 500, { error: 'Failed to generate response' });
  }
});

server.listen(PORT, () => {
  console.log(`AI API server running on http://localhost:${PORT} (provider: ${AI_PROVIDER})`);
});
