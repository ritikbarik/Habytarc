import { getDateString } from './dateUtils';

const LEVELS = [
  { name: 'Beginner', minXp: 0 },
  { name: 'Steady Starter', minXp: 120 },
  { name: 'Rhythm Builder', minXp: 280 },
  { name: 'Momentum Keeper', minXp: 520 },
  { name: 'Consistency Crafter', minXp: 900 },
  { name: 'Discipline Master', minXp: 1400 }
];

export const MOOD_OPTIONS = [
  { value: 'great', label: 'Great', score: 5, emoji: '😄' },
  { value: 'good', label: 'Good', score: 4, emoji: '🙂' },
  { value: 'okay', label: 'Okay', score: 3, emoji: '😐' },
  { value: 'low', label: 'Low', score: 2, emoji: '😕' },
  { value: 'rough', label: 'Rough', score: 1, emoji: '😣' }
];

const DAY_MS = 24 * 60 * 60 * 1000;

const normalizeDateKey = (value) => {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
};

const toDate = (value) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isTrackedComplete = (entry = {}, habitId) => {
  if (!entry || !habitId) return false;
  if (entry.habits && typeof entry.habits === 'object') {
    return Boolean(entry.habits[habitId]);
  }
  return Boolean(entry[habitId]);
};

const getHabitStatus = (entry = {}, habitId) => {
  if (!entry || !habitId) return 'pending';
  return String(entry.dayStatus?.[habitId] || '').toLowerCase() || (isTrackedComplete(entry, habitId) ? 'completed' : 'pending');
};

export const getCurrentWeekKey = (date = new Date()) => {
  const current = new Date(date);
  const weekday = current.getDay();
  const diff = current.getDate() - weekday;
  const sunday = new Date(current.setDate(diff));
  return getDateString(sunday);
};

export const deriveGamification = ({ habits = [], trackingHistory = {}, todayTracking = {}, todayStatus = {}, streakMap = {} }) => {
  const trackingEntries = Object.entries(trackingHistory || {});
  const completedEntries = trackingEntries.reduce((sum, [, record]) => {
    const source = record?.habits && typeof record.habits === 'object' ? record.habits : record;
    return sum + Object.values(source || {}).filter(Boolean).length;
  }, 0);
  const todayCompleted = Object.values(todayTracking || {}).filter(Boolean).length;
  const totalCompleted = Math.max(completedEntries, todayCompleted);
  const activeHabits = habits.filter((habit) => habit.enabled !== false).length;
  const bestStreak = Object.values(streakMap || {}).reduce((max, value) => Math.max(max, Number(value || 0)), 0);
  const streakBonus = Object.values(streakMap || {}).reduce((sum, value) => sum + Math.min(Number(value || 0), 14), 0);
  const xp = totalCompleted * 12 + activeHabits * 8 + streakBonus * 3;

  let level = LEVELS[0];
  let nextLevel = null;
  LEVELS.forEach((candidate, index) => {
    if (xp >= candidate.minXp) {
      level = candidate;
      nextLevel = LEVELS[index + 1] || null;
    }
  });

  const achievements = [];
  if (totalCompleted >= 10) achievements.push({ id: 'ten-completions', label: 'First 10 Completions' });
  if (bestStreak >= 3) achievements.push({ id: 'streak-3', label: '3 Day Streak' });
  if (bestStreak >= 7) achievements.push({ id: 'streak-7', label: '7 Day Streak' });
  if (activeHabits >= 5) achievements.push({ id: 'five-habits', label: 'Routine Builder' });

  const todayStatuses = Object.values(todayStatus || {}).map((value) => String(value || '').toLowerCase());
  const needsRescue = todayStatuses.includes('pending') || todayStatuses.includes('skipped') || todayStatuses.includes('rescheduled');

  return {
    xp,
    levelName: level.name,
    levelFloor: level.minXp,
    nextLevelName: nextLevel?.name || null,
    nextLevelXp: nextLevel?.minXp || null,
    levelProgressPercent: nextLevel
      ? Math.max(0, Math.min(100, Math.round(((xp - level.minXp) / (nextLevel.minXp - level.minXp)) * 100)))
      : 100,
    bestStreak,
    achievements,
    needsRescue
  };
};

