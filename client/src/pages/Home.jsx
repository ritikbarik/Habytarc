import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  completeTodoWithRecurrence,
  subscribeToHabits,
  subscribeToTodos,
  updateTodo,
  getTrackingDocForDate,
  getTrackingHistory,
  saveTracking,
  setHabitDayStatus,
  upsertPendingTask,
  getPendingTasksUpToDate,
  resolvePendingTask
} from '../utils/firebaseService';
import { isCheatDay, getDateAfterDays, getDateString, getNextWeekdayDate, getTodayProgress, getHabitStreakMap } from '../utils/dateUtils';
import { getWeatherFallbackSnapshot, isSevereWeatherCode } from '../utils/weatherService';
import { sendAppNotification, isNotificationSupported } from '../utils/notificationService';

const refreshQuotes = [
  'You do not rise to the level of your goals. You fall to the level of your systems.',
  'Every action you take is a vote for the type of person you wish to become.',
  'Success is the product of daily habits, not once-in-a-lifetime transformations.',
  'Habits are the compound interest of self-improvement.',
  'You should be far more concerned with your current trajectory than with your current results.',
  'Make it obvious. Make it attractive. Make it easy. Make it satisfying.',
  'Professionals stick to the schedule; amateurs let life get in the way.',
  'The purpose of setting goals is to win the game. The purpose of building systems is to continue playing.'
];

const getGreetingByTime = (name) => {
  const hour = new Date().getHours();
  const safeName = name || 'there';

  if (hour < 12) return `Good morning, ${safeName}`;
  if (hour < 17) return `Good afternoon, ${safeName}`;
  return `Good evening, ${safeName}`;
};

const getRefreshQuote = () => {
  const index = Math.floor(Math.random() * refreshQuotes.length);
  return refreshQuotes[index];
};

const formatClockValue = (date, timezone) => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: timezone || undefined
    }).format(date);
  } catch (_) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  }
};

const formatDateValue = (date, timezone) => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: timezone || undefined
    }).format(date);
  } catch (_) {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
};

const getWeatherInsight = (weatherInfo, pendingHabits, openTodos) => {
  if (!weatherInfo || Number.isNaN(Number(weatherInfo.temperatureC))) return '';

  const wind = Number(weatherInfo.windSpeedKmh || 0);
  const rain = Number(weatherInfo.precipitationMm || 0);
  const temp = Number(weatherInfo.temperatureC || 0);

  let conditionText = 'Weather looks steady outside';
  if (wind >= 20) conditionText = 'Feels windy outside';
  else if (rain >= 0.5) conditionText = "It's a bit rainy outside";
  else if (temp >= 32) conditionText = "It's quite warm outside";
  else if (temp <= 15) conditionText = "It's a bit cool outside";

  if (pendingHabits > 0) {
    return `${conditionText}, but you still have ${pendingHabits} habit${pendingHabits === 1 ? '' : 's'} pending.`;
  }
  if (openTodos > 0) {
    return `${conditionText}, and you have ${openTodos} open to-do${openTodos === 1 ? '' : 's'}.`;
  }
  return `${conditionText}, and you're clear on today's tasks.`;
};

const previewHabits = [
  { id: 'p1', name: 'Morning Walk', category: 'Health', icon: '🚶' },
  { id: 'p2', name: 'Deep Work Sprint', category: 'Work', icon: '💻' },
  { id: 'p3', name: 'Read 20 mins', category: 'Learning', icon: '📚' },
  { id: 'p4', name: 'Journal', category: 'Lifestyle', icon: '📝' }
];

const previewTodos = [
  { id: 'td1', text: 'Prepare task priority list', completed: false, createdAtMs: Date.now() - 10000 },
  { id: 'td2', text: 'Review yesterday progress', completed: false, createdAtMs: Date.now() - 20000 }
];

