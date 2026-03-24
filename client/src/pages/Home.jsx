import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  completeTodoWithRecurrence,
  consumeStreakInsurance,
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
import { deriveAdaptiveMicroHabit, deriveGamification, deriveHabitRisk, getCurrentWeekKey } from '../utils/habitProgression';
import { sendAppNotification, isNotificationSupported } from '../utils/notificationService';

const GREETING_POOLS = {
  morning: [
    'let’s build momentum 🚀',
    'a fresh start — first win today?',
    'rise and progress ☀️',
    'small steps now, big results later',
    'let’s win the day, one habit at a time'
  ],
  afternoon: [
    'keep the streak alive 🔥',
    'you’re halfway there — don’t slow down',
    'stay consistent, you’re doing great',
    'progress check: how are we doing?',
    'keep pushing, even small efforts count'
  ],
  evening: [
    'time to finish strong 💪',
    'one last push for today',
    'don’t break the chain',
    'almost there — complete your habits',
    'make today count before it ends'
  ],
  night: [
    'reflect. reset. repeat 🌙',
    'great work today — ready for tomorrow?',
    'progress > perfection',
    'you showed up today, that matters',
    'let’s prepare for a better tomorrow'
  ],
  lateNight: [
    'still going? that’s dedication 👀',
    'rest matters too — don’t forget',
    'even discipline needs recovery',
    'late grind or early start? respect either way',
    'recharge — tomorrow is another chance'
  ]
};