export const deriveWeeklyConsistency = ({ habits = [], trackingHistory = {}, cheatDay = 'sunday', rangeDays = 7 }) => {
  const enabledHabits = habits.filter((habit) => habit.enabled !== false);
  if (enabledHabits.length === 0) return 0;

  const cheatIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(String(cheatDay || 'sunday').toLowerCase());
  let completed = 0;
  let opportunities = 0;

  for (let offset = 0; offset < rangeDays; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    if (cheatIndex === date.getDay()) continue;
    const key = getDateString(date);
    const record = trackingHistory[key] || {};
    enabledHabits.forEach((habit) => {
      opportunities += 1;
      if (isTrackedComplete(record, habit.id)) completed += 1;
    });
  }

  return opportunities > 0 ? Math.round((completed / opportunities) * 100) : 0;
};

export const deriveBestPerformanceWindow = ({ habits = [], streakMap = {} }) => {
  const buckets = {
    morning: { label: 'Morning', score: 0 },
    afternoon: { label: 'Afternoon', score: 0 },
    evening: { label: 'Evening', score: 0 }
  };

  habits.forEach((habit) => {
    const reminderTime = String(habit?.reminderTime || '').trim();
    if (!reminderTime) return;
    const hour = Number(reminderTime.split(':')[0] || 0);
    const bucket = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    buckets[bucket].score += Math.max(1, Number(streakMap?.[habit.id] || 0));
  });

  const ranked = Object.values(buckets).sort((a, b) => b.score - a.score);
  return ranked[0]?.score > 0 ? ranked[0].label : 'No signal yet';
};

export const deriveSmartNudge = ({ visibleHabits = [], streakMap = {}, weeklyConsistency = 0, moodScore = null, weatherInsight = '' }) => {
  if (visibleHabits.length === 0) {
    return 'Your board is clear. Lock in one tiny win and protect the streak.';
  }

  const rescueHabit = [...visibleHabits].sort((a, b) => Number(streakMap?.[b.id] || 0) - Number(streakMap?.[a.id] || 0))[0];
  const rescueStreak = Number(streakMap?.[rescueHabit?.id] || 0);

  if (moodScore !== null && moodScore <= 2) {
    return `Energy looks low today. Shrink "${rescueHabit?.name || 'one habit'}" to a 5-minute version instead of skipping it.`;
  }

  if (weeklyConsistency < 55) {
    return `Consistency dipped this week. Rescue "${rescueHabit?.name || 'your next habit'}" with the smallest possible version today.`;
  }

  if (rescueStreak >= 3) {
    return `Protect your ${rescueStreak}-day streak on "${rescueHabit.name}" with one quick action before the day ends.`;
  }

  if (weatherInsight) {
    return `${weatherInsight} Use that context to finish "${rescueHabit?.name || 'one habit'}" in the easiest environment available.`;
  }

  return `Do 5 focused minutes of "${rescueHabit?.name || 'your next habit'}" now to keep momentum alive.`;
};

