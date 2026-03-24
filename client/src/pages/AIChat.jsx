import React, { useEffect, useMemo, useState } from 'react';
import { clearAIChatHistory, createHabit, deleteHabit, getAIChatHistory, getPendingTasksUpToDate, getUserHabits, getTrackingForDate, saveAIChatMessage } from '../utils/firebaseService';
import { getDateString } from '../utils/dateUtils';

const AI_API_BASE_URL = String(import.meta.env.VITE_AI_API_BASE_URL || '').trim();
const resolveApiBaseUrl = () => {
  if (!AI_API_BASE_URL) return '';

  try {
    const configuredUrl = new URL(AI_API_BASE_URL);
    const browserHost = typeof window !== 'undefined' ? window.location.hostname : '';
    const configuredHost = configuredUrl.hostname;
    const configuredIsLocalhost =
      configuredHost === 'localhost' ||
      configuredHost === '127.0.0.1' ||
      configuredHost === '::1';
    const browserIsLocalhost =
      browserHost === 'localhost' ||
      browserHost === '127.0.0.1' ||
      browserHost === '::1';

    if (configuredIsLocalhost && browserHost && !browserIsLocalhost) {
      return '';
    }

    return AI_API_BASE_URL.replace(/\/+$/, '');
  } catch {
    return AI_API_BASE_URL.replace(/\/+$/, '');
  }
};

const API_BASE_URL = resolveApiBaseUrl();
const CHAT_ENDPOINT = API_BASE_URL ? `${API_BASE_URL}/api/chat` : '/api/chat';