function Home({ user, userData, isPreview = false }) {
  const [habits, setHabits] = useState([]);
  const [todos, setTodos] = useState([]);
  const [todayTracking, setTodayTracking] = useState({});
  const [todayStatus, setTodayStatus] = useState({});
  const [pendingTasks, setPendingTasks] = useState([]);
  const [trackingHistory, setTrackingHistory] = useState({});
  const [isCheat, setIsCheat] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [quote] = useState(() => getRefreshQuote());
  const [todoDayKey, setTodoDayKey] = useState(() => getDateString());
  const [weatherInfo, setWeatherInfo] = useState({
    loading: false,
    error: '',
    ...getWeatherFallbackSnapshot()
  });
  const [clockNow, setClockNow] = useState(() => new Date());

  const today = getDateString();

  useEffect(() => {
    const timer = setInterval(() => {
      const next = getDateString();
      setTodoDayKey((prev) => (prev === next ? prev : next));
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setWeatherInfo((prev) => ({
      ...prev,
      ...getWeatherFallbackSnapshot(),
      loading: false,
      error: ''
    }));
  }, []);

  useEffect(() => {
    const apiTimeMs = Date.parse(String(weatherInfo.currentTimeIso || ''));
    if (Number.isNaN(apiTimeMs)) {
      const fallbackId = setInterval(() => setClockNow(new Date()), 1000);
      setClockNow(new Date());
      return () => clearInterval(fallbackId);
    }

    const startedAt = Date.now();
    const tick = () => {
      const delta = Date.now() - startedAt;
      setClockNow(new Date(apiTimeMs + delta));
    };
    tick();
    const timerId = setInterval(tick, 1000);
    return () => clearInterval(timerId);
  }, [weatherInfo.currentTimeIso]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (!weatherInfo.currentTimeIso || Number.isNaN(Number(weatherInfo.weatherCode))) return;
    if (!isSevereWeatherCode(weatherInfo.weatherCode)) return;

    const dayKey = getDateString(new Date());
    const alertStamp = `habytarc_weather_alert_${dayKey}`;
    if (localStorage.getItem(alertStamp)) return;

    const notify = () => {
      if (Notification.permission !== 'granted') return;
      localStorage.setItem(alertStamp, '1');
      try {
        sendAppNotification('HabytARC Weather Alert', {
          body: `${weatherInfo.weatherLabel} in ${weatherInfo.cityLabel || 'your area'}. Plan your tasks accordingly.`,
          tag: `weather_alert_${dayKey}`
        });
      } catch (error) {
        console.error('Weather alert notification failed:', error);
      }
    };

    if (Notification.permission === 'granted') {
      notify();
      return;
    }
  }, [weatherInfo.currentTimeIso, weatherInfo.weatherCode, weatherInfo.weatherLabel, weatherInfo.cityLabel]);

  useEffect(() => {
    if (isPreview) {
      const todayKey = getDateString();
      setHabits(previewHabits);
      setTodayTracking({ p1: true, p2: true, p3: false, p4: false });
      setTodayStatus({ p1: 'completed', p2: 'completed', p3: 'pending', p4: 'pending' });
      setTrackingHistory({
        [todayKey]: { p1: true, p2: true, p3: false, p4: false }
      });
      setPendingTasks([
        { id: 'pt-1', habitId: 'p3', habitName: 'Read 20 mins', sourceDate: todayKey, dueDate: getDateAfterDays(1), status: 'pending' }
      ]);
      setTodos(previewTodos);
      setIsCheat(false);
      setLoading(false);
      return;
    }

    let unsubscribe = null;
    let unsubscribeTodos = null;

    const loadData = async () => {
      try {
        // Subscribe to habits (real-time)
        unsubscribe = subscribeToHabits(user.uid, (fetchedHabits) => {
          const enabledHabits = fetchedHabits.filter(h => h.enabled !== false);
          setHabits(enabledHabits);
          setLoading(false);
        });
        unsubscribeTodos = subscribeToTodos(user.uid, (fetchedTodos) => {
          setTodos(fetchedTodos);
        }, todoDayKey);

        // Load today's tracking
        const [trackingDoc, pending] = await Promise.all([
          getTrackingDocForDate(user.uid, today),
          getPendingTasksUpToDate(user.uid)
        ]);
        setTodayTracking(trackingDoc.habits || {});
        setTodayStatus(trackingDoc.dayStatus || {});
        setPendingTasks(pending);
        const history = await getTrackingHistory(user.uid);
        setTrackingHistory(history);

        // Check cheat day
        const cheat = userData?.cheatDay ? isCheatDay(userData.cheatDay) : false;
        setIsCheat(cheat);
      } catch (error) {
        console.error('Error loading data:', error);
        setLoading(false);
      }
    };

    loadData();

    return () => {
      if (unsubscribe) unsubscribe();
      if (unsubscribeTodos) unsubscribeTodos();
    };
  }, [isPreview, user?.uid, userData?.cheatDay, todoDayKey]);

  useEffect(() => {
    if (isPreview) return;
    if (!isNotificationSupported()) return;
    if (!Array.isArray(habits) || habits.length === 0) return;

    const runReminderCheck = () => {
      if (Notification.permission !== 'granted') return;
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const current = `${hh}:${mm}`;
      const dayKey = getDateString(now);

      habits.forEach((habit) => {
        const reminderTime = String(habit.reminderTime || '');
        if (!habit.reminderEnabled || !reminderTime || reminderTime > current) return;
        const stampKey = `habytarc_reminder_${user?.uid}_${habit.id}_${dayKey}`;
        if (localStorage.getItem(stampKey)) return;
        localStorage.setItem(stampKey, '1');
        try {
          sendAppNotification('HabytARC Reminder', {
            body: `Time for "${habit.name}"`,
            tag: `habit_${habit.id}_${dayKey}`
          });
        } catch (error) {
          console.error('Reminder notification failed:', error);
        }
      });
    };

    runReminderCheck();
    const timer = setInterval(runReminderCheck, 30 * 1000);

    return () => clearInterval(timer);
  }, [habits, isPreview, user?.uid]);

  useEffect(() => {
    if (isPreview) return;
    if (!userData?.todoReminderEnabled) return;
    if (!isNotificationSupported()) return;

    const openItems = Array.isArray(todos) ? todos.filter((todo) => !todo.completed) : [];
    if (openItems.length === 0) return;

    const todayKey = getDateString();
    const overdue = openItems.filter((todo) => {
      const due = String(todo?.dueDate || '');
      return due && due < todayKey;
    }).length;
    const dueToday = openItems.filter((todo) => String(todo?.dueDate || '') === todayKey).length;
    if (overdue === 0 && dueToday === 0) return;

    const sendDigest = () => {
      const digestKey = `habytarc_todo_digest_${user?.uid}_${todayKey}`;
      if (localStorage.getItem(digestKey)) return;
      localStorage.setItem(digestKey, '1');

      const chunks = [];
      if (overdue > 0) chunks.push(`${overdue} overdue`);
      if (dueToday > 0) chunks.push(`${dueToday} due today`);
      const body = `${chunks.join(' • ')}. Open the To-Do page to review tasks.`;

      try {
        sendAppNotification('HabytARC To-Do Reminder', { body, tag: `todo_digest_${todayKey}` });
      } catch (error) {
        console.error('To-do digest notification failed:', error);
      }
    };

    if (Notification.permission === 'granted') {
      sendDigest();
      return;
    }
    if (Notification.permission !== 'granted') return;

    sendDigest();
  }, [isPreview, todos, user?.uid, userData?.todoReminderEnabled]);

  useEffect(() => {
    if (isPreview) return;
    if (!userData?.todoReminderEnabled) return;
    if (!isNotificationSupported()) return;
    const openItems = Array.isArray(todos) ? todos.filter((todo) => !todo.completed) : [];
    const todayKey = getDateString();
    const reminderItems = openItems.filter((todo) => {
      if (!todo?.reminderEnabled || !todo?.reminderTime) return false;
      const dueDate = String(todo?.dueDate || todayKey);
      return dueDate === todayKey;
    });
    if (reminderItems.length === 0) return;

    const disableReminder = async (todoItem, dayKey) => {
      const offStamp = `habytarc_todo_item_reminder_off_${user?.uid}_${todoItem.id}_${dayKey}`;
      if (localStorage.getItem(offStamp)) return;
      localStorage.setItem(offStamp, '1');
      try {
        await updateTodo(user.uid, todoItem.id, { reminderEnabled: false, reminderTime: '' });
      } catch (error) {
        console.error('Failed to auto-disable task reminder:', error);
      }
    };

    const processTodoReminders = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const current = `${hh}:${mm}`;
      const dayKey = getDateString(now);

      reminderItems.forEach(async (todoItem) => {
        const reminderTime = String(todoItem.reminderTime || '');
        if (!reminderTime) return;

        if (reminderTime > current) return;

        const stampKey = `habytarc_todo_item_reminder_${user?.uid}_${todoItem.id}_${dayKey}`;
        if (reminderTime === current && Notification.permission === 'granted' && !localStorage.getItem(stampKey)) {
          localStorage.setItem(stampKey, '1');
          try {
            sendAppNotification('HabytARC Task Reminder', {
              body: todoItem.text ? `Time for: ${todoItem.text}` : 'You have a scheduled to-do reminder.',
              tag: `todo_item_${todoItem.id}_${dayKey}`
            });
          } catch (error) {
            console.error('To-do item reminder failed:', error);
          }
        }

        await disableReminder(todoItem, dayKey);
      });
    };

    processTodoReminders();
    const timer = setInterval(processTodoReminders, 30 * 1000);

    return () => clearInterval(timer);
  }, [isPreview, todos, user?.uid, userData?.todoReminderEnabled]);

  const toggleHabit = async (habitId) => {
    if (isPreview) {
      alert('Login to continue');
      return;
    }
    if (isCheat) return;
    const newValue = !todayTracking[habitId];
    const previousStatus = todayStatus[habitId] || 'pending';

    // Optimistic update
    setTodayTracking(prev => ({ ...prev, [habitId]: newValue }));
    setTodayStatus((prev) => ({ ...prev, [habitId]: newValue ? 'completed' : 'pending' }));

    try {
      await saveTracking(user.uid, today, habitId, newValue);
    } catch (err) {
      console.error('Error saving:', err);
      const code = err?.code ? ` (${err.code})` : '';
      alert(`Failed to update habit${code}. Check Firestore rules and try again.`);
      // Revert on error
      setTodayTracking(prev => ({ ...prev, [habitId]: !newValue }));
      setTodayStatus((prev) => ({ ...prev, [habitId]: previousStatus }));
    }
  };

  const skipHabitForToday = async (habit) => {
    if (isPreview) {
      alert('Login to continue');
      return;
    }
    const loadingKey = `skip-${habit.id}`;
    setActionLoading(loadingKey);
    setTodayTracking((prev) => ({ ...prev, [habit.id]: false }));
    setTodayStatus((prev) => ({ ...prev, [habit.id]: 'skipped' }));

    try {
      await setHabitDayStatus(user.uid, today, habit.id, 'skipped');
    } catch (err) {
      console.error('Skip failed:', err);
      alert('Failed to skip this habit for today.');
    } finally {
      setActionLoading('');
    }
  };

  const moveHabit = async (habit, targetDate) => {
    if (isPreview) {
      alert('Login to continue');
      return;
    }
    const loadingKey = `move-${habit.id}`;
    setActionLoading(loadingKey);
    setTodayTracking((prev) => ({ ...prev, [habit.id]: false }));
    setTodayStatus((prev) => ({ ...prev, [habit.id]: 'rescheduled' }));

    try {
      await Promise.all([
        setHabitDayStatus(user.uid, today, habit.id, 'rescheduled'),
        upsertPendingTask(user.uid, today, {
          habitId: habit.id,
          habitName: habit.name,
          dueDate: targetDate
        })
      ]);
      const refreshed = await getPendingTasksUpToDate(user.uid);
      setPendingTasks(refreshed);
    } catch (err) {
      console.error('Reschedule failed:', err);
      alert('Failed to reschedule this habit.');
    } finally {
      setActionLoading('');
    }
  };

  const resolveTask = async (task, nextStatus) => {
    if (isPreview) {
      alert('Login to continue');
      return;
    }
    const loadingKey = `pending-${task.id}-${nextStatus}`;
    setActionLoading(loadingKey);
    try {
      await resolvePendingTask(user.uid, task.sourceDate, task.id, nextStatus);
      setPendingTasks((prev) => prev.filter((item) => item.id !== task.id));
    } catch (err) {
      console.error('Pending task update failed:', err);
      alert('Failed to update pending task.');
    } finally {
      setActionLoading('');
    }
  };

  const completeTodo = async (todoItem) => {
    if (isPreview) {
      alert('Login to continue');
      return;
    }
    try {
      await completeTodoWithRecurrence(user.uid, todoItem.id);
    } catch (error) {
      console.error('Failed to complete todo:', error);
      alert('Failed to complete to-do.');
    }
  };

  const trackingWithToday = useMemo(() => ({
    ...trackingHistory,
    [today]: {
      ...(trackingHistory[today] || {}),
      ...todayTracking
    }
  }), [trackingHistory, todayTracking, today]);

  const streakMap = useMemo(
    () => getHabitStreakMap(habits, trackingWithToday, userData?.cheatDay || 'sunday'),
    [habits, trackingWithToday, userData?.cheatDay]
  );

  const bestStreak = useMemo(
    () => Object.values(streakMap).reduce((max, value) => Math.max(max, value), 0),
    [streakMap]
  );

  const visibleHabits = useMemo(() => {
    return habits.filter((habit) => {
      const status = String(todayStatus[habit.id] || '').toLowerCase();
      if (status === 'completed' || status === 'skipped' || status === 'rescheduled') return false;
      if (todayTracking[habit.id]) return false;
      return true;
    });
  }, [habits, todayStatus, todayTracking]);

  const progress = habits.length > 0 ? getTodayProgress(habits, todayTracking) : 0;
  const completedCount = habits.filter(habit => todayTracking[habit.id]).length;
  const pendingCount = pendingTasks.length;
  const openTodos = todos.filter((item) => !item.completed).length;
  const openTodoItems = useMemo(() => todos.filter((item) => !item.completed), [todos]);
  const greeting = getGreetingByTime(userData?.name || user?.displayName);
  const pendingHabitsCount = visibleHabits.length;
  const weatherInsight = getWeatherInsight(weatherInfo, pendingHabitsCount, openTodos);
  const weatherTimeText = formatClockValue(clockNow, weatherInfo.timezone);
  const weatherDateText = formatDateValue(clockNow, weatherInfo.timezone);
  const prioritizeTodo = !isCheat && visibleHabits.length === 0 && openTodoItems.length > 0;

  const todoSection = (
    <div className="chart-container home-section">
      <div className="home-section-header home-section-header-wrap">
        <h3>To-Do Snapshot ({openTodos} open)</h3>
        <Link to="/todo" className="btn btn-secondary home-link-btn">
          Open To-Do
        </Link>
      </div>
      {openTodoItems.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>No to-do tasks yet.</p>
      ) : (
        <div className="home-list-stack">
          {openTodoItems.slice(0, 5).map((todoItem) => (
            <div
              key={todoItem.id}
              className="todo-snapshot-item"
            >
              <span>{todoItem.text}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                {String(todoItem.priority || 'medium').toUpperCase()}
                {todoItem.dueDate ? ` • Due ${todoItem.dueDate}` : ''}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => completeTodo(todoItem)}
              >
                Done
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-content">
          <div className="loading-screen">
            <div className="loading-spinner"></div>
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Loading your habits...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1>{greeting} 👋</h1>
            <p className="page-subtitle">
              {isCheat ? (
                <span className="cheat-day-badge">🎉 Cheat Day - Rest & Recharge</span>
              ) : (
                <span>
                  {weatherDateText} • {weatherTimeText}
                  {weatherInsight ? ` • ${weatherInsight}` : ''}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="home-quote">
          <p>
            "{quote}"
          </p>
        </div>

        {!isCheat && habits.length > 0 && (
          <div className="progress-summary">
            <div className="progress-info">
              <h2>{completedCount} of {habits.length} completed</h2>
              <p>{visibleHabits.length} remaining • {pendingCount} pending carry-overs • {openTodos} open to-do(s) • Best streak: {bestStreak} day{bestStreak === 1 ? '' : 's'}</p>
            </div>
            <div className="progress-circle">
              <svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" className="progress-bg" />
                <circle 
                  cx="50" 
                  cy="50" 
                  r="45" 
                  className="progress-fill"
                  style={{
                    strokeDasharray: `${progress * 2.827} 282.7`,
                    transform: 'rotate(-90deg)',
                    transformOrigin: '50% 50%'
                  }}
                />
                <text x="50" y="50" className="progress-text">{Math.round(progress)}%</text>
              </svg>
            </div>
          </div>
        )}

        {prioritizeTodo && todoSection}

        {isCheat ? (
          <div className="cheat-day-message">
            <div className="cheat-day-icon">🌴</div>
            <h2>Rest Day</h2>
            <p>Your streaks are safe. Relax!</p>
          </div>
        ) : (
          <div className="chart-container home-section">
            <div className="home-section-header">
              <h3>Habits for Today</h3>
            </div>
            <div className="habits-list">
              {habits.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📋</div>
                  <h3>No habits yet</h3>
                  <p>Add habits from the Habits page to get started</p>
                  <a href="/habits" className="btn btn-primary" style={{ marginTop: '1rem', textDecoration: 'none' }}>
                    Add Your First Habit
                  </a>
                </div>
              ) : visibleHabits.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">✅</div>
                  <h3>All set for today</h3>
                  <p>Completed, skipped, and moved habits are hidden from the Home list.</p>
                </div>
              ) : (
                visibleHabits.map((habit) => (
                  <div
                    key={habit.id}
                    className={`habit-item ${todayTracking[habit.id] ? 'completed' : ''}`}
                  >
                    <div className="habit-checkbox">
                      {todayTracking[habit.id] && <span className="checkmark">✓</span>}
                    </div>
                    <div className="habit-content">
                      <div className="habit-icon">{habit.icon}</div>
                      <div className="habit-details">
                        <h3>{habit.name}</h3>
                        <span className="habit-category">
                          {habit.category}
                          {` • Streak ${streakMap[habit.id] || 0}d`}
                          {todayStatus[habit.id] === 'skipped' ? ' • Skipped today' : ''}
                          {todayStatus[habit.id] === 'rescheduled' ? ' • Moved to pending' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="habit-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => toggleHabit(habit.id)}
                        disabled={isCheat}
                      >
                        {todayTracking[habit.id] ? 'Undo' : 'Done'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => skipHabitForToday(habit)}
                        disabled={actionLoading === `skip-${habit.id}`}
                      >
                        Skip Today
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => moveHabit(habit, getDateAfterDays(1))}
                        disabled={actionLoading === `move-${habit.id}`}
                      >
                        Tomorrow
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => moveHabit(habit, getNextWeekdayDate(userData?.cheatDay || 'sunday'))}
                        disabled={actionLoading === `move-${habit.id}`}
                      >
                        Cheat Day
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {!prioritizeTodo && todoSection}

        {pendingTasks.length > 0 && (
          <div className="chart-container home-section">
            <h3 style={{ marginBottom: '0.75rem' }}>Pending Work ({pendingTasks.length})</h3>
            <div className="home-list-stack">
              {pendingTasks.map((task) => (
                <div
                  key={task.id}
                  className="pending-item"
                >
                  <div>
                    <strong>{task.habitName}</strong>
                    <div className="pending-meta-row">
                      <span className="pending-chip pending-chip-source">From {task.sourceDate}</span>
                      <span className="pending-arrow">→</span>
                      <span className="pending-chip pending-chip-due">Due {task.dueDate}</span>
                    </div>
                  </div>
                  <div className="pending-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => resolveTask(task, 'done')}
                      disabled={actionLoading === `pending-${task.id}-done`}
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => resolveTask(task, 'skipped')}
                      disabled={actionLoading === `pending-${task.id}-skipped`}
                    >
                      Skip
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <Link to="/chat" className="home-ai-fab" aria-label="Open HabytARC AI">
        AI
      </Link>
    </div>
  );
}

export default Home;