export const deriveMoodCorrelation = ({ moodHistory = {}, trackingHistory = {}, habits = [] }) => {
  const moodMap = moodHistory || {};
  const trackedDates = Object.keys(moodMap).filter((key) => normalizeDateKey(key)).sort();
  if (trackedDates.length === 0 || habits.length === 0) {
    return { averageMoodOnTrackedDays: null, averageMoodOnWorkoutDays: null, happiestHabitDay: null };
  }

  const scoreByMood = MOOD_OPTIONS.reduce((acc, item) => {
    acc[item.value] = item.score;
    return acc;
  }, {});

  let totalMood = 0;
  let totalDays = 0;
  let activeMood = 0;
  let activeDays = 0;

  trackedDates.forEach((dateKey) => {
    const moodValue = String(moodMap[dateKey] || '').toLowerCase();
    const score = scoreByMood[moodValue];
    if (!score) return;
    totalMood += score;
    totalDays += 1;

    const tracking = trackingHistory[dateKey] || {};
    const completedCount = habits.filter((habit) => isTrackedComplete(tracking, habit.id)).length;
    if (completedCount > 0) {
      activeMood += score;
      activeDays += 1;
    }
  });

  return {
    averageMoodOnTrackedDays: totalDays ? Number((totalMood / totalDays).toFixed(1)) : null,
    averageMoodOnWorkoutDays: activeDays ? Number((activeMood / activeDays).toFixed(1)) : null,
    happiestHabitDay:
      activeDays && totalDays
        ? activeMood / activeDays >= totalMood / totalDays
          ? 'Mood trends better on days when you complete at least one habit.'
          : 'Mood is steadier when the day stays lighter.'
        : null
  };
};

export const normalizeMoodHistory = (history = {}) =>
  Object.entries(history || {}).reduce((acc, [key, value]) => {
    const normalizedKey = normalizeDateKey(key);
    if (!normalizedKey) return acc;
    acc[normalizedKey] = String(value || '').toLowerCase();
    return acc;
  }, {});

export const getRecentMood = (history = {}, dateKey = getDateString()) => {
  const value = String(history?.[dateKey] || '').toLowerCase();
  return MOOD_OPTIONS.find((item) => item.value === value) || null;
};

export const getDaysSinceBreak = ({ trackingHistory = {}, habitId }) => {
  if (!habitId) return null;
  const today = new Date();
  for (let i = 0; i < 30; i += 1) {
    const date = new Date(today.getTime() - i * DAY_MS);
    const key = getDateString(date);
    const record = trackingHistory[key];
    if (!record) continue;
    const status = getHabitStatus(record, habitId);
    if (status === 'completed') return i;
  }
  return null;
};

export const getHabitCompletionStats = ({ trackingHistory = {}, habitId, rangeDays = 14 }) => {
  if (!habitId) {
    return { completed: 0, skipped: 0, rescheduled: 0, pending: 0 };
  }

  const stats = { completed: 0, skipped: 0, rescheduled: 0, pending: 0 };
  for (let i = 0; i < rangeDays; i += 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = getDateString(date);
    const record = trackingHistory[key];
    if (!record) continue;
    const status = getHabitStatus(record, habitId);
    if (stats[status] !== undefined) {
      stats[status] += 1;
    }
  }
  return stats;
};

export const deriveAdaptiveMicroHabit = (habit = {}, trackingHistory = {}) => {
  const explicitMicro = String(habit?.microAction || '').trim();
  const baseMinutes = Math.max(1, Number(habit?.targetMinutes || 10));
  const stats = getHabitCompletionStats({ trackingHistory, habitId: habit?.id, rangeDays: 14 });
  const skipPressure = stats.skipped + stats.rescheduled;
  const adaptiveMinutes = skipPressure >= 4 ? Math.max(1, Math.round(baseMinutes * 0.25)) : skipPressure >= 2 ? Math.max(2, Math.round(baseMinutes * 0.5)) : baseMinutes;

  if (explicitMicro) {
    return {
      label: explicitMicro,
      minutes: adaptiveMinutes,
      adjusted: skipPressure >= 2
    };
  }

  return {
    label: `${adaptiveMinutes} minute version`,
    minutes: adaptiveMinutes,
    adjusted: skipPressure >= 2
  };
};

export const deriveHabitRisk = ({ habit = {}, trackingHistory = {}, streakMap = {} }) => {
  const stats = getHabitCompletionStats({ trackingHistory, habitId: habit?.id, rangeDays: 10 });
  const streak = Number(streakMap?.[habit?.id] || 0);
  const riskScore = stats.skipped * 2 + stats.rescheduled * 2 + stats.pending - Math.min(streak, 5);
  if (riskScore >= 5) return 'high';
  if (riskScore >= 2) return 'medium';
  return 'low';
};