function AIChat({ user, userData, isPreview = false }) {
  const defaultAssistantMessage = {
    role: 'assistant',
    text: 'I am HabytARC AI. I can help with habits, routines, streak rescue missions, and the occasional motivational shake-up.'
  };

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [temporaryMode, setTemporaryMode] = useState(false);
  const [normalModeSnapshot, setNormalModeSnapshot] = useState([]);
  const [messages, setMessages] = useState([defaultAssistantMessage]);
  const [activeHabits, setActiveHabits] = useState([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  const getLocalHistoryKey = (uid) => `habytarc_ai_chat_history_${uid}`;
  const getChatResetKey = (uid) => `habytarc_ai_chat_reset_at_${uid}`;

  const getChatResetAt = (uid) => {
    try {
      const raw = localStorage.getItem(getChatResetKey(uid));
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      return 0;
    }
  };

  const setChatResetAt = (uid, timestampMs) => {
    try {
      localStorage.setItem(getChatResetKey(uid), String(timestampMs));
    } catch (error) {
      console.error('Chat reset timestamp save failed:', error);
    }
  };

  const persistLocalHistory = (uid, nextMessages) => {
    if (temporaryMode) return;
    try {
      localStorage.setItem(getLocalHistoryKey(uid), JSON.stringify(nextMessages.slice(-200)));
    } catch (error) {
      console.error('Local history save failed:', error);
    }
  };

  const loadLocalHistory = (uid) => {
    try {
      const raw = localStorage.getItem(getLocalHistoryKey(uid));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item) => item && item.role && item.text);
    } catch (error) {
      console.error('Local history load failed:', error);
      return [];
    }
  };

  const appendMessage = (message) => {
    setMessages((prev) => {
      const next = [...prev, message];
      persistLocalHistory(user.uid, next);
      return next;
    });
  };

  const saveHistoryIfEnabled = async (...chatMessages) => {
    if (temporaryMode) return;
    await Promise.allSettled(chatMessages.map((message) => saveAIChatMessage(user.uid, message)));
  };

  useEffect(() => {
    if (isPreview) {
      setMessages([
        defaultAssistantMessage,
        { role: 'assistant', text: 'Preview mode: I can still talk, but the buttons are on vacation until you log in.' },
        { role: 'user', text: 'Can you help me recover my streak?' },
        { role: 'assistant', text: 'Absolutely. No dramatic comeback arc needed, just one tiny win and we start rebuilding from there.' }
      ]);
      setActiveHabits([
        { id: 'p1', name: 'Morning Walk' },
        { id: 'p2', name: 'Deep Work Sprint' },
        { id: 'p3', name: 'Read 20 mins' }
      ]);
      setCompletedCount(2);
      setPendingCount(1);
      return;
    }

    const loadContext = async () => {
      const [historyResult, habitsResult, trackingResult, pendingResult] = await Promise.allSettled([
        getAIChatHistory(user.uid),
        getUserHabits(user.uid),
        getTrackingForDate(user.uid, getDateString()),
        getPendingTasksUpToDate(user.uid)
      ]);

      if (historyResult.status === 'fulfilled') {
        const resetAt = getChatResetAt(user.uid);
        const filteredHistory = resetAt
          ? historyResult.value.filter((item) => Number(item?.createdAtMs || 0) >= resetAt)
          : historyResult.value;

        if (filteredHistory.length > 0) {
          const cloudHistory = filteredHistory.map((item) => ({ role: item.role, text: item.text, id: item.id }));
          setMessages(cloudHistory);
          persistLocalHistory(user.uid, cloudHistory);
        } else {
          const localHistory = loadLocalHistory(user.uid);
          const fallback = localHistory.length > 0 ? localHistory : [defaultAssistantMessage];
          setMessages(fallback);
          persistLocalHistory(user.uid, fallback);
        }
      } else {
        console.warn('AI history load failed:', historyResult.reason);
        const localHistory = loadLocalHistory(user.uid);
        const fallback = localHistory.length > 0 ? localHistory : [defaultAssistantMessage];
        setMessages(fallback);
      }

      if (habitsResult.status === 'fulfilled') {
        const enabled = habitsResult.value.filter((habit) => habit.enabled !== false);
        setActiveHabits(enabled);

        if (trackingResult.status === 'fulfilled') {
          const todayTracking = trackingResult.value || {};
          const completed = enabled.filter((habit) => todayTracking[habit.id]).length;
          setCompletedCount(completed);
        } else {
          console.warn('AI tracking load failed:', trackingResult.reason);
          setCompletedCount(0);
        }
      } else {
        console.warn('AI habits load failed:', habitsResult.reason);
        setActiveHabits([]);
        setCompletedCount(0);
      }

      if (pendingResult.status === 'fulfilled') {
        setPendingCount(Array.isArray(pendingResult.value) ? pendingResult.value.length : 0);
      } else {
        console.warn('AI pending load failed:', pendingResult.reason);
        setPendingCount(0);
      }
    };

    loadContext();
  }, [isPreview, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const coachContext = useMemo(
    () => ({
      activeHabits,
      completedCount,
      pendingCount,
      name: userData?.name || user?.displayName || 'User'
    }),
    [activeHabits, completedCount, pendingCount, userData?.name, user?.displayName]
  );

  const sendMessage = async (e) => {
    e.preventDefault();
    if (isPreview) {
      alert('Login to continue');
      return;
    }
    const text = input.trim();
    if (!text || sending) return;

    const userMessage = { role: 'user', text };
    const nextMessages = [...messages, userMessage];
    appendMessage(userMessage);
    setInput('');
    setSending(true);

    // Allow direct natural-language habit commands.
    const habitCommand = parseAddHabitCommand(text);
    const deleteCommand = parseDeleteHabitCommand(text);

    if (habitCommand) {
      try {
        await createHabit(user.uid, {
          name: habitCommand.name,
          category: habitCommand.category,
          icon: habitCommand.icon
        });

        const confirmation = {
          role: 'assistant',
          text: `Habit added: "${habitCommand.name}" (${habitCommand.category}).`
        };

        appendMessage(confirmation);
        await saveHistoryIfEnabled(userMessage, confirmation);
      } catch (error) {
        const failure = {
          role: 'assistant',
          text: `I could not add that habit. ${error?.message || 'Please try again.'}`
        };
        appendMessage(failure);
        await saveHistoryIfEnabled(userMessage, failure);
      } finally {
        setSending(false);
      }
      return;
    }

    if (deleteCommand) {
      try {
        const habits = await getUserHabits(user.uid);
        const target = findHabitForDeletion(habits, deleteCommand.name);

        if (!target) {
          const notFound = {
            role: 'assistant',
            text: `I could not find a habit named "${deleteCommand.name}".`
          };
          appendMessage(notFound);
          await saveHistoryIfEnabled(userMessage, notFound);
        } else {
          await deleteHabit(target.id);
          const confirmation = {
            role: 'assistant',
            text: `Habit deleted: "${target.name}".`
          };
          appendMessage(confirmation);
          await saveHistoryIfEnabled(userMessage, confirmation);
        }
      } catch (error) {
        const failure = {
          role: 'assistant',
          text: `I could not delete that habit. ${error?.message || 'Please try again.'}`
        };
        appendMessage(failure);
        await saveHistoryIfEnabled(userMessage, failure);
      } finally {
        setSending(false);
      }
      return;
    }

    try {
      const response = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: nextMessages,
          context: {
            ...coachContext,
            activeHabits: coachContext.activeHabits.length,
            cheatDay: userData?.cheatDay || 'sunday'
          }
        })
      });

      const raw = await response.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = null;
      }

      if (!data) {
        throw new Error(
          'AI server returned non-JSON response. If deployed frontend only, deploy server.mjs and set VITE_AI_API_BASE_URL.'
        );
      }

      if (!response.ok) {
        throw new Error(data?.error || data?.code || 'AI request failed');
      }

      const assistantMessage = { role: 'assistant', text: data.reply };
      appendMessage(assistantMessage);
      await saveHistoryIfEnabled(userMessage, assistantMessage);
    } catch (error) {
      console.error('AI request error:', error);
      const failureMessage = {
        role: 'assistant',
        text: `HabytARC AI error: ${error?.message || 'Gemini service unavailable'}`
      };
      appendMessage(failureMessage);
      await saveHistoryIfEnabled(userMessage, failureMessage);
    } finally {
      setSending(false);
    }
  };

  const startNewChat = async () => {
    if (isPreview) {
      alert('Login to continue');
      return;
    }
    if (sending || clearing) return;
    const shouldClear = window.confirm('Start a new chat? Previous messages will be hidden from now on.');
    if (!shouldClear) return;

    setClearing(true);
    try {
      const resetAt = Date.now();
      setChatResetAt(user.uid, resetAt);
      const fresh = [defaultAssistantMessage];
      setMessages(fresh);
      persistLocalHistory(user.uid, fresh);
      setInput('');
      // Best-effort cloud cleanup (can fail due Firestore rules; chat still resets locally).
      await clearAIChatHistory(user.uid);
    } catch (error) {
      console.warn('Cloud history clear skipped:', error?.message || error);
    } finally {
      setClearing(false);
    }
  };

  const toggleTemporaryMode = () => {
    if (isPreview) {
      alert('Login to continue');
      return;
    }
    if (sending || clearing) return;
    if (!temporaryMode) {
      setNormalModeSnapshot(messages);
      setMessages([defaultAssistantMessage]);
      setInput('');
      setTemporaryMode(true);
      return;
    }

    const restored = normalModeSnapshot.length > 0 ? normalModeSnapshot : [defaultAssistantMessage];
    setMessages(restored);
    setTemporaryMode(false);
    setNormalModeSnapshot([]);
  };

  return (
    <div className="page-container">
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1>HabytARC AI</h1>
            <p className="page-subtitle">Ask for habit help, streak rescue, or a smarter nudge with a little personality</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" className={`btn ${temporaryMode ? 'btn-primary' : 'btn-secondary'}`} onClick={toggleTemporaryMode} disabled={sending || clearing}>
              {temporaryMode ? 'Exit Temp Mode' : 'Temp Mode'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={startNewChat} disabled={sending || clearing || temporaryMode}>
              {clearing ? 'Resetting...' : 'New Chat'}
            </button>
          </div>
        </div>

        {temporaryMode && (
          <div className="chart-container" style={{ marginBottom: '1rem', borderColor: 'var(--primary)' }}>
            <p style={{ color: 'var(--text-secondary)' }}>
              Temporary Mode is on. This chat is not saved to history.
            </p>
          </div>
        )}

        <div className="chart-container" style={{ marginBottom: '1rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>
            Context: {activeHabits.length} active habits, {completedCount} completed today, {pendingCount} pending.
          </p>
        </div>
        
        <div className="chart-container" style={{ minHeight: '320px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
            {messages.map((message, index) => (
              <div
                key={message.id || `${message.role}-${index}`}
                style={{
                  alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  padding: '0.75rem 1rem',
                  borderRadius: '12px',
                  background: message.role === 'user' ? 'var(--primary)' : 'var(--bg-secondary)',
                  color: message.role === 'user' ? '#fff' : 'var(--text-primary)',
                  border: message.role === 'assistant' ? '1px solid var(--border-color)' : 'none'
                }}
              >
                {message.text}
              </div>
            ))}
          </div>

          <form onSubmit={sendMessage} style={{ display: 'flex', gap: '0.75rem' }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={temporaryMode ? 'Ask privately (not saved)...' : 'Ask for habit advice...'}
              className="chat-input"
              disabled={sending}
            />
            <button type="submit" className="btn btn-primary" disabled={sending}>
              {sending ? 'Thinking...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const parseAddHabitCommand = (message) => {
  const raw = String(message || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  if (!(lower.includes('add') || lower.includes('create')) || !lower.includes('habit')) {
    return null;
  }

  const categoryMatch = raw.match(/\b(?:category|in)\s+(work|health|learning|lifestyle|social)\b/i);
  const category = categoryMatch ? capitalize(categoryMatch[1]) : 'Lifestyle';

  const iconMatch = raw.match(/\bicon\s+([^\s]+)/i);
  const icon = iconMatch ? iconMatch[1] : '⭐';

  const primaryPattern = /(?:add|create)(?:\s+a)?\s+habit(?:\s+(?:called|named))?\s+(.+)/i;
  const fallbackPattern = /(?:add|create)\s+(.+?)\s+habit/i;
  const matched = raw.match(primaryPattern) || raw.match(fallbackPattern);
  if (!matched || !matched[1]) return null;

  let name = matched[1]
    .replace(/\b(?:category|in)\s+(work|health|learning|lifestyle|social)\b/gi, '')
    .replace(/\bicon\s+[^\s]+/gi, '')
    .replace(/[.!,;:]+$/g, '')
    .trim();

  if (!name || name.length < 2) return null;
  if (name.length > 60) name = name.slice(0, 60).trim();

  return { name, category, icon };
};

const parseDeleteHabitCommand = (message) => {
  const raw = String(message || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!(lower.includes('delete') || lower.includes('remove')) || !lower.includes('habit')) {
    return null;
  }

  const patternA = /(?:delete|remove)(?:\s+my)?\s+habit(?:\s+(?:called|named))?\s+(.+)/i;
  const patternB = /(?:delete|remove)\s+(.+?)\s+habit/i;
  const matched = raw.match(patternA) || raw.match(patternB);
  if (!matched || !matched[1]) return null;

  const name = matched[1].replace(/[.!,;:]+$/g, '').trim();
  if (!name || name.length < 2) return null;
  return { name };
};

const findHabitForDeletion = (habits, requestedName) => {
  if (!Array.isArray(habits) || !requestedName) return null;
  const target = requestedName.trim().toLowerCase();

  const exact = habits.find((habit) => String(habit.name || '').trim().toLowerCase() === target);
  if (exact) return exact;

  const contains = habits.find((habit) =>
    String(habit.name || '').trim().toLowerCase().includes(target)
  );
  if (contains) return contains;

  return null;
};

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

export default AIChat;