const getGreetingByTime = (name, currentTime = new Date(), context = {}) => {
  const hour = currentTime.getHours();
  const safeName = String(name || 'there').trim();
  const firstName = safeName.split(/\s+/)[0] || 'there';
  const { bestStreak = 0, missedYesterday = false } = context;

  if (bestStreak >= 7) {
    return `${firstName}, 🔥 ${bestStreak}-day streak! Don’t break it`;
  }

  if (missedYesterday) {
    return `${firstName}, let’s bounce back today`;
  }

  let bucket = 'night';
  if (hour >= 0 && hour < 5) bucket = 'lateNight';
  else if (hour < 12) bucket = 'morning';
  else if (hour < 17) bucket = 'afternoon';
  else if (hour < 21) bucket = 'evening';

  const pool = GREETING_POOLS[bucket];
  const rotationSeed = Number(getDateString(currentTime).replaceAll('-', '')) + hour;
  const message = pool[rotationSeed % pool.length];
  return `${firstName}, ${message}`;
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
  const [todoDayKey, setTodoDayKey] = useState(() => getDateString());
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [insuranceLoading, setInsuranceLoading] = useState('');
  const [insuranceWeekUsed, setInsuranceWeekUsed] = useState(() => String(userData?.streakInsuranceWeek || ''));

  const today = getDateString();

  useEffect(() => {
    setInsuranceWeekUsed(String(userData?.streakInsuranceWeek || ''));
  }, [userData?.streakInsuranceWeek]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const next = getDateString();
      setCurrentTime(now);
      setTodoDayKey((prev) => (prev === next ? prev : next));
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

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

  const completeMicroHabit = async (habit) => {
    if (isPreview) {
      alert('Login to continue');
      return;
    }
    const previousStatus = todayStatus[habit.id] || 'pending';
    setTodayTracking((prev) => ({ ...prev, [habit.id]: true }));
    setTodayStatus((prev) => ({ ...prev, [habit.id]: 'completed' }));
    try {
      await saveTracking(user.uid, today, habit.id, true);
    } catch (error) {
      console.error('Micro-habit completion failed:', error);
      alert('Failed to complete micro-habit.');
      setTodayTracking((prev) => ({ ...prev, [habit.id]: false }));
      setTodayStatus((prev) => ({ ...prev, [habit.id]: previousStatus }));
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

  const useStreakInsurance = async (habit) => {
    if (isPreview) {
      alert('Login to continue');
      return;
    }
    const currentWeekKey = getCurrentWeekKey();
    if (insuranceWeekUsed === currentWeekKey) return;

    const loadingKey = `insurance-${habit.id}`;
    setInsuranceLoading(loadingKey);
    setTodayTracking((prev) => ({ ...prev, [habit.id]: true }));
    setTodayStatus((prev) => ({ ...prev, [habit.id]: 'completed' }));

    try {
      await Promise.all([
        saveTracking(user.uid, today, habit.id, true),
        consumeStreakInsurance(user.uid, currentWeekKey, habit.id)
      ]);
      setInsuranceWeekUsed(currentWeekKey);
    } catch (error) {
      console.error('Streak insurance failed:', error);
      alert('Failed to use streak insurance.');
      setTodayTracking((prev) => ({ ...prev, [habit.id]: false }));
      setTodayStatus((prev) => ({ ...prev, [habit.id]: 'pending' }));
    } finally {
      setInsuranceLoading('');
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

  const missedYesterday = useMemo(() => {
    if (!Array.isArray(habits) || habits.length === 0) return false;
    const yesterday = new Date(currentTime);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = getDateString(yesterday);
    const yesterdayTracking = trackingHistory[yesterdayKey] || {};
    return habits.every((habit) => !yesterdayTracking[habit.id]);
  }, [currentTime, habits, trackingHistory]);

  const visibleHabits = useMemo(() => {
    return habits.filter((habit) => {
      const status = String(todayStatus[habit.id] || '').toLowerCase();
      if (status === 'completed' || status === 'skipped' || status === 'rescheduled') return false;
      if (todayTracking[habit.id]) return false;
      return true;
    });
  }, [habits, todayStatus, todayTracking]);

  const visibleHabitsWithSignals = useMemo(
    () =>
      visibleHabits.map((habit) => ({
        habit,
        microHabit: deriveAdaptiveMicroHabit(habit, trackingWithToday),
        habitRisk: deriveHabitRisk({ habit, trackingHistory: trackingWithToday, streakMap })
      })),
    [visibleHabits, trackingWithToday, streakMap]
  );

  const progress = habits.length > 0 ? getTodayProgress(habits, todayTracking) : 0;
  const completedCount = habits.filter(habit => todayTracking[habit.id]).length;
  const greeting = getGreetingByTime(userData?.name || user?.displayName, currentTime, {
    bestStreak,
    missedYesterday
  });
  const openTodoItems = useMemo(
    () => todos.filter((item) => !item.completed),
    [todos]
  );
  const gamification = deriveGamification({
    habits,
    trackingHistory,
    todayTracking,
    todayStatus,
    streakMap
  });
  const streakInsuranceUsed = insuranceWeekUsed === getCurrentWeekKey();

  useEffect(() => {
    if (isPreview) return;
    if (!isNotificationSupported()) return;
    if (Notification.permission !== 'granted') return;
    if (!Array.isArray(visibleHabits) || visibleHabits.length === 0) return;

    const now = new Date();
    const currentHour = now.getHours();
    if (currentHour < 18) return;

    const todayKey = getDateString(now);
    const stampKey = `habytarc_streak_warning_${user?.uid}_${todayKey}`;
    if (localStorage.getItem(stampKey)) return;

    const atRiskHabit = visibleHabits.find((habit) => deriveHabitRisk({ habit, trackingHistory: trackingWithToday, streakMap }) === 'high');
    if (!atRiskHabit) return;

    const micro = deriveAdaptiveMicroHabit(atRiskHabit, trackingWithToday);
    localStorage.setItem(stampKey, '1');
    try {
      sendAppNotification('HabytARC Streak Warning', {
        body: `Protect "${atRiskHabit.name}" with the tiny version: ${micro.label}.`,
        tag: `streak_warning_${todayKey}`
      });
    } catch (error) {
      console.error('Streak warning notification failed:', error);
    }
  }, [isPreview, streakMap, trackingWithToday, user?.uid, visibleHabits]);

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
                <span>Stay with today&apos;s habits and keep the momentum clean.</span>
              )}
            </p>
          </div>
        </div>

        {!isCheat && habits.length > 0 && (
          <div className="progress-summary">
            <div className="progress-info">
              <h2>{completedCount} of {habits.length} completed</h2>
              <p>
                {visibleHabits.length} remaining • Best streak {bestStreak} day{bestStreak === 1 ? '' : 's'} • XP {gamification.xp} • {gamification.levelName}
              </p>
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

        {openTodoItems.length > 0 && (
          <div className="chart-container home-section">
            <div className="home-section-header home-section-header-wrap">
              <div>
                <h3>Open To-Dos</h3>
                <p className="page-subtitle">A quick glance so nothing important slips away.</p>
              </div>
              <Link to="/habytarc/todo" className="btn btn-secondary home-link-btn">
                Open To-Do
              </Link>
            </div>
            <div className="home-list-stack">
              {openTodoItems.slice(0, 4).map((todoItem) => (
                <div key={todoItem.id} className="todo-snapshot-item">
                  <div>
                    <strong>{todoItem.text}</strong>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginTop: '0.2rem' }}>
                      {String(todoItem.priority || 'medium').toUpperCase()}
                      {todoItem.dueDate ? ` • Due ${todoItem.dueDate}` : ''}
                    </div>
                  </div>
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
          </div>
        )}

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
                  <Link to="/habytarc/habits" className="btn btn-primary" style={{ marginTop: '1rem', textDecoration: 'none' }}>
                    Add Your First Habit
                  </Link>
                </div>
              ) : visibleHabits.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">✅</div>
                  <h3>All set for today</h3>
                  <p>Completed, skipped, and moved habits are hidden from the Home list.</p>
                </div>
              ) : (
                visibleHabitsWithSignals.map(({ habit, microHabit, habitRisk }) => (
                  <div
                    key={habit.id}
                    className={`habit-item ${todayTracking[habit.id] ? 'completed' : ''}`}
                  >
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
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.2rem' }}>
                          Tiny version: {microHabit.label}
                          {microHabit.adjusted ? ' • Auto-adjusted for consistency' : ''}
                          {habitRisk === 'high' ? ' • At risk today' : habitRisk === 'medium' ? ' • Needs attention' : ''}
                        </div>
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
                        onClick={() => completeMicroHabit(habit)}
                      >
                        Tiny Win
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
                      {!streakInsuranceUsed && (streakMap[habit.id] || 0) > 0 && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => useStreakInsurance(habit)}
                          disabled={insuranceLoading === `insurance-${habit.id}`}
                        >
                          Save Streak
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Home;
