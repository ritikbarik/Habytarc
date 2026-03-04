import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
};

loadDotEnv();

const PORT = Number(process.env.AI_API_PORT || 8787);
const AI_PROVIDER = (process.env.AI_PROVIDER || 'openai').toLowerCase();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_MODEL_FALLBACKS = (process.env.GEMINI_MODEL_FALLBACKS ||
  'gemini-2.0-flash,gemini-1.5-flash,gemini-1.5-flash-8b')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_MODEL = process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.1-8b-instruct';

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
};

const parseBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
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
  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.url !== '/api/chat' || req.method !== 'POST') {
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
