import React, { useEffect, useMemo, useState } from 'react';
import { clearAIChatHistory, createHabit, deleteHabit, getAIChatHistory, getUserHabits, getTrackingForDate, saveAIChatMessage } from '../utils/firebaseService';
import { getDateString } from '../utils/dateUtils';

const AI_API_BASE_URL = String(import.meta.env.VITE_AI_API_BASE_URL || '').trim();
const CHAT_ENDPOINT = AI_API_BASE_URL
  ? `${AI_API_BASE_URL.replace(/\/+$/, '')}/api/chat`
  : '/api/chat';

function AIChat({ user, userData }) {
  const defaultAssistantMessage = {
    role: 'assistant',
    text: 'I am HabytARC AI. Ask me anything about consistency, routines, or habit design.'
  };

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [temporaryMode, setTemporaryMode] = useState(false);
  const [normalModeSnapshot, setNormalModeSnapshot] = useState([]);
  const [messages, setMessages] = useState([defaultAssistantMessage]);
  const [activeHabits, setActiveHabits] = useState([]);
  const [completedCount, setCompletedCount] = useState(0);

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
    const loadContext = async () => {
      const [historyResult, habitsResult, trackingResult] = await Promise.allSettled([
        getAIChatHistory(user.uid),
        getUserHabits(user.uid),
        getTrackingForDate(user.uid, getDateString())
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
    };

    loadContext();
  }, [user.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const coachContext = useMemo(
    () => ({
      activeHabits,
      completedCount,
      name: userData?.name || user?.displayName || 'User'
    }),
    [activeHabits, completedCount, userData?.name, user?.displayName]
  );

  const sendMessage = async (e) => {
    e.preventDefault();
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
        text: `HabytARC AI error: ${error?.message || 'Service unavailable'}`
      };
      appendMessage(failureMessage);
      await saveHistoryIfEnabled(userMessage, failureMessage);
    } finally {
      setSending(false);
    }
  };

  const startNewChat = async () => {
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
            <p className="page-subtitle">Ask habit questions and get practical guidance</p>
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
            Context: {activeHabits.length} active habits, {completedCount} completed today.
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
